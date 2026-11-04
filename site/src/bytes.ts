/** The small helpers for bytes and sizes. */

/** This function gives one byte as two lowercase hex digits. */
export const hexOf = (value: number): string => value.toString(16).padStart(2, "0");

/** This function gives the bytes of a hex text. */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

/** This function gives the hex text of bytes. */
export const toHex = (bytes: Uint8Array): string => Array.from(bytes, hexOf).join("");

/** This function gives the byte at an offset, or 0 past the end. */
export const at = (bytes: Uint8Array, offset: number): number => bytes[offset] ?? 0;

/** This function tells if a byte is a printable ASCII character. */
export const isPrintable = (byte: number): boolean => byte >= 0x20 && byte <= 0x7e;

/** This function gives the character of a byte for the second line of a tile. A byte with no character gives a dot. */
export function charOf(byte: number): string {
  if (byte === 0x20) return "␣";
  return isPrintable(byte) ? String.fromCharCode(byte) : "·";
}

/** This function gives a part of the bytes as ASCII text. */
export const ascii = (bytes: Uint8Array, start: number, end: number): string => String.fromCharCode(...bytes.subarray(start, end));

/** This function tells if two byte arrays are equal. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
