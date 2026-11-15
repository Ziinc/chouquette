// Web-standard globals for apps on QuickJS: text encoding, URL, structured
// clone, events and abort, crypto and fetch. Node's own APIs are the Node
// runtime's. Runs after prelude.js, before the app.
(() => {
  const g = globalThis;
  const nativeUrl = g.__chouquette_url;
  const urlParse = (href, base) => nativeUrl(href, base ?? null);
  const random = g.__chouquette_random;
  const nativeFetch = g.__chouquette_fetch;

  class DOMException extends Error {
    constructor(message = "", name = "Error") {
      super(message);
      this.name = name;
    }
  }
  g.DOMException ??= DOMException;

  // --- Text encoding (UTF-8) ---
  class TextEncoder {
    get encoding() {
      return "utf-8";
    }
    encode(input = "") {
      const s = String(input);
      const out = [];
      for (let i = 0; i < s.length; i++) {
        let c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
          const d = s.charCodeAt(i + 1);
          if (d >= 0xdc00 && d <= 0xdfff) {
            c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
            i++;
          } else c = 0xfffd;
        } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return new Uint8Array(out);
    }
  }

  const bytesOf = input =>
    input instanceof ArrayBuffer ? new Uint8Array(input)
    : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(0);

  class TextDecoder {
    get encoding() {
      return "utf-8";
    }
    decode(input) {
      const b = bytesOf(input);
      let out = "";
      for (let i = 0; i < b.length; ) {
        const c = b[i];
        let cp = 0xfffd;
        let n = 1;
        const cont = k => i + k < b.length && (b[i + k] & 0xc0) === 0x80;
        if (c < 0x80) cp = c;
        else if (c >= 0xc2 && c < 0xe0 && cont(1)) [cp, n] = [((c & 31) << 6) | (b[i + 1] & 63), 2];
        else if (c >= 0xe0 && c < 0xf0 && cont(1) && cont(2)) [cp, n] = [((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63), 3];
        else if (c >= 0xf0 && c < 0xf5 && cont(1) && cont(2) && cont(3))
          [cp, n] = [((c & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63), 4];
        out += String.fromCodePoint(cp);
        i += n;
      }
      return out.charCodeAt(0) === 0xfeff ? out.slice(1) : out;
    }
  }
  g.TextEncoder = TextEncoder;
  g.TextDecoder = TextDecoder;

  // --- URL ---
  const formEncode = s =>
    encodeURIComponent(s).replace(/[!'()~]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%20/g, "+");
  const formDecode = s => decodeURIComponent(s.replace(/\+/g, " "));

  class URLSearchParams {
    #list = [];
    #onChange;
    constructor(init = "", onChange) {
      this.#onChange = onChange;
      if (typeof init === "string") this.#parse(init);
      else if (init instanceof URLSearchParams) this.#list = [...init];
      else if (init && typeof init[Symbol.iterator] === "function") for (const [k, v] of init) this.#list.push([String(k), String(v)]);
      else if (init && typeof init === "object") for (const k of Object.keys(init)) this.#list.push([k, String(init[k])]);
    }
    #parse(s) {
      this.#list = s
        .replace(/^\?/, "")
        .split("&")
        .filter(Boolean)
        .map(pair => {
          const at = pair.indexOf("=");
          return at < 0 ? [formDecode(pair), ""] : [formDecode(pair.slice(0, at)), formDecode(pair.slice(at + 1))];
        });
    }
    _reset(s) {
      this.#parse(s);
    }
    #changed() {
      this.#onChange?.(this.toString());
    }
    get size() {
      return this.#list.length;
    }
    append(k, v) {
      this.#list.push([String(k), String(v)]);
      this.#changed();
    }
    delete(k) {
      this.#list = this.#list.filter(([n]) => n !== String(k));
      this.#changed();
    }
    get(k) {
      return this.#list.find(([n]) => n === String(k))?.[1] ?? null;
    }
    getAll(k) {
      return this.#list.filter(([n]) => n === String(k)).map(([, v]) => v);
    }
    has(k) {
      return this.#list.some(([n]) => n === String(k));
    }
    set(k, v) {
      const name = String(k);
      const at = this.#list.findIndex(([n]) => n === name);
      if (at < 0) this.#list.push([name, String(v)]);
      else this.#list = [...this.#list.slice(0, at), [name, String(v)], ...this.#list.slice(at + 1).filter(([n]) => n !== name)];
      this.#changed();
    }
    sort() {
      this.#list.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      this.#changed();
    }
    forEach(fn, self) {
      for (const [k, v] of this.#list) fn.call(self, v, k, this);
    }
    keys() {
      return this.#list.map(([k]) => k)[Symbol.iterator]();
    }
    values() {
      return this.#list.map(([, v]) => v)[Symbol.iterator]();
    }
    entries() {
      return this.#list.map(([k, v]) => [k, v])[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entries();
    }
    toString() {
      return this.#list.map(([k, v]) => `${formEncode(k)}=${formEncode(v)}`).join("&");
    }
  }

  class URL {
    #c;
    #params;
    constructor(url, base) {
      const json = urlParse(String(url), base === undefined ? undefined : String(base));
      if (!json) throw new TypeError(`Invalid URL: ${url}`);
      this.#c = JSON.parse(json);
      this.#params = new URLSearchParams(this.#c.search, s => {
        this.#c = JSON.parse(urlParse(this.#with({ search: s ? `?${s}` : "" })));
      });
    }
    static canParse(url, base) {
      return !!urlParse(String(url), base === undefined ? undefined : String(base));
    }
    #with(part) {
      const c = { ...this.#c, ...part };
      return c.href.slice(0, c.href.length - this.#c.pathname.length - this.#c.search.length - this.#c.hash.length) + c.pathname + c.search + c.hash;
    }
    #set(part) {
      const json = urlParse(this.#with(part));
      if (json) this.#c = JSON.parse(json);
      this.#params._reset(this.#c.search);
    }
    get href() {
      return this.#c.href;
    }
    set href(v) {
      const json = urlParse(String(v));
      if (!json) throw new TypeError(`Invalid URL: ${v}`);
      this.#c = JSON.parse(json);
      this.#params._reset(this.#c.search);
    }
    get origin() {
      return this.#c.origin;
    }
    get protocol() {
      return this.#c.protocol;
    }
    get username() {
      return this.#c.username;
    }
    get password() {
      return this.#c.password;
    }
    get host() {
      return this.#c.host;
    }
    get hostname() {
      return this.#c.hostname;
    }
    get port() {
      return this.#c.port;
    }
    get pathname() {
      return this.#c.pathname;
    }
    set pathname(v) {
      this.#set({ pathname: String(v).startsWith("/") ? String(v) : `/${v}` });
    }
    get search() {
      return this.#c.search;
    }
    set search(v) {
      const s = String(v);
      this.#set({ search: s && !s.startsWith("?") ? `?${s}` : s === "?" ? "" : s });
    }
    get hash() {
      return this.#c.hash;
    }
    set hash(v) {
      const s = String(v);
      this.#set({ hash: s && !s.startsWith("#") ? `#${s}` : s === "#" ? "" : s });
    }
    get searchParams() {
      return this.#params;
    }
    toString() {
      return this.href;
    }
    toJSON() {
      return this.href;
    }
  }
  g.URL = URL;
  g.URLSearchParams = URLSearchParams;

  // --- structuredClone ---
  g.structuredClone = (value, _options) => {
    const seen = new Map();
    const clone = v => {
      if (v === null || (typeof v !== "object" && typeof v !== "function")) {
        if (typeof v === "symbol") throw new DOMException("A symbol could not be cloned", "DataCloneError");
        return v;
      }
      if (typeof v === "function") throw new DOMException(`${v} could not be cloned`, "DataCloneError");
      if (seen.has(v)) return seen.get(v);
      let out;
      if (v instanceof Date) out = new Date(v.getTime());
      else if (v instanceof RegExp) out = new RegExp(v.source, v.flags);
      else if (v instanceof ArrayBuffer) out = v.slice(0);
      else if (ArrayBuffer.isView(v)) out = new v.constructor(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
      else if (v instanceof Map) {
        out = new Map();
        seen.set(v, out);
        for (const [k, x] of v) out.set(clone(k), clone(x));
        return out;
      } else if (v instanceof Set) {
        out = new Set();
        seen.set(v, out);
        for (const x of v) out.add(clone(x));
        return out;
      } else if (v instanceof Error) {
        out = new v.constructor(v.message);
        out.name = v.name;
      } else {
        out = Array.isArray(v) ? [] : {};
        seen.set(v, out);
        for (const k of Object.keys(v)) out[k] = clone(v[k]);
        return out;
      }
      seen.set(v, out);
      return out;
    };
    return clone(value);
  };

  // --- Events and abort ---
  class Event {
    constructor(type, init = {}) {
      this.type = String(type);
      this.bubbles = !!init.bubbles;
      this.cancelable = !!init.cancelable;
      this.defaultPrevented = false;
      this.target = null;
      this.currentTarget = null;
      this.timeStamp = Date.now();
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    }
    stopPropagation() {}
    stopImmediatePropagation() {
      this._stopped = true;
    }
  }
  class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.detail = init.detail ?? null;
    }
  }
  class EventTarget {
    #listeners = new Map();
    addEventListener(type, listener, options) {
      if (!listener) return;
      const list = this.#listeners.get(type) ?? [];
      if (!list.some(l => l.listener === listener)) list.push({ listener, once: !!options?.once });
      this.#listeners.set(type, list);
      options?.signal?.addEventListener("abort", () => this.removeEventListener(type, listener));
    }
    removeEventListener(type, listener) {
      this.#listeners.set(type, (this.#listeners.get(type) ?? []).filter(l => l.listener !== listener));
    }
    dispatchEvent(event) {
      event.target = event.currentTarget = this;
      for (const l of [...(this.#listeners.get(event.type) ?? [])]) {
        if (l.once) this.removeEventListener(event.type, l.listener);
        if (typeof l.listener === "function") l.listener.call(this, event);
        else l.listener.handleEvent(event);
        if (event._stopped) break;
      }
      const on = this[`on${event.type}`];
      if (typeof on === "function") on.call(this, event);
      return !event.defaultPrevented;
    }
  }
  class AbortSignal extends EventTarget {
    aborted = false;
    reason = undefined;
    onabort = null;
    throwIfAborted() {
      if (this.aborted) throw this.reason;
    }
    static abort(reason = new DOMException("This operation was aborted", "AbortError")) {
      const c = new AbortController();
      c.abort(reason);
      return c.signal;
    }
    static timeout(ms) {
      const c = new AbortController();
      setTimeout(() => c.abort(new DOMException("The operation timed out", "TimeoutError")), ms);
      return c.signal;
    }
  }
  class AbortController {
    signal = new AbortSignal();
    abort(reason = new DOMException("This operation was aborted", "AbortError")) {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      this.signal.reason = reason;
      this.signal.dispatchEvent(new Event("abort"));
    }
  }
  Object.assign(g, { Event, CustomEvent, EventTarget, AbortSignal, AbortController });

  // --- crypto ---
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  g.crypto = {
    getRandomValues(array) {
      if (!ArrayBuffer.isView(array) || array instanceof Float32Array || array instanceof Float64Array)
        throw new TypeError("getRandomValues takes an integer typed array");
      if (array.byteLength > 65536) throw new DOMException("at most 65536 bytes", "QuotaExceededError");
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(random(array.byteLength));
      return array;
    },
    randomUUID() {
      const b = g.crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = hex(b);
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },
  };

  // --- fetch ---
  class Headers {
    #map = new Map();
    constructor(init) {
      if (init instanceof Headers) for (const [k, v] of init) this.append(k, v);
      else if (Array.isArray(init)) for (const [k, v] of init) this.append(k, v);
      else if (init) for (const k of Object.keys(init)) this.append(k, init[k]);
    }
    append(k, v) {
      const name = String(k).toLowerCase();
      const old = this.#map.get(name);
      this.#map.set(name, old === undefined ? String(v) : `${old}, ${v}`);
    }
    set(k, v) {
      this.#map.set(String(k).toLowerCase(), String(v));
    }
    get(k) {
      return this.#map.get(String(k).toLowerCase()) ?? null;
    }
    has(k) {
      return this.#map.has(String(k).toLowerCase());
    }
    delete(k) {
      this.#map.delete(String(k).toLowerCase());
    }
    forEach(fn, self) {
      for (const [k, v] of this) fn.call(self, v, k, this);
    }
    entries() {
      return [...this.#map].sort(([a], [b]) => (a < b ? -1 : 1))[Symbol.iterator]();
    }
    keys() {
      return [...this.#map.keys()].sort()[Symbol.iterator]();
    }
    values() {
      return [...this.entries()].map(([, v]) => v)[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entries();
    }
  }

  const toBinary = bytes => {
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return s;
  };
  const fromBinary = s => Uint8Array.from(s, c => c.charCodeAt(0));

  /** A body's bytes, and the content type it implies. */
  function encodeBody(body) {
    if (body == null) return [null, null];
    if (typeof body === "string") return [new TextEncoder().encode(body), "text/plain;charset=UTF-8"];
    if (body instanceof URLSearchParams) return [new TextEncoder().encode(body.toString()), "application/x-www-form-urlencoded;charset=UTF-8"];
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return [bytesOf(body), null];
    return [new TextEncoder().encode(String(body)), "text/plain;charset=UTF-8"];
  }

  class Body {
    #bytes;
    bodyUsed = false;
    constructor(bytes) {
      this.#bytes = bytes ?? new Uint8Array(0);
    }
    #take() {
      if (this.bodyUsed) return Promise.reject(new TypeError("Body has already been consumed"));
      this.bodyUsed = true;
      return Promise.resolve(this.#bytes);
    }
    arrayBuffer() {
      return this.#take().then(b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    }
    bytes() {
      return this.#take().then(b => new Uint8Array(b));
    }
    text() {
      return this.#take().then(b => new TextDecoder().decode(b));
    }
    json() {
      return this.text().then(JSON.parse);
    }
  }

  class Response extends Body {
    constructor(body = null, init = {}) {
      const [bytes, type] = encodeBody(body);
      super(bytes);
      this.status = init.status ?? 200;
      this.statusText = init.statusText ?? "";
      this.headers = new Headers(init.headers);
      if (type && !this.headers.has("content-type")) this.headers.set("content-type", type);
      this.url = init.url ?? "";
      this.redirected = false;
      this.type = "basic";
    }
    get ok() {
      return this.status >= 200 && this.status < 300;
    }
    static json(data, init = {}) {
      const r = new Response(JSON.stringify(data), init);
      r.headers.set("content-type", "application/json");
      return r;
    }
    static error() {
      const r = new Response(null, { status: 0 });
      r.type = "error";
      return r;
    }
  }

  class Request {
    constructor(input, init = {}) {
      const from = input instanceof Request ? input : null;
      this.url = from ? from.url : new URL(String(input)).href;
      this.method = String(init.method ?? from?.method ?? "GET").toUpperCase();
      this.headers = new Headers(init.headers ?? from?.headers);
      this.body = init.body !== undefined ? init.body : (from?.body ?? null);
      this.signal = init.signal ?? from?.signal ?? new AbortController().signal;
    }
  }
  Object.assign(g, { Headers, Response, Request });

  let nextFetch = 1;
  const pending = new Map();

  g.fetch = (input, init) =>
    new Promise((resolve, reject) => {
      let request;
      try {
        request = new Request(input, init);
      } catch (error) {
        return reject(new TypeError(`fetch failed: ${error.message}`));
      }
      if (request.signal.aborted) return reject(request.signal.reason);
      const [bytes, type] = encodeBody(request.body);
      if (type && !request.headers.has("content-type")) request.headers.set("content-type", type);
      const id = nextFetch++;
      pending.set(id, { resolve, reject, url: request.url });
      request.signal.addEventListener("abort", () => {
        if (pending.delete(id)) reject(request.signal.reason);
      });
      nativeFetch(id, request.method, request.url, JSON.stringify([...request.headers]), bytes ? btoa(toBinary(bytes)) : null);
    });

  // The answer to a fetch, from the runtime's HTTP thread.
  g.__chouquette_fetched = r => {
    const p = pending.get(r.id);
    if (!pending.delete(r.id)) return;
    if (r.error) return p.reject(new TypeError(`fetch failed: ${r.error}`));
    p.resolve(new Response(fromBinary(atob(r.body)), { status: r.status, statusText: r.statusText, headers: r.headers, url: p.url }));
  };
})();
