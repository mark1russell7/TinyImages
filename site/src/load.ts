/**
 * This module is the real test of the page. It loads bytes as an image with `new Image()` from a blob URL or a data URL, and it
 * measures what the browser does. The image does not go into the document. A failed load is a result, so it reaches no console.
 */

/** The result of one load in this browser. */
export interface LoadResult {
  readonly state: "loaded" | "refused" | "timeout";
  /** The natural width, or 0. */
  readonly width: number;
  /** The natural height, or 0. */
  readonly height: number;
  /** The time from the start of the load to the event, in milliseconds. */
  readonly ms: number;
  /** The value is true when the browser gave pixels to a canvas. */
  readonly drawn: boolean;
  /** The red, green, blue and alpha values of the top-left pixel. */
  readonly pixel: readonly [number, number, number, number] | undefined;
  /** A canvas with the image. It exists only with the option `paint`. */
  readonly canvas: HTMLCanvasElement | undefined;
}

/** The options of a load. */
export interface LoadOptions {
  /** The value true also draws the image on a canvas. */
  readonly paint: boolean;
}

/** The time limit of one load, in milliseconds. */
const LOAD_LIMIT = 4000;

/** The maximum number of pixels that the page draws. A visitor can write any size into a header. */
const MAX_PIXELS = 16_000_000;

/** The longest side of a canvas, in pixels. */
const MAX_SIDE = 320;

/** The number of blob URLs that the page holds. The probe reads it from the `body` element. */
let open = 0;

const report = (): void => {
  document.body.dataset["openUrls"] = String(open);
};

interface Painted {
  readonly drawn: boolean;
  readonly pixel: LoadResult["pixel"];
  readonly canvas: HTMLCanvasElement | undefined;
}

const NOT_DRAWN: Painted = { drawn: false, pixel: undefined, canvas: undefined };

/** This function draws a loaded image on a new canvas and reads its top-left pixel. */
async function paintImage(image: HTMLImageElement): Promise<Painted> {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (width === 0 || height === 0 || width * height > MAX_PIXELS) return NOT_DRAWN;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  try {
    // A decode with no end must not stop the page, so a time limit also ends the wait.
    const limit = new Promise<void>((_, reject) => setTimeout(() => reject(new Error("decode time limit")), LOAD_LIMIT));
    await Promise.race([image.decode(), limit]);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return NOT_DRAWN;
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
    return { drawn: true, pixel: [r, g, b, a], canvas };
  } catch {
    // The browser took the image but gave no pixels. The result of the load stays true.
    return NOT_DRAWN;
  }
}

/** This function loads a URL as an image and measures the result. */
export async function loadUrl(url: string, options: LoadOptions): Promise<LoadResult> {
  const image = new Image();
  const start = performance.now();
  const state = await new Promise<LoadResult["state"]>((done) => {
    const timer = setTimeout(() => done("timeout"), LOAD_LIMIT);
    const finish = (result: LoadResult["state"]): void => {
      clearTimeout(timer);
      done(result);
    };
    image.onload = () => finish("loaded");
    image.onerror = () => finish("refused");
    image.src = url;
  });
  const ms = performance.now() - start;
  if (state !== "loaded") return { state, width: 0, height: 0, ms, ...NOT_DRAWN };
  const painted = options.paint ? await paintImage(image) : NOT_DRAWN;
  return { state, width: image.naturalWidth, height: image.naturalHeight, ms, ...painted };
}

/** This function loads bytes as an image from a blob URL. It revokes the URL after the load, also after a failed load. */
export async function loadBytes(bytes: Uint8Array, type: string, options: LoadOptions): Promise<LoadResult> {
  const blob = new Blob([new Uint8Array(bytes)], type === "" ? {} : { type });
  const url = URL.createObjectURL(blob);
  open += 1;
  report();
  try {
    return await loadUrl(url, options);
  } finally {
    URL.revokeObjectURL(url);
    open -= 1;
    report();
  }
}

/** This function gives the name and the major version of a browser from its user agent text. */
export function browserLabel(agent: string): string {
  const version = (name: string): string | undefined => new RegExp(`${name}/(\\d+)`).exec(agent)?.[1];
  const known: readonly (readonly [string, string])[] = [
    ["Edg", "Edge"],
    ["OPR", "Opera"],
    ["Firefox", "Firefox"],
    ["FxiOS", "Firefox on iOS"],
    ["CriOS", "Chrome on iOS"],
    ["HeadlessChrome", "Headless Chrome"],
    ["Chrome", "Chrome"],
  ];
  for (const [token, name] of known) {
    const major = version(token);
    if (major !== undefined) return `${name} ${major}`;
  }
  const safari = version("Version");
  return safari !== undefined && agent.includes("Safari/") ? `Safari ${safari}` : "this browser";
}

/** This function gives the words for the natural size of a result. */
export const naturalText = (result: LoadResult): string => (result.state === "loaded" ? `${result.width} x ${result.height}` : "none");
