// @vitest-environment jsdom
// The smoke test of the wiring of the page. It finds an ID that the code asks for and the page does not have. The fake image here
// tells nothing about a real browser. The real test of the images is the probe of the site check.
import { beforeAll, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";

/** A fake image: it refuses each blob URL of an empty file, and it takes each other URL. */
class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(url: string) {
    queueMicrotask(() => {
      if (url === "blob:0") this.onerror?.();
      else {
        this.naturalWidth = 1;
        this.naturalHeight = 1;
        this.onload?.();
      }
    });
  }
  decode(): Promise<void> {
    return Promise.reject(new Error("The fake image has no pixels."));
  }
}

const settled = (selector: string, attribute: string, value: string): Promise<void> => vi.waitFor(() => expect(document.querySelector<HTMLElement>(selector)?.dataset[attribute]).toBe(value));

beforeAll(async () => {
  const page = new DOMParser().parseFromString(html, "text/html");
  for (const script of page.querySelectorAll("script")) script.remove();
  document.body.replaceChildren(...page.body.childNodes);
  vi.stubGlobal("Image", FakeImage);
  URL.createObjectURL = (blob: Blob | MediaSource) => `blob:${(blob as Blob).size}`;
  URL.revokeObjectURL = () => undefined;
  await import("./main.ts");
});

describe("the page", () => {
  it("runs the live table to the end", async () => {
    await settled("#live-rows", "state", "done");
    expect(document.querySelectorAll("#live-rows tr")).toHaveLength(9);
    expect(document.querySelector<HTMLElement>('#live-rows tr[data-file="giant.img"]')?.dataset["result"]).toBe("refused");
    expect(document.querySelector<HTMLElement>('#live-rows tr[data-file="5.svg"]')?.dataset["result"]).toBe("loaded");
    await settled("#why-rows", "state", "done");
    expect(document.querySelector("#why-line")?.textContent).toContain("all four");
  });

  it("types into the lab and shows the result", async () => {
    const input = document.querySelector<HTMLInputElement>("#lab-text");
    if (input === null) throw new Error("no input");
    input.value = "<svg";
    input.dispatchEvent(new Event("input"));
    await settled("#lab-verdict", "bytes", "4");
    expect(document.querySelectorAll("#lab-tiles .tile")).toHaveLength(4);
    expect(document.querySelector("#lab-word")?.textContent).toContain("4 bytes");
  });

  it("keeps typed markup out of the document", async () => {
    const input = document.querySelector<HTMLInputElement>("#lab-text");
    if (input === null) throw new Error("no input");
    input.value = "<b>x</b>";
    input.dispatchEvent(new Event("input"));
    await settled("#lab-verdict", "bytes", "8");
    expect(document.querySelector("#lab b.x, #lab-detail b, #lab-notes b")).toBeNull();
  });

  it("removes a byte and undoes the change", async () => {
    document.querySelector<HTMLElement>('#lab-presets [data-preset="pixel.gif"]')?.click();
    await settled("#lab-verdict", "bytes", "35");
    document.querySelector<HTMLElement>("#lab-remove")?.click();
    await settled("#lab-verdict", "bytes", "34");
    document.querySelector<HTMLElement>("#lab-undo")?.click();
    await settled("#lab-verdict", "bytes", "35");
  });

  it("finds the hidden text after the press", async () => {
    document.querySelector<HTMLElement>("#secret-reveal")?.click();
    await vi.waitFor(() => expect(document.querySelector("#secret-text")?.textContent).toBe("see me"));
  });

  it("shows the facts and the rooms", () => {
    expect(document.querySelector<HTMLElement>('#facts-rows tr[data-name="giant.img"]')?.dataset["state"]).toBe("differs");
    expect(document.querySelector("#name-bdi")?.textContent).toBe("‮gnp.gif");
    expect(document.querySelectorAll("#ansi-terminals .cell.reverse")).toHaveLength(2);
    expect(document.querySelector("#hero-pixel")).not.toBeNull();
    expect(document.querySelectorAll("svg")).toHaveLength(0);
  });
});
