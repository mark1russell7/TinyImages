import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// The tests get the same data of the museum as the page: the define of vite.config.ts.
export default mergeConfig(viteConfig, defineConfig({ test: { include: ["src/**/*.test.ts"] } }));
