/**
 * This module has small readers for the files that are text: SVG markup, terminal codes and the text that a shell reads. Each
 * reader only labels bytes. No reader starts a parser of the browser or a shell.
 */
import { ascii, at, hexOf, isPrintable } from "../bytes.ts";
import type { Span } from "./span.ts";

const SPACE: ReadonlySet<number> = new Set([0x20, 0x09, 0x0a, 0x0d]);

const isNameByte = (byte: number): boolean => (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x30 && byte <= 0x39) || byte === 0x3a || byte === 0x2d;

/** The result of `readMarkup`. */
export interface MarkupReading {
  readonly spans: readonly Span[];
  /** The sentences that tell what the shape of the tags gives. */
  readonly notes: readonly string[];
}

/** This function labels the bytes of a text with tags. */
export function readMarkup(bytes: Uint8Array): MarkupReading {
  const spans: Span[] = [];
  const add = (start: number, end: number, kind: Span["kind"], field: string, meaning: string): void => {
    spans.push({ start, end, kind, block: "Markup", field, meaning });
  };
  let offset = 0;
  let open = 0;
  let unfinished = false;
  let namespace = false;
  let tags = 0;
  while (offset < bytes.length) {
    if (at(bytes, offset) !== 0x3c) {
      const start = offset;
      while (offset < bytes.length && at(bytes, offset) !== 0x3c) offset += 1;
      add(start, offset, "text", "Text", "These bytes are outside a tag.");
      continue;
    }
    tags += 1;
    add(offset, offset + 1, "tag", "Tag start", "The byte < starts a tag.");
    offset += 1;
    const closing = offset < bytes.length && at(bytes, offset) === 0x2f;
    if (closing) {
      add(offset, offset + 1, "tag", "Closing slash", "The slash makes this tag a closing tag.");
      offset += 1;
    }
    const nameStart = offset;
    while (offset < bytes.length && isNameByte(at(bytes, offset))) offset += 1;
    if (offset > nameStart) add(nameStart, offset, "tag", "Tag name", `The tag name is "${ascii(bytes, nameStart, offset)}".`);
    let ended = false;
    let selfClosed = false;
    while (offset < bytes.length && !ended) {
      const byte = at(bytes, offset);
      if (byte === 0x3e) {
        add(offset, offset + 1, "tag", "Tag end", "The byte > ends the tag.");
        offset += 1;
        ended = true;
      } else if (byte === 0x2f && at(bytes, offset + 1) === 0x3e) {
        add(offset, offset + 1, "tag", "Self-closing slash", "The slash closes this element in the same tag.");
        offset += 1;
        selfClosed = true;
      } else {
        const start = offset;
        while (offset < bytes.length && at(bytes, offset) !== 0x3e && !(at(bytes, offset) === 0x2f && at(bytes, offset + 1) === 0x3e)) offset += 1;
        const text = ascii(bytes, start, offset);
        if (text.includes("xmlns")) namespace = true;
        add(start, offset, "extra", "Attributes", text.trim() === "" ? "These bytes are spaces in the tag." : `The attribute text is "${text.trim()}".`);
      }
    }
    if (!ended) unfinished = true;
    if (closing) open -= 1;
    else if (ended && !selfClosed) open += 1;
  }
  const notes: string[] = [];
  if (unfinished) notes.push("The last tag has no end byte >.");
  else if (open > 0) notes.push("An element stays open. An HTML parser closes it. An XML parser does not.");
  if (!namespace) notes.push("The text has no xmlns attribute, so an XML parser does not put the element in the SVG namespace.");
  return { spans, notes };
}

/** One character cell that a terminal prints. */
export interface TerminalCell {
  readonly text: string;
  readonly reverse: boolean;
}

/** The result of `readAnsi`. */
export interface AnsiReading {
  readonly spans: readonly Span[];
  readonly cells: readonly TerminalCell[];
  /** The value is true when the reverse mode stays on at the end of the file. */
  readonly reverseLeftOn: boolean;
}

/** The names of some SGR parameters. */
const SGR: Readonly<Record<string, string>> = {
  "0": "resets all modes",
  "1": "turns on bold",
  "4": "turns on the underline",
  "7": "swaps the foreground color and the background color",
  "27": "ends the swap of the colors",
};

/** This function labels terminal escape codes and gives the cells that a terminal prints. It does not write to a terminal. */
export function readAnsi(bytes: Uint8Array): AnsiReading {
  const spans: Span[] = [];
  const cells: TerminalCell[] = [];
  const code = (start: number, end: number, field: string, meaning: string): void => {
    spans.push({ start, end, kind: "control", block: "Escape code", field, meaning });
  };
  let reverse = false;
  let offset = 0;
  while (offset < bytes.length) {
    const byte = at(bytes, offset);
    if (byte !== 0x1b) {
      spans.push({ start: offset, end: offset + 1, kind: "text", block: "Printed text", field: "Character", meaning: "The terminal prints this character at the cursor." });
      cells.push({ text: isPrintable(byte) ? String.fromCharCode(byte) : " ", reverse });
      offset += 1;
      continue;
    }
    code(offset, offset + 1, "Escape", "The byte 0x1B starts a terminal code.");
    offset += 1;
    if (offset >= bytes.length || at(bytes, offset) !== 0x5b) continue;
    code(offset, offset + 1, "Bracket", "The byte [ starts a control sequence.");
    offset += 1;
    const start = offset;
    while (offset < bytes.length && at(bytes, offset) >= 0x30 && at(bytes, offset) <= 0x3f) offset += 1;
    const parameter = ascii(bytes, start, offset);
    if (offset > start) code(start, offset, "Parameter", `The parameter ${parameter} ${SGR[parameter] ?? "has no name on this page"}.`);
    if (offset >= bytes.length) continue;
    const final = at(bytes, offset);
    code(offset, offset + 1, "Final byte", final === 0x6d ? "The byte m applies the parameter to the next characters." : "This byte ends the control sequence.");
    offset += 1;
    if (final !== 0x6d) continue;
    if (parameter === "7") reverse = true;
    if (parameter === "27" || parameter === "0" || parameter === "") reverse = false;
  }
  return { spans, cells, reverseLeftOn: reverse };
}

/** One part of the text that a shell reads. */
export interface ShellToken {
  readonly kind: "word" | "blank" | "nul" | "comment" | "operator";
  readonly start: number;
  readonly end: number;
  /** The text of the bytes, with a visible mark for a NUL byte. */
  readonly text: string;
}

/** The result of `readShell`. */
export interface ShellReading {
  readonly tokens: readonly ShellToken[];
  /** The first word, which is the command. */
  readonly command: string | undefined;
  /** The number of NUL bytes. */
  readonly nuls: number;
}

const OPERATORS: ReadonlySet<number> = new Set([0x3b, 0x26, 0x7c, 0x3c, 0x3e, 0x28, 0x29]);

const visible = (bytes: Uint8Array, start: number, end: number): string =>
  Array.from(bytes.subarray(start, end), (byte) => (byte === 0 ? "␀" : isPrintable(byte) ? String.fromCharCode(byte) : `\\x${hexOf(byte)}`)).join("");

/**
 * This function splits bytes as the lexer of a POSIX shell splits a line: words, blanks, operators and comments. It starts no
 * shell. A NUL byte is its own token.
 */
export function readShell(bytes: Uint8Array): ShellReading {
  const tokens: ShellToken[] = [];
  const add = (kind: ShellToken["kind"], start: number, end: number): void => {
    tokens.push({ kind, start, end, text: visible(bytes, start, end) });
  };
  let offset = 0;
  let nuls = 0;
  while (offset < bytes.length) {
    const byte = at(bytes, offset);
    const start = offset;
    if (byte === 0) {
      nuls += 1;
      offset += 1;
      add("nul", start, offset);
    } else if (SPACE.has(byte)) {
      while (offset < bytes.length && SPACE.has(at(bytes, offset))) offset += 1;
      add("blank", start, offset);
    } else if (byte === 0x23) {
      while (offset < bytes.length && at(bytes, offset) !== 0x0a) {
        if (at(bytes, offset) === 0) nuls += 1;
        offset += 1;
      }
      add("comment", start, offset);
    } else if (OPERATORS.has(byte)) {
      offset += 1;
      add("operator", start, offset);
    } else {
      while (offset < bytes.length && at(bytes, offset) !== 0 && !SPACE.has(at(bytes, offset)) && !OPERATORS.has(at(bytes, offset))) offset += 1;
      add("word", start, offset);
    }
  }
  return { tokens, command: tokens.find((token) => token.kind === "word")?.text, nuls };
}
