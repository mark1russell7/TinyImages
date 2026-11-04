/**
 * This module is a small GIF block parser. It walks the real bytes of a file and labels each byte. The labels are the header,
 * the logical screen descriptor, the color tables, the images, the extensions and the trailer. It stops at the first broken byte.
 */
import { ascii, at, hexOf, isPrintable } from "../bytes.ts";
import type { Span, SpanKind } from "./span.ts";

/** One color of a color table. */
export interface GifColor {
  readonly index: number;
  /** The offset of the red byte. */
  readonly offset: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** One image of a file. */
export interface GifFrame {
  readonly width: number;
  readonly height: number;
  /** The names of the LZW codes in the file. */
  readonly codes: readonly string[];
  /** The palette index of each pixel that the LZW data gives. */
  readonly pixels: readonly number[];
  /** The value is true when the LZW data ends with the end code. */
  readonly clean: boolean;
}

/** The result of `readGif`. */
export interface GifReading {
  readonly spans: readonly Span[];
  readonly version: string;
  readonly width: number;
  readonly height: number;
  /** The global color table. */
  readonly palette: readonly GifColor[];
  readonly frames: readonly GifFrame[];
  /** The text of the comment extensions. */
  readonly comments: readonly string[];
  /** The value is true when the parser reached the trailer byte. */
  readonly complete: boolean;
  /** The reason why the parser stopped early. */
  readonly stop: string | undefined;
}

/** The result of `decodeLzw`. */
export interface LzwResult {
  readonly codes: readonly string[];
  readonly pixels: readonly number[];
  readonly clean: boolean;
}

/** The maximum number of pixels that the decoder keeps. A visitor can give any bytes to the lab. */
const MAX_PIXELS = 4096;

/** The maximum number of codes that the decoder keeps for the label. */
const MAX_CODES = 24;

/** This function decodes GIF LZW data. It gives the palette index of each pixel and the name of each code. */
export function decodeLzw(minimumCodeSize: number, data: readonly number[]): LzwResult {
  const codes: string[] = [];
  const pixels: number[] = [];
  if (minimumCodeSize < 1 || minimumCodeSize > 11) return { codes, pixels, clean: false };
  const clear = 1 << minimumCodeSize;
  const end = clear + 1;
  const name = (text: string): void => {
    if (codes.length < MAX_CODES) codes.push(text);
  };
  const fresh = (): number[][] => Array.from({ length: end + 1 }, (_, index) => (index < clear ? [index] : []));
  let table = fresh();
  let width = minimumCodeSize + 1;
  let previous: number[] | undefined;
  let buffer = 0;
  let count = 0;
  let position = 0;
  for (;;) {
    while (count < width) {
      if (position >= data.length) return { codes, pixels, clean: false };
      buffer |= (data[position] ?? 0) << count;
      position += 1;
      count += 8;
    }
    const code = buffer & ((1 << width) - 1);
    buffer >>>= width;
    count -= width;
    if (code === clear) {
      name("clear");
      table = fresh();
      width = minimumCodeSize + 1;
      previous = undefined;
      continue;
    }
    if (code === end) {
      name("end");
      return { codes, pixels, clean: true };
    }
    const known = table[code];
    let entry: number[];
    if (known !== undefined && known.length > 0) entry = known;
    else if (previous !== undefined && code === table.length) entry = [...previous, previous[0] ?? 0];
    else return { codes, pixels, clean: false };
    name(String(code));
    for (const pixel of entry) if (pixels.length < MAX_PIXELS) pixels.push(pixel);
    if (previous !== undefined && table.length < 4096) {
      table.push([...previous, entry[0] ?? 0]);
      if (table.length === 1 << width && width < 12) width += 1;
    }
    previous = entry;
  }
}

/** The names of the GIF extension labels. */
const EXTENSIONS: Readonly<Record<number, string>> = {
  0xf9: "Graphic control extension",
  0xfe: "Comment extension",
  0x01: "Plain text extension",
  0xff: "Application extension",
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** This function walks the blocks of a GIF file and labels each byte. */
export function readGif(bytes: Uint8Array): GifReading {
  const spans: Span[] = [];
  const palette: GifColor[] = [];
  const frames: GifFrame[] = [];
  const comments: string[] = [];
  let offset = 0;
  let stop: string | undefined;
  let complete = false;
  let width = 0;
  let height = 0;
  let version = "";

  const word = (start: number): number => at(bytes, start) | (at(bytes, start + 1) << 8);
  const push = (end: number, kind: SpanKind, block: string, field: string, meaning: string): void => {
    spans.push({ start: offset, end, kind, block, field, meaning });
    offset = end;
  };
  /** This function labels the rest of the file as broken and stops the walk. */
  const halt = (block: string, field: string, reason: string): void => {
    stop = reason;
    if (offset < bytes.length) push(bytes.length, "broken", block, field, reason);
  };
  /** This function labels a field. It stops the walk when the file ends inside the field. */
  const take = (length: number, kind: SpanKind, block: string, field: string, meaning: (start: number) => string): boolean => {
    const left = bytes.length - offset;
    if (left < length) {
      halt(block, field, `The field "${field}" needs ${plural(length, "byte")}, and the file has only ${plural(left, "byte")} left.`);
      return false;
    }
    push(offset + length, kind, block, field, meaning(offset));
    return true;
  };
  /** This function reads a color table of `count` entries. */
  const colors = (count: number, block: string, target: GifColor[] | undefined): boolean => {
    for (let index = 0; index < count; index++) {
      const ok = take(3, "palette", block, `Color ${index}`, (start) => {
        const [r, g, b] = [at(bytes, start), at(bytes, start + 1), at(bytes, start + 2)];
        target?.push({ index, offset: start, r, g, b });
        const text = [r, g, b].every(isPrintable) ? ` As text, these bytes read "${ascii(bytes, start, start + 3)}".` : "";
        return `Red ${r}, green ${g}, blue ${b}.${text}`;
      });
      if (!ok) return false;
    }
    return true;
  };
  /** This function reads data sub-blocks and gives their bytes. */
  const subBlocks = (kind: SpanKind, block: string): number[] | undefined => {
    const data: number[] = [];
    for (;;) {
      if (offset >= bytes.length) {
        halt(block, "Block size", "The file ends before the block terminator.");
        return undefined;
      }
      const size = at(bytes, offset);
      if (size === 0) {
        take(1, kind, block, "Block terminator", () => "A size of 0 ends the data of this block.");
        return data;
      }
      take(1, kind, block, "Block size", () => `The next ${plural(size, "byte")} are data.`);
      const ok = take(size, kind, block, "Data", (start) => {
        data.push(...bytes.subarray(start, start + size));
        return `${plural(size, "byte")} of data.`;
      });
      if (!ok) return undefined;
    }
  };
  /** This function reads an image: the descriptor, the local color table and the LZW data. */
  const image = (): boolean => {
    const block = "Image descriptor";
    let frameWidth = 0;
    let frameHeight = 0;
    let local = 0;
    let minimum = 0;
    const fields =
      take(1, "image", block, "Separator", () => "The byte 0x2C starts an image.") &&
      take(2, "image", block, "Left", (start) => `The image starts ${word(start)} pixels from the left.`) &&
      take(2, "image", block, "Top", (start) => `The image starts ${word(start)} pixels from the top.`) &&
      take(2, "image", block, "Width", (start) => {
        frameWidth = word(start);
        return `The image is ${plural(frameWidth, "pixel")} wide.`;
      }) &&
      take(2, "image", block, "Height", (start) => {
        frameHeight = word(start);
        return `The image is ${plural(frameHeight, "pixel")} high.`;
      }) &&
      take(1, "image", block, "Flags", (start) => {
        const flags = at(bytes, start);
        local = flags & 0x80 ? 2 << (flags & 7) : 0;
        return local > 0 ? `This image has its own color table of ${local} colors.` : "This image has no color table of its own.";
      });
    if (!fields) return false;
    if (local > 0 && !colors(local, "Local color table", undefined)) return false;
    const sized = take(1, "pixels", "Image data", "LZW minimum code size", (start) => {
      minimum = at(bytes, start);
      return `The LZW codes start at ${minimum + 1} bits.`;
    });
    if (!sized) return false;
    const data = subBlocks("pixels", "Image data");
    if (data === undefined) return false;
    frames.push({ width: frameWidth, height: frameHeight, ...decodeLzw(minimum, data) });
    return true;
  };
  /** This function reads an extension of any label. */
  const extension = (): boolean => {
    let block = "Extension";
    let label = 0;
    const named =
      take(1, "extension", block, "Introducer", () => "The byte 0x21 starts an extension.") &&
      take(1, "extension", block, "Label", (start) => {
        label = at(bytes, start);
        block = EXTENSIONS[label] ?? `Extension 0x${hexOf(label)}`;
        return `This extension is a ${block.toLowerCase()}.`;
      });
    if (!named) return false;
    const data = subBlocks("extension", block);
    if (data === undefined) return false;
    if (label === 0xfe) comments.push(String.fromCharCode(...data));
    return true;
  };
  /** This function reads the fixed part of the file, up to the first block. */
  const opening = (): boolean => {
    const header = "Header";
    const screen = "Logical screen descriptor";
    let globals = 0;
    const fields =
      take(3, "header", header, "Signature", (start) => `The letters "${ascii(bytes, start, start + 3)}" name the format.`) &&
      take(3, "header", header, "Version", (start) => {
        version = ascii(bytes, start, start + 3);
        return `The version text is "${version}".`;
      }) &&
      take(2, "screen", screen, "Canvas width", (start) => {
        width = word(start);
        return `The canvas is ${plural(width, "pixel")} wide. The low byte comes first.`;
      }) &&
      take(2, "screen", screen, "Canvas height", (start) => {
        height = word(start);
        return `The canvas is ${plural(height, "pixel")} high. The low byte comes first.`;
      }) &&
      take(1, "screen", screen, "Flags", (start) => {
        const flags = at(bytes, start);
        globals = flags & 0x80 ? 2 << (flags & 7) : 0;
        return globals > 0 ? `The high bit is 1, so a global color table of ${globals} colors comes next.` : "The high bit is 0, so this file has no global color table.";
      }) &&
      take(1, "screen", screen, "Background color", (start) => `The background is palette color ${at(bytes, start)}.`) &&
      take(1, "screen", screen, "Pixel aspect ratio", (start) => (at(bytes, start) === 0 ? "A value of 0 gives no ratio." : `The ratio value is ${at(bytes, start)}.`));
    return fields && (globals === 0 || colors(globals, "Global color table", palette));
  };
  /** This function reads the blocks after the fixed part, up to the trailer. */
  const blocks = (): void => {
    for (;;) {
      if (offset >= bytes.length) {
        stop = "The file ends before the trailer byte 0x3B.";
        return;
      }
      const introducer = at(bytes, offset);
      if (introducer === 0x3b) {
        take(1, "trailer", "Trailer", "Trailer", () => "The byte 0x3B ends the file.");
        complete = true;
        if (offset < bytes.length) push(bytes.length, "extra", "After the trailer", "Extra bytes", "A GIF reader stops at the trailer, so it does not read these bytes.");
        return;
      }
      if (introducer !== 0x2c && introducer !== 0x21) {
        halt("Unknown block", "Unknown byte", `The byte 0x${hexOf(introducer)} starts no block. A GIF block starts with 0x2C, 0x21 or 0x3B.`);
        return;
      }
      if (!(introducer === 0x2c ? image() : extension())) return;
    }
  };

  if (opening()) blocks();
  return { spans, version, width, height, palette, frames, comments, complete, stop };
}
