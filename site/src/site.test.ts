// The tests of the pure parts of the site, on the real files of the museum. No test here starts a browser.
import { describe, expect, it } from "vitest";
import { fromHex, toHex } from "./bytes.ts";
import { fromLabText, guessType, insertByte, removeByte, setByte, toLabText, typeFor } from "./edits.ts";
import { smallestLoaded, whySentence } from "./exhibits.ts";
import { withoutPalette } from "./lab.ts";
import { browserLabel, type LoadResult } from "./load.ts";
import { compareClaims, exhibitsOf, mimeOf, quineUrl, readClaims, RETIRED } from "./museum.ts";
import { decodeLzw, readGif } from "./parse/gif.ts";
import { findHiddenText, readBytes } from "./parse/index.ts";
import { readAnsi, readMarkup, readShell } from "./parse/text.ts";

const exhibits = exhibitsOf(__MUSEUM__);
const file = (name: string): Uint8Array => {
  const exhibit = exhibits.find((item) => item.name === name);
  if (exhibit === undefined) throw new Error(`no exhibit ${name}`);
  return exhibit.bytes;
};
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** This function asserts that the spans of a reading cover each byte once, in order. */
function expectCover(bytes: Uint8Array): void {
  const spans = readBytes(bytes).spans;
  let offset = 0;
  for (const span of spans) {
    expect(span.start).toBe(offset);
    expect(span.end).toBeGreaterThan(span.start);
    offset = span.end;
  }
  expect(offset).toBe(bytes.length);
}

describe("the files of the museum", () => {
  it("reads each file at the root and no file of the site", () => {
    expect(exhibits.map((item) => item.name).sort()).toEqual(["5.svg", "[U+202E]gnp.gif", "giant.img", "pixel.ansi", "pixel.gif", "runme.gif", "secret.gif", "void.svg"]);
  });

  it("keeps the real bytes and the blob ids of git", () => {
    expect(new TextDecoder().decode(file("5.svg"))).toBe("<svg>");
    expect(file("runme.gif")).toHaveLength(14);
    expect(file("giant.img")).toHaveLength(0);
    expect(exhibits.find((item) => item.name === "giant.img")?.blob).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });

  it("labels each byte of each file once", () => {
    for (const exhibit of exhibits) expectCover(exhibit.bytes);
    for (const retired of RETIRED) expectCover(fromHex(retired.hex));
  });

  it("labels each byte of each truncation of a file once", () => {
    for (const name of ["pixel.gif", "secret.gif", "runme.gif", "5.svg", "pixel.ansi"]) {
      const bytes = file(name);
      for (let size = 0; size <= bytes.length; size++) expectCover(bytes.subarray(0, size));
      for (let index = 0; index < bytes.length; index++) expectCover(removeByte(bytes, index));
    }
  });
});

describe("the GIF parser", () => {
  it("reads pixel.gif block by block", () => {
    const gif = readGif(file("pixel.gif"));
    expect(gif.version).toBe("89a");
    expect([gif.width, gif.height]).toEqual([1, 1]);
    expect(gif.palette.map((color) => [color.r, color.g, color.b])).toEqual([
      [255, 255, 255],
      [0, 0, 0],
    ]);
    expect(gif.complete).toBe(true);
    expect(gif.frames[0]?.pixels).toEqual([0]);
    expect(gif.frames[0]?.codes).toEqual(["clear", "0", "end"]);
    expect(gif.frames[0]?.clean).toBe(true);
    expect(gif.spans.find((span) => span.start <= 34 && span.end > 34)?.block).toBe("Trailer");
    expect(gif.spans.find((span) => span.start === 6)?.field).toBe("Canvas width");
    expect(gif.spans.find((span) => span.start === 10)?.meaning).toContain("2 colors");
  });

  it("reads runme.gif as a canvas with no image", () => {
    const gif = readGif(file("runme.gif"));
    expect([gif.width, gif.height]).toEqual([32, 35]);
    expect(gif.frames).toHaveLength(0);
    expect(gif.palette).toHaveLength(0);
    expect(gif.complete).toBe(true);
  });

  it("names the place where a broken file stops", () => {
    expect(readGif(fromHex("47494638396101000100")).stop).toContain("Flags");
    expect(readGif(fromHex("47494638396101000100000000")).stop).toContain("trailer");
    expect(readGif(fromHex("474946383961010001000000" + "00" + "ff")).stop).toContain("0xff");
    expect(readGif(fromHex("474946383961010001000000" + "00" + "ff")).spans.at(-1)?.kind).toBe("broken");
  });

  it("reads extensions and bytes after the trailer", () => {
    const comment = readGif(fromHex("474946383961010001000000" + "00" + "21fe03616263" + "00" + "3b" + "aabb"));
    expect(comment.comments).toEqual(["abc"]);
    expect(comment.complete).toBe(true);
    expect(comment.spans.at(-1)?.kind).toBe("extra");
  });

  it("decodes LZW data with a grown table", () => {
    expect(decodeLzw(2, [0x44, 0x01]).pixels).toEqual([0]);
    expect(decodeLzw(2, []).clean).toBe(false);
    expect(decodeLzw(0, [1]).clean).toBe(false);
    // A classic sample: 100 pixels of 4 colors in 22 bytes.
    const sample = fromHex("8c2d9987 2a1cdc33 a00275ec 95faa8de 608c0491 4c01".replaceAll(" ", ""));
    const decoded = decodeLzw(2, Array.from(sample));
    expect(decoded.clean).toBe(true);
    expect(decoded.pixels).toHaveLength(100);
  });
});

describe("the hidden text", () => {
  it("finds the text of secret.gif in the palette", () => {
    const bytes = file("secret.gif");
    expect(findHiddenText(bytes, readBytes(bytes))).toEqual({ text: "see me", start: 13, end: 19, place: "Global color table" });
  });

  it("finds no text in pixel.gif", () => {
    const bytes = file("pixel.gif");
    expect(findHiddenText(bytes, readBytes(bytes))).toBeUndefined();
  });

  it("finds text in a comment and after the trailer", () => {
    const comment = fromHex("474946383961010001000000" + "00" + "21fe03616263" + "00" + "3b");
    expect(findHiddenText(comment, readBytes(comment))?.text).toBe("abc");
    const tail = fromHex("474946383961010001000000" + "00" + "3b" + "68656c6c6f");
    expect(findHiddenText(tail, readBytes(tail))?.text).toBe("hello");
  });
});

describe("the text readers", () => {
  it("reads the SVG files", () => {
    expect(readBytes(file("5.svg")).format).toBe("Markup");
    expect(readMarkup(file("5.svg")).notes.join(" ")).toContain("stays open");
    expect(readMarkup(file("void.svg")).notes.join(" ")).not.toContain("stays open");
    expect(readMarkup(encode("<svg")).notes.join(" ")).toContain("no end byte");
    expect(readMarkup(encode('<svg xmlns="x"/>')).notes).toEqual([]);
  });

  it("reads pixel.ansi as one reversed cell with no reset", () => {
    const ansi = readAnsi(file("pixel.ansi"));
    expect(ansi.cells).toEqual([{ text: " ", reverse: true }]);
    expect(ansi.reverseLeftOn).toBe(true);
    expect(readAnsi(encode("\u001b[7m \u001b[0m")).reverseLeftOn).toBe(false);
  });

  it("splits runme.gif as a shell lexer does, and runs nothing", () => {
    const shell = readShell(file("runme.gif"));
    expect(shell.command).toBe("GIF89a");
    expect(shell.tokens.map((token) => token.kind)).toEqual(["word", "blank", "nul", "comment"]);
    expect(shell.nuls).toBe(5);
    expect(readShell(encode("a;b")).tokens.map((token) => token.kind)).toEqual(["word", "operator", "word"]);
  });

  it("does not pick a parser from a name", () => {
    expect(readBytes(new Uint8Array()).format).toBe("Empty");
    expect(readBytes(fromHex("0000030000")).format).toBe("Unknown");
    expect(readBytes(encode("  <svg>")).format).toBe("Markup");
    expect(readBytes(encode("GI")).format).toBe("Unknown");
  });
});

describe("the claims of the README", () => {
  const facts = compareClaims(readClaims(__MUSEUM__.readme), exhibits);
  const fact = (name: string) => facts.find((item) => item.name === name);

  it("reads each row and each line of the F tier", () => {
    expect(facts.map((item) => item.name).sort()).toEqual(["4.svg", "5.svg", "[U+202E]gnp.gif", "giant.img", "image.gif", "pixel.ansi", "pixel.gif", "pixel.tga", "risk.gif", "runme.gif", "secret.gif", "void.svg"]);
  });

  it("shows each difference", () => {
    expect(fact("giant.img")).toMatchObject({ claimed: "1 TB", held: "0 B", state: "differs" });
    expect(fact("image.gif")?.state).toBe("no-entry");
    expect(fact("4.svg")?.state).toBe("history");
    expect(fact("risk.gif")?.held).toContain("10 B");
    expect(fact("pixel.tga")?.held).toContain("19 B");
    expect(fact("runme.gif")).toMatchObject({ held: "14 B", state: "same" });
    expect(fact("5.svg")?.state).toBe("same");
  });

  it("finds the data URL of the Quine", () => {
    expect(quineUrl(__MUSEUM__.readme)).toBe("data:image/svg+xml;utf8,<svg>");
  });
});

describe("the edits of the lab", () => {
  it("removes, inserts and sets a byte", () => {
    const bytes = fromHex("0a0b0c");
    expect(toHex(removeByte(bytes, 1))).toBe("0a0c");
    expect(toHex(removeByte(bytes, 2))).toBe("0a0b");
    expect(toHex(insertByte(bytes, 1, 0xff))).toBe("0aff0b0c");
    expect(toHex(setByte(bytes, 0, 1))).toBe("010b0c");
    expect(toHex(bytes)).toBe("0a0b0c");
  });

  it("keeps each byte through the text form", () => {
    for (const exhibit of exhibits) expect(toHex(fromLabText(toLabText(exhibit.bytes)))).toBe(toHex(exhibit.bytes));
    const all = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(toHex(fromLabText(toLabText(all)))).toBe(toHex(all));
  });

  it("reads typed text as bytes", () => {
    expect(fromLabText("<svg")).toHaveLength(4);
    expect(fromLabText("\\x41")).toEqual(encode("A"));
    expect(fromLabText("\\\\x41")).toEqual(encode("\\x41"));
    expect(fromLabText("é")).toEqual(fromHex("c3a9"));
    expect(fromLabText("\\x4")).toEqual(encode("\\x4"));
  });

  it("picks a type from the bytes", () => {
    expect(guessType(encode("<svg"))).toBe("image/svg+xml");
    expect(guessType(encode("\n <svg"))).toBe("image/svg+xml");
    expect(guessType(encode("GIF"))).toBe("image/gif");
    expect(guessType(encode("IF8"))).toBe("");
    expect(typeFor("auto", encode("<svg"))).toBe("image/svg+xml");
    expect(typeFor("image/gif", encode("<svg"))).toBe("image/gif");
    expect(mimeOf("5.svg")).toBe("image/svg+xml");
    expect(mimeOf("giant.img")).toBe("");
  });

  it("removes the palette and leaves a GIF of 29 bytes", () => {
    const small = withoutPalette(file("pixel.gif"));
    expect(small).toHaveLength(29);
    const gif = readGif(small);
    expect(gif.palette).toHaveLength(0);
    expect(gif.complete).toBe(true);
    expect(gif.frames[0]?.pixels).toEqual([0]);
  });
});

describe("the words of the results", () => {
  const load = (state: LoadResult["state"]): LoadResult => ({ state, width: 1, height: 1, ms: 1, drawn: false, pixel: undefined, canvas: undefined });

  it("gives the smallest file that loaded", () => {
    const results = [
      { name: "big", size: 35, result: load("loaded") },
      { name: "small", size: 5, result: load("refused") },
      { name: "empty", size: 0, result: load("loaded") },
    ];
    expect(smallestLoaded(results)).toEqual({ name: "big", size: 35 });
    expect(smallestLoaded([])).toBeUndefined();
  });

  it("builds the sentence from the results", () => {
    const row = (text: string, namespace: boolean, loaded: boolean) => ({ text, namespace, loaded });
    const open = "<svg>";
    const closed = "<svg/>";
    expect(whySentence("B", [row(open, false, false), row(closed, false, false), row(open, true, false), row(closed, true, true)])).toContain("only the text");
    expect(whySentence("B", [row(open, false, false), row(closed, false, false), row(open, true, true), row(closed, true, true)])).toContain("without the xmlns");
    expect(whySentence("B", [row(open, false, false), row(closed, false, true), row(open, true, false), row(closed, true, true)])).toContain("without the closing");
    expect(whySentence("B", [row(open, false, true), row(closed, false, true), row(open, true, true), row(closed, true, true)])).toContain("all four");
    expect(whySentence("B", [row(open, false, false), row(closed, false, false), row(open, true, false), row(closed, true, false)])).toContain("refused all four");
    expect(whySentence("B", [row(open, true, true), row(closed, false, true), row(open, false, false), row(closed, true, false)])).toContain("2 of the four");
  });

  it("names a browser from its user agent text", () => {
    expect(browserLabel("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/140.0.0.0 Safari/537.36")).toBe("Headless Chrome 140");
    expect(browserLabel("Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0")).toBe("Edge 140");
    expect(browserLabel("Mozilla/5.0 Gecko/20100101 Firefox/141.0")).toBe("Firefox 141");
    expect(browserLabel("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1")).toBe("Safari 18");
    expect(browserLabel("curl")).toBe("this browser");
  });
});
