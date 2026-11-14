import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div className="size-full flex-col items-center justify-center gap-6 bg-background">
      <p className="text-3xl font-bold">Count: {count}</p>
      <button className="px-4 py-2 rounded-md bg-primary" aria-label="Increment"
        onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}
