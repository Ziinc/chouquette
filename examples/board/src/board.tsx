import { useState } from "react";

/** A card to drag around, tied to a fixed point by a line. */
export function Board() {
  const [at, setAt] = useState({ x: 40, y: 40 });
  const [lifts, setLifts] = useState(0);
  const [file, setFile] = useState<string | null>(null);

  return (
    <div className="relative size-full bg-[#f8fafc]">
      <line x1="20" y1="20" x2={at.x} y2={at.y} className="stroke-[#64748b]" />
      <line x1="300" y1="40" x2="420" y2="160" curve className="stroke-[#0DB9B6]" />
      <div className="absolute left-[20px] top-[200px] w-[140px] h-[120px] overflow-y-auto bg-[#ffffff]" aria-label="Scroller">
        <div className="flex-col">
          {Array.from({ length: 30 }, (_, i) => (
            <text key={i} aria-label={`Item ${i + 1}`}>Item {i + 1}</text>
          ))}
        </div>
      </div>
      <div className="absolute left-[300px] top-[200px] flex-col gap-1">
        <button accept="csv,xlsx" className="px-2 py-1 bg-[#e2e8f0]" aria-label="Choose file" onPickFile={e => setFile(e.path ?? null)}>
          Choose file
        </button>
        {file && <text>Chose {file}</text>}
      </div>
      <div className="absolute left-[200px] top-[260px] w-[300px]">
        <div className="w-full max-w-[150px] p-2 bg-[#e2e8f0]" aria-label="Note">
          <text>Capped</text>
        </div>
      </div>
      <div
        className={`absolute left-[${at.x}px] top-[${at.y}px] p-3 rounded-md bg-[#ffffff] border`}
        aria-label="Card"
        onDragBy={e => setAt(a => ({ x: a.x + Math.round(e.dx), y: a.y + Math.round(e.dy) }))}
      >
        <text>At {at.x},{at.y}</text>
      </div>
      {/* Over the card's right side, so dragging it must not drag the card. */}
      <div className="absolute left-[100px] top-[45px] p-1 bg-[#fde68a]" aria-label="Lid" onDragBy={() => setLifts(l => l + 1)}>
        <text>Lifts: {lifts}</text>
      </div>
    </div>
  );
}
