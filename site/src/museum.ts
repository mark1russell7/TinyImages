/** This module has the exhibits of the page: the real bytes that the build read, and what the README tells of them. */
import { fromHex } from "./bytes.ts";

/** One file of the museum. */
export interface Exhibit {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** The blob id that git gives these bytes. */
  readonly blob: string;
}

/** This function gives the files of a museum from the smallest file to the largest, with the empty files last. */
export function exhibitsOf(data: typeof __MUSEUM__): Exhibit[] {
  const rank = (exhibit: Exhibit): number => (exhibit.bytes.length === 0 ? Number.MAX_SAFE_INTEGER : exhibit.bytes.length);
  return data.files.map((file) => ({ name: file.name, bytes: fromHex(file.hex), blob: file.blob })).sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : 1));
}

/** This function gives the blob type of an exhibit: the type that a server gives its extension. Other files get no type. */
export function mimeOf(name: string): string {
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".gif")) return "image/gif";
  return "";
}

/** One claim of the README. */
export interface Claim {
  readonly name: string;
  /** The size as the README writes it. */
  readonly size: string;
  /** The size in bytes. */
  readonly bytes: number;
  /** The text of the README for this file. */
  readonly note: string;
}

const UNITS: Readonly<Record<string, number>> = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };

const plain = (text: string): string => text.replaceAll("**", "").replaceAll("`", "").split("<br>").join(" ").replace(/\s+/g, " ").trim();

/** This function gives each file that the README lists, with its size: the rows of the tables and the lines of the F tier. */
export function readClaims(readme: string): Claim[] {
  const claims: Claim[] = [];
  const add = (name: string, size: string, note: string): void => {
    const found = /^([\d.]+)\s*(B|KB|MB|GB|TB)$/.exec(size.trim());
    if (found !== null) claims.push({ name, size: size.trim(), bytes: Number(found[1]) * (UNITS[found[2] ?? "B"] ?? 1), note: plain(note) });
  };
  for (const line of readme.split(/\r?\n/)) {
    if (line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      const name = /^\*\*\[(.+)\]\(.+\)\*\*$/.exec(cells[0] ?? "")?.[1];
      if (name === undefined) continue;
      const note = cells.slice(2).find((cell) => cell !== "" && !cell.startsWith("<img") && !/^[A-Z]+$/.test(cell)) ?? "";
      add(name, plain(cells[1] ?? ""), note);
    } else {
      const bullet = /^\*\s+\*\*(.+?) \((.+?)\):\*\*\s*(.*)$/.exec(line);
      if (bullet !== null) add(bullet[1] ?? "", bullet[2] ?? "", bullet[3] ?? "");
    }
  }
  return claims;
}

/** This function gives the data URL of the README, from its section "The Quine". */
export function quineUrl(readme: string): string | undefined {
  return /src="(data:[^"]+)"/.exec(readme)?.[1];
}

/** A file that a commit of the repository held. It is not at the root any more. */
export interface RetiredFile {
  readonly name: string;
  /** The real bytes of the file. */
  readonly hex: string;
  /** The commit that holds the file. */
  readonly commit: string;
}

/** The small tests that the history holds. The command `git show <commit>:<name>` gives each file. */
export const RETIRED: readonly RetiredFile[] = [
  { name: "4.svg", hex: "3c737667", commit: "4028751" },
  { name: "pixel.wbmp", hex: "0000010180", commit: "7626008" },
  { name: "risk.gif", hex: "47494638396101000100", commit: "7626008" },
  { name: "trailerless.gif", hex: "47494638396101000100000000", commit: "7626008" },
  { name: "p.gif", hex: "474946383961010001000000003b", commit: "7626008" },
  { name: "pixel.tga", hex: "000003000000000000000000010001000800ff", commit: "7626008" },
  { name: "tiny.gif", hex: "47494638396101000100002c0000000001000100000202440100", commit: "7626008" },
  { name: "pixel.bmp", hex: "424d1e000000000000001a0000000c0000000100010001001800ffffff00", commit: "7626008" },
];

/** The verdict of one row of the table of facts. */
export interface Fact {
  readonly name: string;
  readonly claimed: string;
  /** The text that tells what the repository holds. */
  readonly held: string;
  readonly state: "same" | "differs" | "no-entry" | "history";
}

/** This function compares the claims of the README with the real files and with the history. */
export function compareClaims(claims: readonly Claim[], files: readonly { readonly name: string; readonly bytes: Uint8Array }[]): Fact[] {
  const size = (count: number): string => `${count} B`;
  return claims.map((claim): Fact => {
    const file = files.find((item) => item.name === claim.name);
    if (file !== undefined) return { name: claim.name, claimed: claim.size, held: size(file.bytes.length), state: file.bytes.length === claim.bytes ? "same" : "differs" };
    const retired = RETIRED.find((item) => item.name === claim.name);
    if (retired !== undefined) return { name: claim.name, claimed: claim.size, held: `Not at the root. Commit ${retired.commit} has ${size(retired.hex.length / 2)}.`, state: "history" };
    return { name: claim.name, claimed: claim.size, held: "No entry in the repository", state: "no-entry" };
  });
}
