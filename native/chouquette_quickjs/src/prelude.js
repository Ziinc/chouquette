// What a chouquette app expects of its engine, on top of QuickJS: the host
// (chouquette's Transport), timers and console. Runs before the app.
(() => {
  const g = globalThis;
  const render = g.__chouquette_render;
  const log = g.__chouquette_log;
  const listeners = [];

  g.__chouquette_host = {
    send: (window, json) => render(window, json),
    onEvent: listener => void listeners.push(listener),
  };

  const report = error => log(error && error.stack ? `${error}\n${error.stack}` : String(error));

  // An event from the host, as JSON.
  g.__chouquette_dispatch = json => {
    const event = JSON.parse(json);
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        report(error);
      }
    }
  };

  let nextId = 1;
  const timers = new Map();
  const add = (fn, ms, args, every) => {
    const id = nextId++;
    const delay = Math.max(0, Number(ms) || 0);
    timers.set(id, { at: Date.now() + delay, fn, args, every: every ? delay : null });
    return id;
  };
  g.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  g.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  g.clearTimeout = g.clearInterval = id => void timers.delete(id);

  // Runs the timers that are due; the ms until the next one, or -1.
  g.__chouquette_timers = () => {
    const now = Date.now();
    const due = [...timers].filter(([, t]) => t.at <= now).sort(([, a], [, b]) => a.at - b.at);
    for (const [id, t] of due) {
      if (!timers.has(id)) continue;
      if (t.every === null) timers.delete(id);
      else t.at = now + t.every;
      try {
        t.fn(...t.args);
      } catch (error) {
        report(error);
      }
    }
    let next = -1;
    for (const t of timers.values()) next = next < 0 ? t.at : Math.min(next, t.at);
    return next < 0 ? -1 : Math.max(0, next - Date.now());
  };

  if (typeof g.queueMicrotask !== "function") g.queueMicrotask = fn => void Promise.resolve().then(fn);

  const line = (...args) => log(args.map(a => (typeof a === "string" ? a : JSON.stringify(a) ?? String(a))).join(" "));
  g.console = { log: line, info: line, warn: line, error: line, debug: line };
})();
