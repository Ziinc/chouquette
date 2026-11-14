import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { bundleSteps } from "../cli/bundle.mjs";
import { hostTarget, resolveHost } from "../cli/host.mjs";

test("npm's platform and arch name the host package", () => {
  expect(hostTarget("linux", "x64")).toBe("linux-x64");
  expect(hostTarget("darwin", "arm64")).toBe("darwin-arm64");
  expect(hostTarget("win32", "arm64")).toBe("win32-arm64");
  expect(() => hostTarget("aix", "ppc64")).toThrow(/no chouquette host for aix-ppc64/);
});

test("the host: CHOUQUETTE_HOST, then the npm package, then this checkout's build", () => {
  const dir = mkdtempSync(join(tmpdir(), "host-"));
  const pkg = join(dir, "node_modules/@chouquette/host-linux-x64");
  mkdirSync(join(pkg, "bin"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), "{}");
  for (const f of ["chouquette_host", "levain-pack"]) writeFileSync(join(pkg, "bin", f), "");
  mkdirSync(join(pkg, "project"));

  const fromNpm = resolveHost({ from: dir, platform: "linux", arch: "x64", env: {} });
  expect(fromNpm).toEqual({ host: join(pkg, "bin/chouquette_host"), levainPack: join(pkg, "bin/levain-pack"), project: join(pkg, "project") });

  expect(resolveHost({ from: dir, platform: "linux", arch: "x64", env: { CHOUQUETTE_HOST: "/h", LEVAIN_PACK: "/lp" } }))
    .toMatchObject({ host: "/h", levainPack: "/lp" });

  const none = mkdtempSync(join(tmpdir(), "none-"));
  expect(resolveHost({ from: none, platform: "linux", arch: "x64", env: {}, checkout: join(none, "native") })).toBeNull();
});

test("a desktop bundle around the host, the app in its resources", () => {
  expect(
    bundleSteps({
      levainPack: "/lp", project: "/p", host: "/h/chouquette_host", name: "counter", version: "1.0.0",
      identifier: "com.example.counter", bundles: ["deb", "appimage"], app: "/a/dist", work: "/w", out: "/o",
    }),
  ).toEqual([
    "/lp", ["bundle", "--project", "/p", "--host", "/h/chouquette_host", "--host-name", "chouquette_host",
      "--name", "counter", "--version", "1.0.0", "--identifier", "com.example.counter", "--bundles", "deb,appimage",
      "--target-dir", "/w", "--out", "/o", "--resource", "/a/dist/=app/"],
  ]);
});
