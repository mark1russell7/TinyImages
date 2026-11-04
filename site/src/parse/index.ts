/** This module reads any bytes. It picks the parser from the first bytes, not from the name of the file. */
import { ascii, at, isPrintable } from "../bytes.ts";
import { readGif, type GifReading } from "./gif.ts";
import type { Span } from "./span.ts";
import { readAnsi, readMarkup, type AnsiReading } from "./text.ts";

/** The result of `readBytes`. */
export interface Reading {
  /** The format that the first bytes give. */
  readonly format: "GIF" | "Markup" | "Terminal codes" | "Empty" | "Unknown";
  /** The label of each byte. */
  readonly spans: readonly Span[];
  /** A short text that tells what the parser found. */
  readonly summary: string;
  readonly notes: readonly string[];
  readonly gif?: GifReading;
  readonly ansi?: AnsiReading;
}

/** This function gives the text of a GIF reading. */
function gifSummary(gif: GifReading): string {
  const parts = [
    `GIF ${gif.version || "with no version"}`,
    `canvas ${gif.width} x ${gif.height}`,
    `${gif.palette.length} palette ${gif.palette.length === 1 ? "color" : "colors"}`,
    `${gif.frames.length} ${gif.frames.length === 1 ? "image" : "images"}`,
    gif.complete ? "a trailer" : "no trailer",
  ];
  return `${parts.join(", ")}.`;
}

/** This function labels each byte of a file. */
export function readBytes(bytes: Uint8Array): Reading {
  if (bytes.length === 0) return { format: "Empty", spans: [], summary: "This file has no bytes.", notes: [] };
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === "GIF") {
    const gif = readGif(bytes);
    return { format: "GIF", spans: gif.spans, summary: gifSummary(gif), notes: gif.stop === undefined ? [] : [gif.stop], gif };
  }
  if (at(bytes, 0) === 0x1b) {
    const ansi = readAnsi(bytes);
    const notes = ansi.reverseLeftOn ? ["The file does not reset the mode, so the swap of the colors stays on after it."] : [];
    return { format: "Terminal codes", spans: ansi.spans, summary: `Terminal codes that print ${ansi.cells.length} ${ansi.cells.length === 1 ? "cell" : "cells"}.`, notes, ansi };
  }
  const first = bytes.findIndex((byte) => byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d);
  if (first >= 0 && at(bytes, first) === 0x3c) {
    const markup = readMarkup(bytes);
    return { format: "Markup", spans: markup.spans, summary: "Text with tags.", notes: markup.notes };
  }
  const summary = "The parsers of this page do not know these first bytes.";
  return { format: "Unknown", spans: [{ start: 0, end: bytes.length, kind: "broken", block: "Unknown", field: "Unknown bytes", meaning: summary }], summary, notes: [] };
}

/** Text that a file hides in the bytes of a format. */
export interface HiddenText {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** The part of the format that holds the text. */
  readonly place: string;
}

/** The length of the shortest run of printable bytes that counts as hidden text. */
const MIN_RUN = 4;

/** This function gives the first long printable run in a range of bytes. */
function printableRun(bytes: Uint8Array, from: number, to: number): { start: number; end: number } | undefined {
  let start = from;
  for (let offset = from; offset <= to; offset++) {
    if (offset < to && isPrintable(at(bytes, offset))) continue;
    if (offset - start >= MIN_RUN) return { start, end: offset };
    start = offset + 1;
  }
  return undefined;
}

/** This function looks for text in the color tables of a GIF, in the bytes after the trailer, and in the comments. */
export function findHiddenText(bytes: Uint8Array, reading: Reading): HiddenText | undefined {
  for (const kind of ["palette", "extra"] as const) {
    const parts = reading.spans.filter((span) => span.kind === kind);
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first === undefined || last === undefined) continue;
    const run = printableRun(bytes, first.start, last.end);
    if (run !== undefined) return { ...run, text: ascii(bytes, run.start, run.end), place: first.block };
  }
  const comment = reading.spans.find((span) => span.block === "Comment extension" && span.field === "Data");
  if (comment !== undefined) return { start: comment.start, end: comment.end, text: ascii(bytes, comment.start, comment.end), place: comment.block };
  return undefined;
}
