/** This module has the pure edits of the shrink lab and the text form of its bytes. */
import { hexOf, isPrintable } from "./bytes.ts";

/** This function gives the bytes without the byte at an index. */
export function removeByte(bytes: Uint8Array, index: number): Uint8Array {
  const next = new Uint8Array(Math.max(0, bytes.length - 1));
  next.set(bytes.subarray(0, index));
  next.set(bytes.subarray(index + 1), index);
  return next;
}

/** This function gives the bytes with a new byte before an index. */
export function insertByte(bytes: Uint8Array, index: number, value: number): Uint8Array {
  const next = new Uint8Array(bytes.length + 1);
  next.set(bytes.subarray(0, index));
  next[index] = value;
  next.set(bytes.subarray(index), index + 1);
  return next;
}

/** This function gives the bytes with a new value at an index. */
export function setByte(bytes: Uint8Array, index: number, value: number): Uint8Array {
  const next = new Uint8Array(bytes);
  next[index] = value;
  return next;
}

/** This function gives the text form of bytes: ASCII as it is, a backslash as two backslashes, and each other byte as \xNN. */
export function toLabText(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    if (byte === 0x5c) text += "\\\\";
    else if (isPrintable(byte)) text += String.fromCharCode(byte);
    else text += `\\x${hexOf(byte)}`;
  }
  return text;
}

/** This function gives the bytes of a text form. A character outside ASCII gives its UTF-8 bytes. */
export function fromLabText(text: string): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index, index + 4);
    const escape = /^\\x([0-9a-fA-F]{2})/.exec(rest);
    if (escape !== null) {
      bytes.push(Number.parseInt(escape[1] ?? "0", 16));
      index += 4;
    } else if (rest.startsWith("\\\\")) {
      bytes.push(0x5c);
      index += 2;
    } else {
      const char = String.fromCodePoint(text.codePointAt(index) ?? 0);
      bytes.push(...encoder.encode(char));
      index += char.length;
    }
  }
  return new Uint8Array(bytes);
}

/** The value of the type list that picks the type from the bytes. */
export const AUTO_TYPE = "auto";

/** This function gives the blob type for bytes: SVG for a first `<`, GIF for `GIF`, and no type for other bytes. */
export function guessType(bytes: Uint8Array): string {
  const first = bytes.findIndex((byte) => byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d);
  if (first >= 0 && bytes[first] === 0x3c) return "image/svg+xml";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  return "";
}

/** This function gives the blob type for a setting of the type list. */
export const typeFor = (setting: string, bytes: Uint8Array): string => (setting === AUTO_TYPE ? guessType(bytes) : setting);
