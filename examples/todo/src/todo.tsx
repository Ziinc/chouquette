import { useState } from "react";

type Item = { id: number; title: string; done: boolean };

/**
 * A to-do list: a form with a text input, checkboxes in a list, icons, and
 * a window shortcut (Ctrl+D, or Cmd+D, clears the done todos).
 */
export function Todo() {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [todos, setTodos] = useState<Item[]>([]);
  const [next, setNext] = useState(1);
  const [lastKey, setLastKey] = useState("none");

  function add(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return;
    setTodos(t => [...t, { id: next, title, done: false }]);
    setNext(n => n + 1);
    setDraft("");
  }

  return (
    <div
      className="size-full flex-col gap-4 p-6 bg-background text-foreground"
      onWindowKeyDown={e => {
        const held = (["ctrl", "shift", "alt", "meta"] as const).filter(m => e[`${m}Key`]);
        setLastKey([...held, e.key].join("+"));
        if (e.key === "d" && (e.ctrlKey || e.metaKey)) setTodos(t => t.filter(todo => !todo.done));
      }}
    >
      <h1 className="text-2xl font-bold">Todos</h1>
      <form aria-label="New todo" className="flex-row gap-2" action={add}>
        <input
          name="title"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="What needs to be done?"
          aria-label="Title"
          className="flex-1"
        />
        <button type="submit" className="flex-row items-center gap-1 px-3 py-1 rounded-md bg-primary text-primary-foreground">
          <icon name="plus" className="size-4" />
          <text>Add</text>
        </button>
      </form>
      <ul aria-label="Todos" className="flex-col gap-1">
        {todos.map(todo => (
          <li key={todo.id} className="flex-row items-center justify-between gap-2">
            <div className="flex-row items-center gap-2">
              <input
                type="checkbox"
                checked={todo.done}
                aria-label={todo.title}
                onChange={e => setTodos(t => t.map(x => (x.id === todo.id ? { ...x, done: Boolean(e.target.checked) } : x)))}
              />
              <text className={todo.done ? "text-muted-foreground" : ""}>{todo.title}</text>
            </div>
            <button
              aria-label={`Delete ${todo.title}`}
              title="Delete this todo"
              className="flex-row items-center gap-1 px-2 text-sm"
              onClick={() => setTodos(t => t.filter(x => x.id !== todo.id))}
            >
              <icon name="trash" className="size-4 text-[#dc2626]" />
              <text>Delete</text>
            </button>
          </li>
        ))}
      </ul>
      <text>{todos.filter(t => !t.done).length} of {todos.length} left</text>
      <text>Last key: {lastKey}</text>
      {/* A short scrolling panel whose input starts below its fold. */}
      <div aria-label="Notes" className="h-[64px] flex-none flex-col overflow-y-auto border border-border">
        <div className="h-[160px] flex-none" />
        <input name="note" value={note} onChange={e => setNote(e.target.value)} aria-label="Note" />
      </div>
      <text>Note: {note}</text>
    </div>
  );
}
