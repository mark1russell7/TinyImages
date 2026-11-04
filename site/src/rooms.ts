/** This module fills the side rooms: the hidden text, the polyglot, the reversed name, the terminal cell and the empty frames. */
import { byId, h } from "@mark1russell7/site-pages/chrome";
import { byteView } from "./byteview.ts";
import { loadBytes } from "./load.ts";
import type { Exhibit } from "./museum.ts";
import { findHiddenText, readBytes } from "./parse/index.ts";
import type { GifColor } from "./parse/gif.ts";
import { readShell, type ShellToken } from "./parse/text.ts";

const named = (exhibits: readonly Exhibit[], name: string): Exhibit | undefined => exhibits.find((exhibit) => exhibit.name === name);

/** This function draws the palette of a GIF as swatches. */
function swatches(name: string, colors: readonly GifColor[], bytes: Uint8Array): HTMLElement {
  return h(
    "div",
    { class: "palette", "data-palette": name },
    h("h4", {}, name),
    colors.map((color) => {
      const text = Array.from(bytes.subarray(color.offset, color.offset + 3), (byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "·")).join("");
      return h(
        "div",
        { class: "swatch" },
        h("span", { class: "chip-color", style: `background: rgb(${color.r} ${color.g} ${color.b})` }),
        h("span", {}, `Color ${color.index}: ${color.r}, ${color.g}, ${color.b}. As text: `, h("code", { class: "keep-spaces" }, text)),
      );
    }),
  );
}

/** This function draws the room of `secret.gif`. The button starts the search on the real bytes of two files. */
function secretRoom(exhibits: readonly Exhibit[]): void {
  const secret = named(exhibits, "secret.gif");
  const pixel = named(exhibits, "pixel.gif");
  const button = byId<HTMLButtonElement>("secret-reveal");
  const output = byId("secret-result");
  if (secret === undefined || pixel === undefined) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", () => {
    void (async () => {
      const reading = readBytes(secret.bytes);
      const found = findHiddenText(secret.bytes, reading);
      const control = findHiddenText(pixel.bytes, readBytes(pixel.bytes));
      const drawn = await loadBytes(secret.bytes, "image/gif", { paint: true });
      const first = reading.gif?.palette[0];
      output.replaceChildren(
        found === undefined
          ? h("p", {}, "The search found no text.")
          : h("p", { class: "reveal" }, "The hidden text is ", h("strong", { id: "secret-text" }, found.text), `. It is in bytes ${found.start} to ${found.end - 1}, in the ${found.place.toLowerCase()}.`),
        h("p", {}, control === undefined ? "The same search on pixel.gif finds no text." : `The same search on pixel.gif finds "${control.text}".`),
        h("div", { class: "pair" }, swatches("pixel.gif", readBytes(pixel.bytes).gif?.palette ?? [], pixel.bytes), swatches("secret.gif", reading.gif?.palette ?? [], secret.bytes)),
        drawn.pixel === undefined || first === undefined
          ? h("p", {}, "This browser gave no pixel from the canvas.")
          : h(
              "p",
              { id: "secret-pixel", "data-rgb": drawn.pixel.slice(0, 3).join(","), "data-palette": `${first.r},${first.g},${first.b}` },
              `Your browser draws the one pixel as red ${drawn.pixel[0]}, green ${drawn.pixel[1]}, blue ${drawn.pixel[2]}. So the first three letters are a visible color.`,
            ),
      );
    })();
  });
}

/** The words for each kind of shell token. */
const TOKEN_WORDS: Readonly<Record<ShellToken["kind"], string>> = {
  word: "A word. The first word is the command name.",
  blank: "A space between words.",
  nul: "A NUL byte. Shells do not agree on this byte.",
  comment: "A comment. The # hides the rest of the line.",
  operator: "An operator.",
};

/** This function draws the room of `runme.gif`. */
function polyglotRoom(exhibits: readonly Exhibit[]): void {
  const runme = named(exhibits, "runme.gif");
  if (runme === undefined) return;
  const reading = readBytes(runme.bytes);
  byteView(byId("poly-tiles"), byId("poly-detail"), runme.bytes, reading);
  const shell = readShell(runme.bytes);
  byId("poly-shell").replaceChildren(
    ...shell.tokens.map((token) => h("li", { "data-kind": token.kind }, h("code", { class: "keep-spaces" }, token.text), ` ${TOKEN_WORDS[token.kind]}`)),
  );
  const frames = reading.gif?.frames.length ?? 0;
  byId("poly-note").textContent = `The command name is ${shell.command ?? "absent"}, and the comment hides all other text. The file has ${shell.nuls} NUL bytes and ${frames} GIF images. The canvas size is ${reading.gif?.width ?? 0} x ${reading.gif?.height ?? 0}.`;
}

/** The right-to-left override character. It is in this file only as an escape. */
const OVERRIDE = "‮";

/** This function draws the room of the name. The real character stays inside a `bdi` element, so the text around it keeps its order. */
function nameRoom(exhibits: readonly Exhibit[]): void {
  const file = exhibits.find((exhibit) => exhibit.name.endsWith("gnp.gif"));
  const fileName = file?.name ?? "[U+202E]gnp.gif";
  const real = fileName.includes(OVERRIDE);
  byId("name-fact").append(
    "The name in the repository is ",
    h("code", {}, fileName),
    real ? ". It holds the real override character." : `. It has ${fileName.length} plain ASCII characters, so the override never takes effect in a file list. The real character gives the result below.`,
  );
  const demo = `${OVERRIDE}gnp.gif`;
  byId("name-demo").append(h("span", { id: "name-before" }, "A file list shows"), " ", h("bdi", { id: "name-bdi" }, demo), " ", h("span", { id: "name-after" }, "with the letters reversed."));
  const points = Array.from(demo, (char) => (char === OVERRIDE ? "U+202E" : char)).join(" ");
  byId("name-points").append("The stored order is ", h("code", {}, points), ". The override reverses only the display of these letters, inside its isolate.");
}

/** This function draws the room of `pixel.ansi`. */
function ansiRoom(exhibits: readonly Exhibit[]): void {
  const ansi = named(exhibits, "pixel.ansi");
  if (ansi === undefined) return;
  const reading = readBytes(ansi.bytes);
  byteView(byId("ansi-tiles"), byId("ansi-detail"), ansi.bytes, reading);
  const cells = reading.ansi?.cells ?? [];
  const terminal = (theme: string, label: string): HTMLElement =>
    h(
      "figure",
      { class: "terminal-figure" },
      h("div", { class: `terminal ${theme}`, role: "img", "aria-label": `${label}. The cell shows the swapped colors.` }, h("span", { class: "prompt" }, "$"), cells.map((cell) => h("span", { class: cell.reverse ? "cell reverse" : "cell", "data-reverse": String(cell.reverse) }, cell.text))),
      h("figcaption", {}, label),
    );
  byId("ansi-terminals").replaceChildren(terminal("dark", "A dark terminal theme"), terminal("light", "A light terminal theme"));
  byId("ansi-note").textContent = `The result is ${cells.length} character ${cells.length === 1 ? "cell" : "cells"}, not a pixel, and its color comes from the theme of the terminal. ${reading.notes.join(" ")}`;
}

/** This function draws the two entries with no bytes. */
function emptyRoom(exhibits: readonly Exhibit[]): void {
  const giant = named(exhibits, "giant.img");
  const frame = (title: string, id: string, ...text: (string | HTMLElement)[]): HTMLElement =>
    h("div", { class: "empty-exhibit", id }, h("div", { class: "empty-frame", "aria-hidden": "true" }), h("h4", {}, title), h("p", {}, ...text));
  byId("empty-frames").replaceChildren(
    frame(
      "giant.img",
      "empty-giant",
      giant === undefined ? "The repository has no such file." : `The README says 1 TB. The repository has ${giant.bytes.length} bytes, with blob id ${giant.blob.slice(0, 7)}, the id of empty contents. `,
      "A sparse file is a property of a disk. Git keeps contents, and it does not keep holes. So a clone cannot give the sparse file back.",
    ),
    frame("image.gif", "empty-folder", "The README lists a folder with this name. The repository has no such entry. Git does not keep an empty folder, so the link of the README goes nowhere."),
  );
}

/** This function fills each side room. */
export function drawRooms(exhibits: readonly Exhibit[]): void {
  secretRoom(exhibits);
  polyglotRoom(exhibits);
  nameRoom(exhibits);
  ansiRoom(exhibits);
  emptyRoom(exhibits);
}
