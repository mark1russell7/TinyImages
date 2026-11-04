// The start of the page: the theme, the first painting, the lab, the live test, the rooms, the facts and the build line.
import { byId, h, setupTheme } from "@mark1russell7/site-pages/chrome";
import { drawPlaques, LiveTable, runWhyTable } from "./exhibits.ts";
import { drawFacts } from "./facts.ts";
import { Lab, presetsOf } from "./lab.ts";
import { exhibitsOf } from "./museum.ts";
import { drawRooms } from "./rooms.ts";
import "./style.css";

setupTheme(byId<HTMLButtonElement>("theme"), "tinyimages-theme");

const exhibits = exhibitsOf(__MUSEUM__);

/** This function hangs the real `pixel.gif` in the frame of the entrance, at its true size of one pixel. */
function hangPixel(): void {
  const pixel = exhibits.find((exhibit) => exhibit.name === "pixel.gif");
  if (pixel === undefined) return;
  const url = `data:image/gif;base64,${btoa(String.fromCharCode(...pixel.bytes))}`;
  byId("hero-mat").append(h("img", { id: "hero-pixel", src: url, width: 1, height: 1, alt: "The real pixel.gif, one white pixel at true size" }));
  byId("hero-placard").append(h("strong", {}, "pixel.gif"), `. ${pixel.bytes.length} bytes. One pixel at its true size, in the center of the frame. The four ticks point to it.`);
}

hangPixel();
const lab = new Lab(presetsOf(exhibits));
drawPlaques(exhibits, (exhibit) => {
  lab.open(exhibit.bytes);
  byId("lab").scrollIntoView();
});
drawRooms(exhibits);
drawFacts(exhibits, __MUSEUM__.readme);

const live = new LiveTable(exhibits, __MUSEUM__.readme, (record) => lab.setRecord(record));
void live.run().then(runWhyTable);

const total = exhibits.reduce((sum, exhibit) => sum + exhibit.bytes.length, 0);
byId("totals").textContent = `All ${exhibits.length} files of the museum, with their real bytes, are in this page: ${total} bytes.`;
byId("build").append(
  `Version ${__BUILD__.version}, build `,
  __BUILD__.sha === "local" ? "local" : h("a", { href: `https://github.com/mark1russell7/TinyImages/commit/${__BUILD__.sha}` }, __BUILD__.sha),
  ` of ${__BUILD__.date}.`,
);
