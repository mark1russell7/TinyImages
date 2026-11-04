/**
 * This module is the shrink lab: an editor over the bytes of a tiny file. After each change it loads the bytes as an image from a
 * blob URL. The visitor's text goes only into a blob and into text nodes. It does not go into the document as HTML.
 */
import { byId, h } from "@mark1russell7/site-pages/chrome";
import { MAX_TILES, drawTiles, offsetOf, showDetail } from "./byteview.ts";
import { fromHex, toHex } from "./bytes.ts";
import { fromLabText, insertByte, removeByte, setByte, toLabText, typeFor } from "./edits.ts";
import { fillSpecimen } from "./exhibits.ts";
import { browserLabel, loadBytes, naturalText, type LoadResult } from "./load.ts";
import { RETIRED, type Exhibit } from "./museum.ts";
import { readBytes, type Reading } from "./parse/index.ts";

/** The maximum size of a file for the two automatic tests. Each test loads the file once for each byte. */
const AUTO_LIMIT = 256;

/** The maximum number of loads of the automatic shrink. */
const SHRINK_LOADS = 600;

/** A start point of the lab. */
export interface Preset {
  readonly label: string;
  readonly bytes: Uint8Array;
  /** The value is true for a file that only the history holds. */
  readonly retired: boolean;
}

/** This function removes the palette of a GIF with two colors: it clears the flag at byte 10 and removes bytes 13 to 18. */
export function withoutPalette(bytes: Uint8Array): Uint8Array {
  const flagged = setByte(bytes, 10, (bytes[10] ?? 0) & 0x7f);
  const next = new Uint8Array(bytes.length - 6);
  next.set(flagged.subarray(0, 13));
  next.set(flagged.subarray(19), 13);
  return next;
}

/** This function gives the start points of the lab: the F tier first, then the exhibits, then the other retired files. */
export function presetsOf(exhibits: readonly Exhibit[]): Preset[] {
  const retired = (name: string): Preset[] => RETIRED.filter((file) => file.name === name).map((file) => ({ label: file.name, bytes: fromHex(file.hex), retired: true }));
  const files = exhibits.filter((exhibit) => exhibit.bytes.length > 0 && !exhibit.name.endsWith("gnp.gif") && !exhibit.name.endsWith(".ansi")).map((exhibit): Preset => ({ label: exhibit.name, bytes: exhibit.bytes, retired: false }));
  const pixel = exhibits.find((exhibit) => exhibit.name === "pixel.gif");
  const palette: Preset[] = pixel === undefined ? [] : [{ label: "pixel.gif, no palette", bytes: withoutPalette(pixel.bytes), retired: false }];
  return [...retired("4.svg"), ...files, ...palette, ...["risk.gif", "tiny.gif", "pixel.tga", "pixel.bmp", "pixel.wbmp"].flatMap(retired)];
}

/** The shrink lab. */
export class Lab {
  private readonly root = byId("lab-verdict");
  private readonly text = byId<HTMLInputElement>("lab-text");
  private readonly tiles = byId("lab-tiles");
  private readonly detail = byId("lab-detail");
  private readonly type = byId<HTMLSelectElement>("lab-type");
  private readonly value = byId<HTMLInputElement>("lab-value");
  private readonly progress = byId("lab-progress");
  private readonly each = byId<HTMLButtonElement>("lab-each");
  private readonly shrink = byId<HTMLButtonElement>("lab-shrink");
  private readonly browser = browserLabel(navigator.userAgent);
  private readonly history: Uint8Array[] = [];
  private bytes: Uint8Array = new Uint8Array();
  private start: Uint8Array = new Uint8Array();
  private reading: Reading = readBytes(this.bytes);
  private selected = 0;
  /** This number grows with each change. An older test of the page drops its result. */
  private token = 0;
  private record: { name: string; size: number } | undefined;
  private best: number | undefined;
  private readonly presets: readonly Preset[];

  constructor(presets: readonly Preset[]) {
    this.presets = presets;
    this.drawPresets();
    this.bind();
    const first = presets.find((preset) => preset.label === "pixel.gif") ?? presets[0];
    if (first !== undefined) this.open(first.bytes);
  }

  /** This method starts the lab from new bytes. */
  open(bytes: Uint8Array): void {
    this.start = bytes;
    this.history.length = 0;
    this.selected = 0;
    this.change(bytes, true);
  }

  /** This method tells the lab the smallest exhibit that this browser took. */
  setRecord(record: { name: string; size: number } | undefined): void {
    this.record = record;
    this.drawRecord();
  }

  private drawPresets(): void {
    const chips = this.presets.map((preset) => {
      const chip = h("button", { type: "button", class: preset.retired ? "chip retired" : "chip", "data-preset": preset.label, title: preset.retired ? "This file is only in the history of the repository." : null }, `${preset.label}, ${preset.bytes.length} B`);
      chip.addEventListener("click", () => this.open(preset.bytes));
      return chip;
    });
    byId("lab-presets").replaceChildren(...chips);
  }

  private bind(): void {
    this.text.addEventListener("input", () => this.edit(fromLabText(this.text.value), false));
    this.text.addEventListener("focus", () => this.text.select());
    this.type.addEventListener("change", () => void this.test());
    this.tiles.addEventListener("click", (event) => {
      const offset = offsetOf(event.target);
      if (offset === undefined) return;
      this.selected = offset;
      this.drawSelection();
    });
    const peek = (event: Event): void => {
      const offset = offsetOf(event.target);
      if (offset !== undefined) showDetail(this.detail, this.bytes, this.reading, offset);
    };
    this.tiles.addEventListener("pointerover", peek);
    this.tiles.addEventListener("focusin", peek);
    this.tiles.addEventListener("pointerleave", () => this.drawSelection());
    this.tiles.addEventListener("keydown", (event) => this.key(event));
    byId("lab-remove").addEventListener("click", () => this.remove());
    byId("lab-change").addEventListener("click", () => this.replace());
    byId("lab-insert").addEventListener("click", () => this.insert());
    byId("lab-undo").addEventListener("click", () => this.undo());
    byId("lab-reset").addEventListener("click", () => this.edit(this.start, true));
    this.each.addEventListener("click", () => void this.testEach());
    this.shrink.addEventListener("click", () => void this.shrinkAll());
  }

  private key(event: KeyboardEvent): void {
    const offset = offsetOf(event.target);
    if (offset === undefined) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.selected = offset;
      this.remove();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = offset + (event.key === "ArrowRight" ? 1 : -1);
      this.tiles.querySelector<HTMLElement>(`[data-offset="${next}"]`)?.focus();
    }
  }

  private byteValue(): number | undefined {
    const value = this.value.value.trim();
    return /^[0-9a-fA-F]{1,2}$/.test(value) ? Number.parseInt(value, 16) : undefined;
  }

  private remove(): void {
    if (this.selected < this.bytes.length) this.edit(removeByte(this.bytes, this.selected), true);
  }

  private replace(): void {
    const value = this.byteValue();
    if (value !== undefined && this.selected < this.bytes.length) this.edit(setByte(this.bytes, this.selected, value), true);
  }

  private insert(): void {
    const value = this.byteValue();
    if (value !== undefined) this.edit(insertByte(this.bytes, Math.min(this.selected, this.bytes.length), value), true);
  }

  private undo(): void {
    const last = this.history.pop();
    if (last !== undefined) this.change(last, true);
  }

  /** This method keeps the old bytes for the undo button, then applies the change. */
  private edit(bytes: Uint8Array, writeText: boolean): void {
    this.history.push(this.bytes);
    this.change(bytes, writeText);
  }

  /** This method applies new bytes and starts a new test. */
  private change(bytes: Uint8Array, writeText: boolean): void {
    this.bytes = bytes;
    this.reading = readBytes(bytes);
    this.selected = Math.min(this.selected, Math.max(0, bytes.length - 1));
    delete this.progress.dataset["done"];
    this.progress.textContent = "";
    if (writeText) this.text.value = toLabText(bytes);
    const focused = this.tiles.contains(document.activeElement);
    drawTiles(this.tiles, bytes, this.reading);
    this.drawSelection();
    if (focused) this.tiles.querySelector<HTMLElement>(`[data-offset="${this.selected}"]`)?.focus();
    void this.test();
  }

  private drawSelection(): void {
    for (const tile of this.tiles.querySelectorAll(".picked")) tile.classList.remove("picked");
    const tile = this.tiles.querySelector(`[data-offset="${this.selected}"]`);
    tile?.classList.add("picked");
    if (this.bytes.length === 0) {
      delete this.detail.dataset["offset"];
      this.detail.textContent = "The file has no bytes.";
    } else showDetail(this.detail, this.bytes, this.reading, this.selected);
    if (this.bytes.length > MAX_TILES) this.detail.append(` The lab shows the first ${MAX_TILES} bytes.`);
  }

  /** This method loads the current bytes as an image and shows what the browser did. */
  private async test(): Promise<void> {
    this.token += 1;
    const token = this.token;
    const bytes = this.bytes;
    const type = typeFor(this.type.value, bytes);
    this.root.dataset["state"] = "running";
    const result = await loadBytes(bytes, type, { paint: true });
    if (token !== this.token) return;
    this.show(result, type, bytes);
  }

  private show(result: LoadResult, type: string, bytes: Uint8Array): void {
    const size = `${bytes.length} ${bytes.length === 1 ? "byte" : "bytes"}`;
    const words: Readonly<Record<LoadResult["state"], string>> = {
      loaded: `${this.browser} took these ${size}`,
      refused: `${this.browser} refused these ${size}`,
      timeout: `${this.browser} gave no answer in 4 seconds`,
    };
    byId("lab-word").textContent = words[result.state];
    fillSpecimen(byId("lab-preview"), result);
    byId("lab-bytes").textContent = String(bytes.length);
    byId("lab-natural").textContent = naturalText(result);
    byId("lab-sent").textContent = type === "" ? "No type" : type;
    byId("lab-ms").textContent = `${result.ms.toFixed(1)} ms`;
    const pixels = result.state === "loaded" && !result.drawn ? "The browser fired the load event, but the canvas has no visible pixel." : undefined;
    byId("lab-notes").replaceChildren(...[pixels, this.reading.summary, ...this.reading.notes].filter((note) => note !== undefined).map((note) => h("li", {}, note)));
    this.root.dataset["bytes"] = String(bytes.length);
    this.root.dataset["natural"] = naturalText(result);
    this.root.dataset["hex"] = toHex(bytes);
    this.root.dataset["drawn"] = String(result.drawn);
    this.root.dataset["state"] = result.state;
    if (result.state === "loaded" && bytes.length > 0 && (this.best === undefined || bytes.length < this.best)) this.best = bytes.length;
    this.drawRecord();
  }

  private drawRecord(): void {
    const record = this.record;
    const best = this.best;
    const line = byId("lab-record");
    const target = record === undefined ? "The test of the exhibits still runs." : `Record: ${record.name}, ${record.size} bytes, the smallest exhibit that this browser took.`;
    const yours = best === undefined ? "You have no result yet." : `Your smallest image: ${best} bytes.`;
    const beaten = record !== undefined && best !== undefined && best < record.size;
    line.dataset["beaten"] = String(beaten);
    line.replaceChildren(h("span", {}, target), " ", h("span", {}, yours), beaten ? h("strong", {}, " You beat the record.") : "");
  }

  /** This method loads the file once without each byte, and marks each tile. */
  private async testEach(): Promise<void> {
    if (this.bytes.length > AUTO_LIMIT) {
      this.progress.textContent = `This test works up to ${AUTO_LIMIT} bytes.`;
      return;
    }
    const token = this.token;
    const bytes = this.bytes;
    const type = typeFor(this.type.value, bytes);
    this.each.disabled = true;
    this.progress.dataset["state"] = "running";
    let breaks = 0;
    for (let offset = 0; offset < bytes.length; offset++) {
      const result = await loadBytes(removeByte(bytes, offset), type, { paint: false });
      if (token !== this.token) break;
      if (result.state !== "loaded") breaks += 1;
      this.tiles.querySelector(`[data-offset="${offset}"]`)?.classList.add(result.state === "loaded" ? "keeps" : "breaks");
    }
    this.each.disabled = false;
    delete this.progress.dataset["state"];
    if (token === this.token) {
      this.progress.dataset["done"] = "each";
      this.progress.textContent = `${this.browser} needs ${breaks} of these ${bytes.length} bytes. A dashed tile can go, one at a time.`;
    }
  }

  /** This method removes each byte that the browser does not need, with real loads, until no single byte can go. */
  private async shrinkAll(): Promise<void> {
    if (this.bytes.length > AUTO_LIMIT) {
      this.progress.textContent = `This test works up to ${AUTO_LIMIT} bytes.`;
      return;
    }
    const type = this.type.value;
    const token = this.token;
    const first = await loadBytes(this.bytes, typeFor(type, this.bytes), { paint: false });
    if (token !== this.token) return;
    if (first.state !== "loaded") {
      this.progress.textContent = "The browser refuses these bytes, so the page has nothing to shrink. Use Undo or Reset.";
      return;
    }
    this.shrink.disabled = true;
    this.root.dataset["shrink"] = "running";
    let current = this.bytes;
    let loads = 0;
    let changed = true;
    while (changed && loads < SHRINK_LOADS && token === this.token) {
      changed = false;
      for (let offset = current.length - 1; offset >= 0 && loads < SHRINK_LOADS; offset--) {
        const candidate = removeByte(current, offset);
        const result = await loadBytes(candidate, typeFor(type, candidate), { paint: false });
        if (token !== this.token) break;
        loads += 1;
        if (result.state === "loaded") {
          current = candidate;
          changed = true;
        }
        this.progress.textContent = `${current.length} bytes after ${loads} loads.`;
      }
    }
    this.shrink.disabled = false;
    if (token === this.token) {
      const size = current.length;
      this.edit(current, true);
      this.progress.textContent = `The page stopped at ${size} bytes after ${loads} loads. No single byte can go.`;
      this.progress.dataset["done"] = "shrink";
    }
    this.root.dataset["shrink"] = "done";
  }
}
