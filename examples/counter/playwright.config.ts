// The built app, driven through gpui-playwright: the host is the Playwright
// server, so no browser is launched. Until `chouquette e2e` exists, run
// `npm run build` and build the host with `--features playwright` first.
import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const port = process.env.GPUI_PLAYWRIGHT_PORT ?? "9333";
const host = process.env.CHOUQUETTE_HOST ?? resolve(import.meta.dirname, "../../native/target/debug/chouquette_host");

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { connectOptions: { wsEndpoint: `ws://127.0.0.1:${port}/` } },
  webServer: {
    command: host,
    url: `http://127.0.0.1:${port}/`,
    env: { GPUI_PLAYWRIGHT: port, CHOUQUETTE_APP: resolve(import.meta.dirname, "dist") },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
  },
});
