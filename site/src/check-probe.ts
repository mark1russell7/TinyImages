/**
 * The probe of the museum. The site check of the Pages workflow starts it in a browser at each width, before the deploy. A
 * failed check stops the deploy.
 *
 * The site check reads this TypeScript file directly. It removes the types and the `export` line, and it starts the result as the
 * body of an async function.
 *
 * The probe does not state what a browser does with `<svg>`. It loads each file again with its own `new Image()`. It compares the
 * result with the cell of the page, and it writes the measured result into the name of the step. So `report.json` holds the result.
 */

// The site check gives these helpers to the probe. Each element of this page is an HTML element.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const until: <T>(fn: () => T | Promise<T>, ms?: number) => Promise<T>;
declare const $: (selector: string) => HTMLElement | null;
declare const $$: (selector: string) => HTMLElement[];
declare const type: (target: string | Element, text: string) => void;
declare const click: (target: string | Element) => void;

const hexBytes = (hex: string): Uint8Array => new Uint8Array((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)));
const textBytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** This function loads bytes with its own image, as a second measure of the same browser. */
const measure = (bytes: Uint8Array, mime: string): Promise<{ result: string; natural: string }> =>
  new Promise((done) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], mime === "" ? {} : { type: mime }));
    const image = new Image();
    const finish = (result: string): void => {
      const natural = result === "loaded" ? `${image.naturalWidth} x ${image.naturalHeight}` : "none";
      URL.revokeObjectURL(url);
      done({ result, natural });
    };
    image.onload = () => finish("loaded");
    image.onerror = () => finish("refused");
    image.src = url;
  });

const row = (file: string) => $(`#live-rows tr[data-file="${file}"]`);
const verdict = () => $("#lab-verdict")?.dataset ?? {};
const pwned = () => (window as unknown as { __pwned?: number }).__pwned;

/** This function waits for the lab to finish the test of a file of a known size. */
const settled = (bytes: number) => until(() => verdict()["state"] !== "running" && verdict()["bytes"] === String(bytes), 8000);

/** This function compares a row of the live table with a second measure. */
const sameAsMeasure = async (file: string, bytes: Uint8Array, mime: string): Promise<void> => {
  const second = await measure(bytes, mime);
  const cell = row(file);
  check(`${file} gives "${second.result}" with natural size ${second.natural} in this browser, in the table and in a second load`, cell?.dataset["result"] === second.result && cell?.dataset["natural"] === second.natural, { cell: cell?.dataset, second });
};

/** This function presses a byte of a plaque and gives the field that the detail line shows. */
const pressByte = (file: string, offset: number): string | undefined => {
  const plaque = $(`[data-exhibit="${file}"]`);
  const tile = plaque?.querySelector(`[data-offset="${offset}"]`);
  if (tile !== undefined && tile !== null) click(tile);
  return plaque?.querySelector<HTMLElement>(".detail")?.dataset["field"];
};

const presetChip = (label: string) => $(`#lab-presets [data-preset="${label}"]`);
const labTile = (offset: number) => $(`#lab-tiles [data-offset="${offset}"]`);

// The live table.
check("the live test ends", await until(() => $("#live-rows")?.dataset["state"] === "done", 15000));
check("the table has each file and the data URL of the README", $$("#live-rows tr").length >= 9, $$("#live-rows tr").length);
check("pixel.gif loads with natural size 1 x 1", row("pixel.gif")?.dataset["result"] === "loaded" && row("pixel.gif")?.dataset["natural"] === "1 x 1", row("pixel.gif")?.dataset);
await sameAsMeasure("5.svg", textBytes("<svg>"), "image/svg+xml");
await sameAsMeasure("void.svg", textBytes("<svg/>"), "image/svg+xml");
await sameAsMeasure("runme.gif", hexBytes("474946383961200023000000003b"), "image/gif");
await sameAsMeasure("giant.img", new Uint8Array(), "");
check(`the page names the browser: ${$("#browser-line")?.dataset["browser"]}`, ($("#browser-line")?.dataset["browser"] ?? "") !== "" && ($("#browser-line")?.textContent ?? "").includes($("#browser-line")?.dataset["browser"] ?? "?"));
check("the real pixel hangs in the frame at true size", ($("#hero-pixel") as HTMLImageElement | null)?.naturalWidth === 1 && $("#hero-pixel")?.getBoundingClientRect().width === 1);

const whyDone = await until(() => $("#why-rows")?.dataset["state"] === "done", 8000);
check(`the four SVG texts have a measured result: ${$("#why-line")?.textContent}`, whyDone && $$("#why-rows tr[data-result]").length === 4);

// The byte view. The labels come from the parser in the page.
check("byte 0 of pixel.gif is the signature", pressByte("pixel.gif", 0) === "Signature");
check("byte 6 of pixel.gif is the canvas width", pressByte("pixel.gif", 6) === "Canvas width");
check("byte 10 of pixel.gif is the flags byte", pressByte("pixel.gif", 10) === "Flags");
check("byte 34 of pixel.gif is the trailer", pressByte("pixel.gif", 34) === "Trailer");
check("a shell file has labels from the same parser", pressByte("runme.gif", 13) === "Trailer");

// The side rooms.
check("the hidden text stays hidden before the press", $("#secret-text") === null);
click("#secret-reveal");
const secret = await until(() => $("#secret-text")?.textContent, 8000);
check("secret.gif gives its hidden text", secret === "see me", secret);
check("the same search on pixel.gif finds no text", /pixel\.gif finds no text/.test($("#secret-result")?.textContent ?? ""));
const drawnPixel = $("#secret-pixel")?.dataset;
check("the canvas pixel of secret.gif is the first palette color", drawnPixel?.["rgb"] === "115,101,101" && drawnPixel["rgb"] === drawnPixel["palette"], drawnPixel);
const words = $$("#poly-shell li[data-kind='word']");
check("the shell reading of runme.gif has one command", words.length === 1 && (words[0]?.textContent ?? "").startsWith("GIF89a"), words.length);
check("the shell reading of runme.gif has a comment", $$("#poly-shell li[data-kind='comment']").length === 1);
check("runme.gif has 14 tiles", $$("#poly-tiles .tile").length === 14);
check("the terminal cell of pixel.ansi is drawn in reverse", $$("#ansi-terminals .cell.reverse").length === 2);

// The facts.
const fact = (name: string) => $(`#facts-rows tr[data-name="${name}"]`);
check("the facts show 1 TB against 0 B for giant.img", fact("giant.img")?.dataset["state"] === "differs" && /1 TB/.test(fact("giant.img")?.textContent ?? "") && /0 B/.test(fact("giant.img")?.textContent ?? ""));
check("the facts show no entry for image.gif", fact("image.gif")?.dataset["state"] === "no-entry");
check("the facts show 4.svg in the history", fact("4.svg")?.dataset["state"] === "history");
check("the sizes of the real files match", fact("5.svg")?.dataset["state"] === "same" && fact("runme.gif")?.dataset["state"] === "same");

// The lab: the 4-byte failure of the F tier.
await settled(35);
type("#lab-text", "<svg");
await settled(4);
const four = await measure(textBytes("<svg"), "image/svg+xml");
check(`the 4-byte <svg gives "${four.result}" in this browser, in the lab and in a second load`, verdict()["state"] === four.result && verdict()["natural"] === four.natural, verdict());
check("the lab draws four tiles for four bytes", $$("#lab-tiles .tile").length === 4);

// The lab: a removed byte changes the result.
click(presetChip("pixel.gif")!);
await settled(35);
check("the lab starts from a pixel.gif that loads", verdict()["state"] === "loaded" && verdict()["natural"] === "1 x 1", verdict());
click(labTile(0)!);
click("#lab-remove");
await settled(34);
const broken = await measure(hexBytes(verdict()["hex"] ?? ""), "");
check("a removed first byte changes the result to refused", verdict()["state"] === "refused" && broken.result === "refused", verdict());
click("#lab-undo");
await settled(35);
check("undo gives the loaded image back", verdict()["state"] === "loaded");

// The lab takes the bytes of a visitor only as an image.
const attack = "<img src=x onerror=window.__pwned=2>";
type("#lab-text", attack);
await settled(attack.length);
check("typed markup makes no element", $$("#lab img").length === 0 && pwned() === undefined);
const script = '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__pwned=1</script></svg>';
type("#lab-text", script);
await settled(script.length);
check(`an SVG with a script gives "${verdict()["state"]}" and the script does not run`, pwned() === undefined);
check("each blob URL is revoked", await until(() => document.body.dataset["openUrls"] === "0", 5000), document.body.dataset["openUrls"]);
check("the page has no inline SVG", $$("svg").length === 0);

// The name. The override character stays in its isolate.
const before = $("#name-before")?.getClientRects();
const after = $("#name-after")?.getClientRects();
const bdi = $("#name-bdi")?.getBoundingClientRect();
const lastBefore = before?.[before.length - 1];
const firstAfter = after?.[0];
const inOrder = (left: DOMRect | undefined, right: DOMRect | undefined): boolean => left !== undefined && right !== undefined && (left.bottom <= right.top + 1 || left.right <= right.left + 1);
check("the reversed name holds a real U+202E", ($("#name-bdi")?.textContent ?? "").startsWith("‮"));
check("the text around the reversed name keeps its order", inOrder(lastBefore, bdi) && inOrder(bdi, firstAfter), { lastBefore, bdi, firstAfter });

// The two automatic tests.
click(presetChip("pixel.gif")!);
await settled(35);
click("#lab-each");
check("the test of each byte ends", await until(() => $("#lab-progress")?.dataset["done"] === "each", 20000));
check("the test of each byte marks all 35 tiles", $$("#lab-tiles .keeps, #lab-tiles .breaks").length === 35, $$("#lab-tiles .keeps, #lab-tiles .breaks").length);
check("byte 0 is marked as needed", labTile(0)?.classList.contains("breaks"));
click("#lab-shrink");
check("the shrink ends", await until(() => verdict()["shrink"] === "done", 25000));
await until(() => verdict()["state"] !== "running", 8000);
const shrunk = hexBytes(verdict()["hex"] ?? "");
const shrunkAgain = await measure(shrunk, "image/gif");
check(`the shrink stops at ${shrunk.length} bytes that this browser still takes`, verdict()["state"] === "loaded" && shrunk.length <= 35 && shrunkAgain.result === "loaded", verdict());

// The layout. Each wide element fits its card, unless it is meant to scroll.
const clipped = $$(".workbench, .verdict, .room, .plaque, .tiles, .pair, .terminals, .table-wrap, .detail, .bench").filter((element) => element.scrollWidth > element.clientWidth + 1);
check(
  "no wide view passes the edge of its card",
  clipped.length === 0,
  clipped.map((element) => `${element.className}#${element.id}: ${element.scrollWidth} > ${element.clientWidth}`),
);

export {};
