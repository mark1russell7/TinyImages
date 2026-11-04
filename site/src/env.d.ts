/** The files of the museum and the README. Vite writes them at build time from the root of the repository. */
declare const __MUSEUM__: import("../museum-files.ts").MuseumData;
/** The version of the site, the commit and the date of the build. Vite writes this value at build time. */
declare const __BUILD__: { readonly sha: string; readonly date: string; readonly version: string };
