// Runs a Next.js app built with withChouquette on chouquette's embedded
// Node, all in this process: Next's server answers requests in memory (no
// port), and its client runtime (App or Pages Router) runs in a happy-dom
// window whose react-dom is chouquette's, so pages render natively.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const inject = require("light-my-request");
const { Window } = require("happy-dom");

const origin = "http://localhost";

/** A built file of the app, for requests the client makes synchronously. */
function staticFile(dir, href) {
  const url = new URL(href);
  if (url.origin !== origin || !url.pathname.startsWith("/_next/static/")) return null;
  const file = path.join(dir, ".next/static", decodeURIComponent(url.pathname.slice("/_next/static/".length)));
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

/**
 * Starts the app at `dir` (a Next.js app root, built) and renders `url` to
 * `host` (levain's host, as the runtime sets it up). Resolves once the first
 * page has loaded, with the window and a way to make requests in process.
 */
async function run({ dir, host = globalThis.__chouquette_host, url = "/" } = {}) {
  process.chdir(dir);
  process.env.NODE_ENV = "production";
  const requireApp = createRequire(path.join(dir, "package.json"));
  const serverFiles = path.join(dir, ".next/required-server-files.json");
  const conf = fs.existsSync(serverFiles) ? JSON.parse(fs.readFileSync(serverFiles, "utf8")).config : undefined;
  if (conf) process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(conf);
  const next = requireApp("next");
  const app = next({ dir, dev: false, conf, hostname: "localhost", port: 80 });
  await app.prepare();
  const handle = app.getRequestHandler();

  /** A request to Next, answered in memory. */
  const dispatch = (path, init = {}) =>
    inject((req, res) => handle(req, res), {
      method: init.method ?? "GET",
      url: path,
      headers: { host: "localhost", ...init.headers },
      payload: init.body,
    });

  const window = new Window({
    url: origin + url,
    console,
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      // CSS means nothing to GPUI: stylesheets are skipped, quietly.
      disableCSSFileLoading: true,
      handleDisabledFileLoadingAsSuccess: true,
      errorCapture: "processLevel",
      navigator: { userAgent: "chouquette" },
      fetch: {
        interceptor: {
          beforeSyncRequest({ request }) {
            const file = staticFile(dir, request.url);
            if (!file) return undefined;
            return { status: 200, statusText: "OK", ok: true, url: request.url, redirected: false,
              headers: new Map([["content-type", "application/javascript"]]), body: file };
          },
          async beforeAsyncRequest({ request, window }) {
            const file = staticFile(dir, request.url);
            if (file) return new window.Response(file, { status: 200, headers: { "content-type": "application/javascript" } });
            const target = new URL(request.url);
            if (target.origin !== origin) return undefined;
            const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
            const res = await dispatch(target.pathname + target.search, {
              method: request.method,
              headers: Object.fromEntries(request.headers),
              body,
            });
            const headers = Object.entries(res.headers).flatMap(([k, v]) => (v == null ? [] : Array.isArray(v) ? v.map(x => [k, String(x)]) : [[k, String(v)]]));
            return new window.Response(res.rawPayload, { status: res.statusCode, headers });
          },
        },
      },
    },
  });
  window.__chouquette_host = host;

  const page = await dispatch(url, { headers: { accept: "text/html" } });
  window.document.write(page.payload);
  await window.happyDOM.waitUntilComplete();
  return { window, dispatch, close: () => window.happyDOM.close() };
}

module.exports = { run };
