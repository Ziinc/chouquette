import { clipboard, List, useAppearance, useKeymap, windows } from "chouquette";
import { useState } from "react";

/** chouquette's native API on one screen: gpui-kit's components and a long list. */
export function Gallery() {
  const [done, setDone] = useState(40);
  const [palette, setPalette] = useState(false);
  const [pasted, setPasted] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [entries, setEntries] = useState([1]);
  const appearance = useAppearance();

  useKeymap("ctrl-k", () => setPalette(true), { context: "Jobs" });
  useKeymap("escape", () => setPalette(false));

  return (
    <div className="size-full flex-col gap-4 p-6">
      <div className="flex gap-2 items-center">
        <kit-tag variant="danger" pill>Failed</kit-tag>
        <kit-tag variant="success">Done</kit-tag>
        <kit-kbd keys="ctrl-k" />
        <kit-spinner size="small" />
        <div aria-label="Tween" className="w-16 h-6 bg-[#ff0000]" animate-to="bg-[#0000ff]" duration={600} />
        <button aria-label="Add entry" className="px-2 border border-border" onClick={() => setEntries(e => [e[0] + 1, ...e])}>
          Add entry
        </button>
      </div>
      <div className="flex-col">
        {entries.map(entry => (
          <div key={entry} id={`entry-${entry}`} aria-label={`Entry ${entry}`} className="relative h-6 w-48 bg-[#ffffff]">
            <div id={`flash-${entry}`} animate="flash" easing="linear" duration={2000} className="absolute inset-0 bg-[#00ff00]" />
            <text>Entry {entry}</text>
          </div>
        ))}
      </div>
      <kit-progress value={done} aria-label="Upload" className="w-64" />
      <text>{done}% uploaded</text>
      <button className="px-3 py-1 rounded-md bg-primary" aria-label="More" onClick={() => setDone(d => Math.min(d + 10, 100))}>
        More
      </button>
      <kit-skeleton className="w-64 h-4" />
      <div className="flex gap-2 items-center">
        <button keyContext="Jobs" tabIndex={1} aria-label="Jobs panel" className="px-2 border border-border">Jobs</button>
        <text>{palette ? "Palette open" : "Palette closed"}</text>
      </div>
      <div className="flex gap-2 items-center">
        <button aria-label="Copy" className="px-2 border border-border" onClick={() => clipboard.write("copied from gallery")}>Copy</button>
        <button aria-label="Paste" className="px-2 border border-border" onClick={async () => setPasted(await clipboard.read())}>Paste</button>
        <button
          aria-label="Rename"
          className="px-2 border border-border"
          onClick={async () => {
            await windows.setTitle(0, "Gallery renamed");
            setTitle((await windows.info(0))?.title ?? null);
          }}
        >
          Rename
        </button>
        <button
          aria-label="Details"
          className="px-2 border border-border"
          onClick={async () => {
            await windows.open(1, { title: "Details", width: 320, height: 200 });
            setDetails((await windows.info(1)) !== null);
          }}
        >
          Details
        </button>
      </div>
      <text>Pasted: {pasted}</text>
      <text>Title: {title}</text>
      <text>Details {details ? "open" : "closed"}</text>
      <text>Appearance: {appearance}</text>
      <div className="flex gap-4 items-center">
        <div aria-label="Chart" className="w-32 h-16">
          <canvas className="size-full">
            <rect x="0" y="0" width="64" height="64" className="fill-[#ff0000]" />
            <circle cx="96" cy="32" r="24" className="fill-[#00ff00]" />
            <path d="M 70 60 L 120 60" className="stroke-[#000000]" strokeWidth={2} />
          </canvas>
        </div>
        <div aria-label="Pulse" animate="pulse" duration={900} className="w-8 h-8 bg-[#0000ff]" />
        <icon name="loader" animate="spin" className="size-6" />
        <div aria-label="Track" className="w-64 h-2 bg-muted rounded-full">
          <div aria-label="Half" className="w-1/2 h-full bg-primary rounded-l-full" />
        </div>
      </div>
      <List
        id="jobs"
        rows={10_000}
        className="h-40 w-64 border border-border"
        renderRow={i => (
          <div className="h-8 px-2 flex items-center">
            <text>Job {i}</text>
          </div>
        )}
      />
    </div>
  );
}

