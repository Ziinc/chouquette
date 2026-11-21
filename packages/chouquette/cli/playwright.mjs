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
    // gpui-playwright renders screenshots on Linux only so far.
    grepInvert: process.platform === "linux" ? undefined : /@screenshot/,
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

/**
 * @typedef {string | { should: string } | { text: string, region: string }} Expectation
 * What a viewer should be able to confirm by looking: a plain string must
 * hold, `should` is reported but never fails, `region` names an area.
 */

/**
 * `cargo visual-test check` arguments for `png`.
 * @param {string} png
 * @param {Expectation[]} expectations
 * @param {Record<string, [number, number, number, number]>} [regions]
 */
export function visualArgs(png, expectations, regions = {}) {
  const args = ["visual-test", "check", png];
  for (const [id, box] of Object.entries(regions)) args.push("--region", `${id}=${box.join(",")}`);
  for (const e of expectations) {
    if (typeof e === "string") args.push("-e", e);
    else if ("should" in e) args.push("--should", e.should);
    else args.push("--expect-in", `${e.region}=${e.text}`);
  }
  return args;
}

/**
 * Screenshots `page` as `name` and has gpui-visual-test's judge decide each
 * expectation (`GPUI_VISUAL_JUDGE`: an agent or person by default, or a
 * vision model). Verdicts are kept beside the shot in `GPUI_VISUAL_DIR`
 * (`visual/` here) and reused while it is unchanged; commit them.
 * `GPUI_VISUAL_UNSURE=warn` lets undecided ones pass.
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 * @param {Expectation[]} expectations
 * @param {{ regions?: Record<string, [number, number, number, number]>, dir?: string }} [options]
 */
export async function expectToLook(page, name, expectations, { regions, dir = process.env.GPUI_VISUAL_DIR ?? "visual" } = {}) {
  const { execFileSync } = await import("node:child_process");
  const png = resolve(dir, `${name}.png`);
  await page.screenshot({ path: png });
  try {
    execFileSync("cargo", [...visualArgs(png, expectations, regions), "--dir", resolve(dir)], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const e = /** @type {{ status?: number, stdout?: string, stderr?: string }} */ (error);
    const verdict = e.status === 2 ? "undecided (record verdicts with `cargo visual-test pending`)" : "failed";
    throw new Error(`visual check ${name} ${verdict}:\n${e.stdout ?? ""}${e.stderr ?? ""}`);
  }
}
