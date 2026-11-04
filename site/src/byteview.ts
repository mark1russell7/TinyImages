/** This module draws bytes as tiles. A press, a hover or the focus shows what the parser found for that byte. */
import { h } from "@mark1russell7/site-pages/chrome";
import { charOf, hexOf } from "./bytes.ts";
import type { Reading } from "./parse/index.ts";
import type { Span } from "./parse/span.ts";

/** This function gives the label of the byte at an offset. */
export function spanAt(reading: Reading, offset: number): Span | undefined {
  return reading.spans.find((span) => offset >= span.start && offset < span.end);
}

/** The maximum number of tiles on the page. A visitor can paste a long text. */
export const MAX_TILES = 512;

/** This function fills a container with one button for each byte. */
export function drawTiles(container: HTMLElement, bytes: Uint8Array, reading: Reading): void {
  const tiles: HTMLElement[] = [];
  const shown = Math.min(bytes.length, MAX_TILES);
  for (let offset = 0; offset < shown; offset++) {
    const value = bytes[offset] ?? 0;
    const span = spanAt(reading, offset);
    const label = `Byte ${offset}, value ${hexOf(value)}. ${span === undefined ? "No label" : `${span.block}, ${span.field}`}.`;
    tiles.push(h("button", { type: "button", class: `tile kind-${span?.kind ?? "broken"}`, "data-offset": offset, "aria-label": label }, h("b", {}, hexOf(value)), h("i", {}, charOf(value))));
  }
  container.replaceChildren(...tiles);
}

/** This function writes the label of a byte into a detail element. */
export function showDetail(detail: HTMLElement, bytes: Uint8Array, reading: Reading, offset: number): void {
  const span = spanAt(reading, offset);
  const value = bytes[offset] ?? 0;
  detail.dataset["offset"] = String(offset);
  detail.dataset["block"] = span?.block ?? "";
  detail.dataset["field"] = span?.field ?? "";
  detail.replaceChildren(
    h("strong", {}, `Byte ${offset} is 0x${hexOf(value)}.`),
    " ",
    span === undefined ? "No parser labels this byte." : h("span", {}, h("em", {}, `${span.block}: ${span.field}.`), ` ${span.meaning}`),
  );
}

/** This function gives the offset of the tile under an event. */
export function offsetOf(target: EventTarget | null): number | undefined {
  if (!(target instanceof Element)) return undefined;
  const value = target.closest<HTMLElement>("[data-offset]")?.dataset["offset"];
  return value === undefined ? undefined : Number(value);
}

/** This function makes a read-only byte view: tiles and a detail line. */
export function byteView(container: HTMLElement, detail: HTMLElement, bytes: Uint8Array, reading: Reading): void {
  drawTiles(container, bytes, reading);
  const picked = (offset: number): void => {
    for (const tile of container.querySelectorAll(".picked")) tile.classList.remove("picked");
    container.querySelector(`[data-offset="${offset}"]`)?.classList.add("picked");
  };
  const show = (event: Event): void => {
    const offset = offsetOf(event.target);
    if (offset !== undefined) showDetail(detail, bytes, reading, offset);
  };
  container.addEventListener("pointerover", show);
  container.addEventListener("focusin", show);
  container.addEventListener("click", (event) => {
    show(event);
    const offset = offsetOf(event.target);
    if (offset !== undefined) picked(offset);
  });
  if (bytes.length > 0) showDetail(detail, bytes, reading, 0);
}
