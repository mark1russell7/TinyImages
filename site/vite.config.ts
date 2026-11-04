import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { readMuseum } from "./museum-files.ts";

// The Pages workflow sets SITE_BASE to "/TinyImages". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";
const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { version: string };

// The site has one page. The deploy adds `status/` and `releases/`. The build writes the real bytes of the museum into the page.
export default defineConfig({
  base,
  build: { target: "es2022" },
  define: {
    __MUSEUM__: JSON.stringify(readMuseum(root)),
    __BUILD__: JSON.stringify({ sha: (env["GITHUB_SHA"] ?? "local").slice(0, 7), date: new Date().toISOString().slice(0, 10), version: pkg.version }),
  },
});
