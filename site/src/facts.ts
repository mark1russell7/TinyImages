/** This module fills the table of facts: the README against the real bytes. */
import { byId, h } from "@mark1russell7/site-pages/chrome";
import { sameBytes } from "./bytes.ts";
import { compareClaims, readClaims, type Exhibit, type Fact } from "./museum.ts";
import { readBytes } from "./parse/index.ts";

/** The words for each verdict. */
const VERDICTS: Readonly<Record<Fact["state"], string>> = {
  same: "Same size",
  differs: "Differs",
  "no-entry": "No such entry",
  history: "In the history only",
};

/** This function gives the findings that the real bytes support. */
export function findingsOf(exhibits: readonly Exhibit[]): string[] {
  const of = (name: string): Exhibit | undefined => exhibits.find((exhibit) => exhibit.name === name);
  const list: string[] = [];
  const twins = exhibits.filter((exhibit) => exhibit.name.endsWith("gnp.gif"));
  const pixel = of("pixel.gif");
  const runme = of("runme.gif");
  for (const twin of twins) {
    if (pixel !== undefined && sameBytes(twin.bytes, pixel.bytes)) list.push("The README puts the file of the reversed name under files that do not render. Its bytes are the same as pixel.gif, so it is a normal GIF.");
  }
  if (runme !== undefined) {
    const gif = readBytes(runme.bytes).gif;
    if (gif !== undefined) list.push(`The file runme.gif has ${runme.bytes.length} bytes, as the README says. It has ${gif.frames.length} images, so it holds a canvas of ${gif.width} x ${gif.height} and no pixels.`);
  }
  if (pixel !== undefined) {
    list.push(`The README calls pixel.gif the smallest GIF that follows the standard. The grammar of GIF lets a file have no palette, which gives ${pixel.bytes.length - 6} bytes. Use the chip "pixel.gif, no palette" in the lab to test it.`);
  }
  list.push("The README says that 5.svg uses the auto-closing of the HTML5 parser. That parser reads SVG in an HTML page. An image load of SVG uses XML, so the live table is the real test.");
  list.push("The README says that the Git render of 5.svg works. This page cannot test the renderer of GitHub, so it makes no claim.");
  list.push("The README gives the shell behavior of the files. This page does not run a file, so it makes no claim about a real shell or a real terminal.");
  return list;
}

/** This function fills the section of facts. */
export function drawFacts(exhibits: readonly Exhibit[], readme: string): void {
  const facts = compareClaims(readClaims(readme), exhibits);
  byId("facts-rows").replaceChildren(
    ...facts.map((fact) =>
      h(
        "tr",
        { "data-name": fact.name, "data-state": fact.state },
        h("th", { scope: "row", "data-label": "File" }, h("code", {}, fact.name)),
        h("td", { "data-label": "The README says" }, fact.claimed),
        h("td", { "data-label": "The repository has" }, fact.held),
        h("td", { "data-label": "Verdict" }, h("span", { class: `pill ${fact.state}` }, VERDICTS[fact.state])),
      ),
    ),
  );
  byId("findings").replaceChildren(...findingsOf(exhibits).map((finding) => h("li", {}, finding)));
}
