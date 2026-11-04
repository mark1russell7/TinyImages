/** This module has the live test of the exhibits, the test of the four SVG texts and the plaques with the byte views. */
import { byId, h } from "@mark1russell7/site-pages/chrome";
import { byteView } from "./byteview.ts";
import { browserLabel, loadBytes, loadUrl, naturalText, type LoadResult } from "./load.ts";
import { mimeOf, quineUrl, type Exhibit } from "./museum.ts";
import { readBytes } from "./parse/index.ts";

/** This function gives the words of a load state. */
export function stateWord(state: LoadResult["state"]): string {
  if (state === "timeout") return "No answer in 4 s";
  return state === "refused" ? "Refused" : "Loaded";
}

/** This function gives the words of a result in the live table. */
export function resultWord(result: LoadResult): string {
  if (result.state !== "loaded") return stateWord(result.state);
  return result.drawn ? "Loaded, with pixels" : "Loaded, no visible pixels";
}

/** This function gives a box that shows the result of a load. A 1 x 1 image fills the box, so a visitor can see it. */
export function specimen(result: LoadResult, large: boolean): HTMLElement {
  const box = h("div", { class: large ? "specimen large" : "specimen" });
  fillSpecimen(box, result);
  return box;
}

/** This function puts the canvas of a result into a box, or a short text when the result has no pixels. */
export function fillSpecimen(box: HTMLElement, result: LoadResult): void {
  const canvas = result.canvas;
  if (canvas === undefined) {
    box.replaceChildren(h("span", { class: "no-image" }, "No image"));
    return;
  }
  box.replaceChildren(canvas);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `The image as this browser draws it, ${result.width} x ${result.height} pixels`);
}

/** The words of a blob type in the tables. */
const typeWord = (type: string): string => (type === "" ? "No type" : type);

/** One row of the live table. */
interface LiveFile {
  readonly name: string;
  readonly size: number;
  readonly sent: string;
  readonly run: () => Promise<LoadResult>;
}

/** This function gives the smallest file that this browser took. */
export function smallestLoaded(results: readonly { readonly name: string; readonly size: number; readonly result: LoadResult }[]): { name: string; size: number } | undefined {
  const taken = results.filter((item) => item.result.state === "loaded" && item.size > 0).sort((a, b) => a.size - b.size);
  const first = taken[0];
  return first === undefined ? undefined : { name: first.name, size: first.size };
}

/** The live table: each file of the museum and the data URL of the README, loaded in this browser. */
export class LiveTable {
  private readonly rows = byId("live-rows");
  private readonly line = byId("browser-line");
  private readonly browser = browserLabel(navigator.userAgent);
  private readonly files: readonly LiveFile[];
  private readonly onDone: (record: { name: string; size: number } | undefined) => void;
  private running = false;

  constructor(exhibits: readonly Exhibit[], readme: string, onDone: (record: { name: string; size: number } | undefined) => void) {
    this.onDone = onDone;
    const files: LiveFile[] = exhibits.map((exhibit) => {
      const type = mimeOf(exhibit.name);
      return { name: exhibit.name, size: exhibit.bytes.length, sent: type, run: () => loadBytes(exhibit.bytes, type, { paint: true }) };
    });
    const quine = quineUrl(readme);
    if (quine !== undefined) files.push({ name: "The Quine", size: quine.length, sent: "data URL", run: () => loadUrl(quine, { paint: true }) });
    this.files = files;
    byId<HTMLButtonElement>("retest").addEventListener("click", () => void this.run());
  }

  /** This method draws one row before its test. */
  private row(file: LiveFile): HTMLTableRowElement {
    return h(
      "tr",
      { "data-file": file.name, "data-result": "running" },
      h("th", { scope: "row", "data-label": "File" }, h("code", {}, file.name)),
      h("td", { "data-label": "Bytes" }, String(file.size)),
      h("td", { "data-label": "Sent as" }, typeWord(file.sent)),
      h("td", { "data-label": "Result", class: "result" }, "Testing"),
      h("td", { "data-label": "Natural size", class: "natural" }, ""),
      h("td", { "data-label": "Image", class: "image" }, ""),
      h("td", { "data-label": "Time", class: "time" }, ""),
    );
  }

  /** This method loads each file, one after the other, and writes each result into its row. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const button = byId<HTMLButtonElement>("retest");
    button.disabled = true;
    this.rows.dataset["state"] = "running";
    const rows = this.files.map((file) => this.row(file));
    this.rows.replaceChildren(...rows);
    const results: { name: string; size: number; result: LoadResult }[] = [];
    for (const [index, file] of this.files.entries()) {
      const row = rows[index];
      if (row === undefined) continue;
      const result = await file.run();
      results.push({ name: file.name, size: file.size, result });
      row.dataset["result"] = result.state;
      row.dataset["natural"] = naturalText(result);
      row.dataset["drawn"] = String(result.drawn);
      row.querySelector(".result")?.replaceChildren(resultWord(result));
      row.querySelector(".natural")?.replaceChildren(naturalText(result));
      row.querySelector(".image")?.replaceChildren(specimen(result, false));
      row.querySelector(".time")?.replaceChildren(`${result.ms.toFixed(1)} ms`);
    }
    const taken = results.filter((item) => item.result.state === "loaded").length;
    this.line.textContent = `${this.browser} took ${taken} of ${results.length} files in this test. Another browser can give a different result.`;
    this.line.dataset["browser"] = this.browser;
    this.rows.dataset["state"] = "done";
    this.running = false;
    button.disabled = false;
    this.onDone(smallestLoaded(results.filter((item) => item.name !== "The Quine")));
  }
}

const SVG_NAMESPACE = 'xmlns="http://www.w3.org/2000/svg"';

/** The four SVG texts of the second table. */
const SVG_TEXTS: readonly { readonly text: string; readonly namespace: boolean }[] = [
  { text: "<svg>", namespace: false },
  { text: "<svg/>", namespace: false },
  { text: `<svg ${SVG_NAMESPACE}>`, namespace: true },
  { text: `<svg ${SVG_NAMESPACE}/>`, namespace: true },
];

/** This function gives the sentence that the four results of the second table support. */
export function whySentence(browser: string, results: readonly { readonly namespace: boolean; readonly text: string; readonly loaded: boolean }[]): string {
  const taken = results.filter((item) => item.loaded);
  const only = taken.length === 1 ? taken[0] : undefined;
  if (only !== undefined && only.namespace && only.text.endsWith("/>")) return `${browser} took only the text with the namespace and the closing slash.`;
  if (taken.length > 0 && taken.every((item) => item.namespace)) return `${browser} took no text without the xmlns attribute.`;
  if (taken.length > 0 && taken.every((item) => item.text.endsWith("/>"))) return `${browser} took no text without the closing slash.`;
  if (taken.length === results.length) return `${browser} took all four texts.`;
  return taken.length === 0 ? `${browser} refused all four texts.` : `${browser} took ${taken.length} of the four texts.`;
}

/** This function fills the second table with measured results. */
export async function runWhyTable(): Promise<void> {
  const rows = byId("why-rows");
  const encoder = new TextEncoder();
  const browser = browserLabel(navigator.userAgent);
  const results: { namespace: boolean; text: string; loaded: boolean }[] = [];
  rows.dataset["state"] = "running";
  for (const item of SVG_TEXTS) {
    const bytes = encoder.encode(item.text);
    const row = h("tr", { "data-text": item.text }, h("th", { scope: "row", "data-label": "Text" }, h("code", {}, item.text)), h("td", { "data-label": "Bytes" }, String(bytes.length)));
    rows.append(row);
    const result = await loadBytes(bytes, "image/svg+xml", { paint: false });
    row.dataset["result"] = result.state;
    row.append(h("td", { "data-label": "Result" }, stateWord(result.state)), h("td", { "data-label": "Natural size" }, naturalText(result)));
    results.push({ ...item, loaded: result.state === "loaded" });
  }
  byId("why-line").textContent = whySentence(browser, results);
  rows.dataset["state"] = "done";
}

/** This function draws one plaque for each exhibit. */
export function drawPlaques(exhibits: readonly Exhibit[], openInLab: (exhibit: Exhibit) => void): void {
  const plaques = exhibits.map((exhibit) => {
    const reading = readBytes(exhibit.bytes);
    const tiles = h("div", { class: "tiles", role: "group", "aria-label": `The bytes of ${exhibit.name}` });
    const detail = h("p", { class: "detail", "aria-live": "polite" });
    byteView(tiles, detail, exhibit.bytes, reading);
    const open = h("button", { type: "button", class: "inline" }, "Open in the lab");
    open.addEventListener("click", () => openInLab(exhibit));
    return h(
      "article",
      { class: "plaque", "data-exhibit": exhibit.name },
      h("div", { class: "plaque-label" }, h("h4", {}, exhibit.name), h("p", { class: "size" }, `${exhibit.bytes.length} ${exhibit.bytes.length === 1 ? "byte" : "bytes"}`), h("p", {}, reading.summary), reading.notes.map((note) => h("p", { class: "note" }, note)), exhibit.bytes.length > 0 ? open : null),
      h("div", { class: "plaque-bytes" }, tiles, exhibit.bytes.length > 0 ? detail : h("p", { class: "note" }, "This file has no byte to show.")),
    );
  });
  byId("gallery").replaceChildren(...plaques);
}
