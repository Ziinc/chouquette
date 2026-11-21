// @chouquette/react-dom as Next.js's client runtime uses react-dom.
import { version as reactVersion, useState } from "react";
import { afterEach, expect, test } from "vitest";
import * as ReactDOM from "@chouquette/react-dom";
import { hydrateRoot } from "@chouquette/react-dom/client";
import { setHost } from "../src/host";

const frames: Record<string, any>[] = [];
afterEach(() => {
  setHost(undefined);
  frames.length = 0;
});
const host = () => setHost({ send: (_w, j) => void frames.push(JSON.parse(j)), onEvent() {}, call() {} });

test("hydrateRoot renders into window 0, whatever the container", () => {
  host();
  hydrateRoot({} as never, <p>hi</p>);
  expect(frames[0].root).toEqual({ t: "p", a: {}, c: ["hi"] });
});

test("a document renders: html and body as divs, head hidden", () => {
  host();
  hydrateRoot(
    {} as never,
    <html lang="en" className="h-full">
      <head>
        <title>Home</title>
        <meta name="description" content="x" />
      </head>
      <body className="flex">hi</body>
    </html>,
  );
  expect(frames[0].root).toEqual({
    t: "div",
    a: { lang: "en", class: "h-full" },
    c: [
      { t: "div", a: { class: "hidden" }, c: [{ t: "div", a: { class: "hidden" }, c: ["Home"] }, { t: "div", a: { class: "hidden" }, c: [] }] },
      { t: "div", a: { class: "flex" }, c: ["hi"] },
    ],
  });
});

test("the rest of react-dom's API: flushSync, portals, resource hints, form hooks", () => {
  expect(ReactDOM.version).toBe(reactVersion);
  expect(ReactDOM.flushSync(() => 3)).toBe(3);
  expect(ReactDOM.unstable_batchedUpdates((a: number) => a + 1, 1)).toBe(2);
  expect(ReactDOM.createPortal(<p />, {} as never)).toBeNull();
  for (const hint of [ReactDOM.preload, ReactDOM.preinit, ReactDOM.preconnect, ReactDOM.prefetchDNS, ReactDOM.preloadModule, ReactDOM.preinitModule])
    expect(hint("/x.css", { as: "style" } as never)).toBeUndefined();
  expect(ReactDOM.requestFormReset({} as never)).toBeUndefined();

  host();
  let status: unknown;
  function Form() {
    status = ReactDOM.useFormStatus();
    const [n, act] = ReactDOM.useFormState((s: number) => s + 1, 1);
    const [, rerender] = useState(0);
    return <p onClick={() => rerender(1)}>{n}</p>;
  }
  hydrateRoot({} as never, <Form />);
  expect(status).toEqual({ pending: false, data: null, method: null, action: null });
  expect(frames[0].root.c).toEqual(["1"]);
});

test("default imports work too, as react-dom's CommonJS gives them", async () => {
  const client = (await import("@chouquette/react-dom/client")).default;
  const dom = (await import("@chouquette/react-dom")).default;
  expect(typeof client.hydrateRoot).toBe("function");
  expect(typeof client.createRoot).toBe("function");
  expect(typeof dom.flushSync).toBe("function");
  expect(dom.version).toBe(reactVersion);
});
