// The Playwright config for an app's end-to-end tests: the built app,
// driven through gpui-playwright (the host is the Playwright server, so no
// browser is launched). `npm run build` and a host built with the
// `playwright` feature come first; CHOUQUETTE_HOST names another host.
import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

/** @param {{ dir: string, port?: string }} options */
export function e2eConfig({ dir, port = process.env.GPUI_PLAYWRIGHT_PORT ?? "9333" }) {
  const exe = process.platform === "win32" ? ".exe" : "";
  const host = process.env.CHOUQUETTE_HOST ?? resolve(import.meta.dirname, `../../../native/target/debug/chouquette_host${exe}`);
  return defineConfig({
    testDir: resolve(dir, "e2e"),
    // One app, one window: tests share it and run one at a time.
    workers: 1,
    fullyParallel: false,
    use: { connectOptions: { wsEndpoint: `ws://127.0.0.1:${port}/` } },
    webServer: {
      command: host,
      url: `http://127.0.0.1:${port}/`,
      env: { GPUI_PLAYWRIGHT: port, CHOUQUETTE_APP: resolve(dir, "dist") },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
    },
  });
}
