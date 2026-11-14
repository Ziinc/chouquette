import { expect, test } from "vitest";
import { bindgenEnv, mobileSteps } from "../cli/mobile.mjs";

const common = { native: "/n", archive: "/t/app.tar.gz", config: "/t/tauri.json", out: "/o", name: "counter" };
const env = ["--env", "LEVAIN_APP_ARCHIVE=/t/app.tar.gz"];

test("an Android emulator build", () => {
  expect(mobileSteps({ ...common, target: "android-x86_64" })).toEqual([
    ["levain-pack", ["init", "android", "--project", "/n/chouquette_host", "--config", "/t/tauri.json", ...env]],
    ["levain-pack", ["build", "android", "--project", "/n/chouquette_host", "--config", "/t/tauri.json", ...env,
      "--product", "apk=/o/counter.apk", "--", "--apk", "--target", "x86_64", "--debug"]],
  ]);
});

test("an iOS simulator build", () => {
  expect(mobileSteps({ ...common, target: "ios-sim" })).toEqual([
    ["levain-pack", ["init", "ios", "--project", "/n/chouquette_ios", "--config", "/t/tauri.json", ...env]],
    ["levain-pack", ["build", "ios", "--project", "/n/chouquette_ios", "--config", "/t/tauri.json", ...env,
      "--product", "app=/o/counter.app", "--", "--target", "aarch64-sim", "--debug"]],
  ]);
});

test("release builds for phones, signed from the environment on Android", () => {
  const android = mobileSteps({ ...common, target: "android-arm64", release: true, signingEnv: "COUNTER_ANDROID" });
  expect(android[0][1]).toContain("--signing-env");
  expect(android[1][1].slice(-6)).toEqual(["--product", "aab=/o/counter.aab", "--", "--aab", "--target", "aarch64"]);
  const ios = mobileSteps({ ...common, target: "ios", release: true });
  expect(ios[1][1].slice(-5)).toEqual(["--product", "ipa=/o/counter.ipa", "--", "--target", "aarch64"]);
});

test("an unknown target is refused", () => {
  expect(() => mobileSteps({ ...common, target: "web" })).toThrow(/android-x86_64/);
});

test("bindgen parses QuickJS's headers against the phone's SDK", () => {
  expect(bindgenEnv("android-arm64", { ndk: "/ndk", host: "linux-x86_64" })).toEqual([
    "BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android",
    "--sysroot=/ndk/toolchains/llvm/prebuilt/linux-x86_64/sysroot",
  ]);
  expect(bindgenEnv("ios-sim", { sdk: "/sdk/iPhoneSimulator.sdk" })).toEqual([
    "BINDGEN_EXTRA_CLANG_ARGS_aarch64_apple_ios_sim",
    "--sysroot=/sdk/iPhoneSimulator.sdk --target=arm64-apple-ios-simulator",
  ]);
  expect(bindgenEnv("ios", { sdk: "/sdk/iPhoneOS.sdk" })[1]).toBe("--sysroot=/sdk/iPhoneOS.sdk --target=arm64-apple-ios");
});

test("the build passes bindgen's flags to levain-pack", () => {
  const steps = mobileSteps({ ...common, target: "android-x86_64", extraEnv: ["K", "V W"] });
  expect(steps[1][1]).toContain("K=V W");
});
