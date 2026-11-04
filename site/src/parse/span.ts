/** The result type of each parser of the page. */

/** The kind of a part of a file. A kind gives the color of a tile. */
export type SpanKind = "header" | "screen" | "palette" | "image" | "extension" | "pixels" | "trailer" | "tag" | "control" | "text" | "extra" | "broken";

/** A run of bytes with one meaning. The spans of a file cover each byte once. */
export interface Span {
  /** The offset of the first byte. */
  readonly start: number;
  /** The offset after the last byte. */
  readonly end: number;
  readonly kind: SpanKind;
  /** The part of the format, for example "Logical screen descriptor". */
  readonly block: string;
  /** The field in that part, for example "Canvas width". */
  readonly field: string;
  /** The text that tells what these bytes do in this file. */
  readonly meaning: string;
}
