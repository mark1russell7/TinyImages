import { fileURLToPath } from "node:url";
import { siteShell } from "@mark1russell7/site-pages/vite";
import { defineConfig } from "vite";
import { readMuseum } from "./museum-files.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

// The site has one page. The deploy adds `status/` and `releases/`. The build writes the real bytes of the museum into the page.
export default defineConfig({
  plugins: [siteShell({ themeKey: "tinyimages-theme" })],
  define: {
    __MUSEUM__: JSON.stringify(readMuseum(root)),
  },
});
