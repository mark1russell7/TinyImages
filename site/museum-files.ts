/**
 * The build reads the files of the museum from the root of the repository, so the page cannot go out of date. A new file
 * at the root becomes an exhibit with no change here.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** One file of the museum, as the build read it. */
export interface MuseumFile {
  /** The name of the file in the repository. */
  readonly name: string;
  /** The bytes of the file, as lowercase hex. */
  readonly hex: string;
  /** The blob id that git gives these bytes. */
  readonly blob: string;
}

/** The data of the build: the files and the text of the README. */
export interface MuseumData {
  readonly files: readonly MuseumFile[];
  readonly readme: string;
}

/** The files at the root that are not exhibits: the README and the files that build the site. */
const NOT_EXHIBITS: ReadonlySet<string> = new Set(["README.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "ste.config.json"]);

/** This function gives the blob id that git computes from the bytes of a file. */
export function gitBlobId(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** This function reads each exhibit and the README from the root of the repository. */
export function readMuseum(root: string): MuseumData {
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && !NOT_EXHIBITS.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const files = names.map((name): MuseumFile => {
    const bytes = readFileSync(join(root, name));
    return { name, hex: bytes.toString("hex"), blob: gitBlobId(bytes) };
  });
  return { files, readme: readFileSync(join(root, "README.md"), "utf8") };
}
