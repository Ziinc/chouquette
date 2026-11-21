// chouquette/test: queries and user actions over the headless host, as
// Baguette.Test drives a view.
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { List, useKeymap, clipboard } from "../src";
import { render, screen, user, within } from "../src/test";

describe("queries", () => {
  test("by role and name, text, label and placeholder", () => {
    render(
      <div>
        <h1>Title</h1>
        <input aria-label="Search" placeholder="Find…" />
        <input type="checkbox" aria-label="Done" checked />
        <button aria-label="Close">x</button>
        <ul aria-label="Items"><li>a</li><li>b</li></ul>
      </div>,
    );
    expect(screen.getByRole("heading").node.c).toEqual(["Title"]);
    expect(screen.getByRole("textbox", { name: "Search" })).toEqual(screen.getByLabelText("Search"));
    expect(screen.getByPlaceholderText("Find…").node.a["aria-label"]).toBe("Search");
    expect(screen.getByRole("checkbox", { name: "Done" })).toBeChecked();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(within(screen.getByRole("list", { name: "Items" })).getByText("b")).toBeVisible();
    expect(screen.queryByText("nope")).toBeNull();
    expect(screen.getByText(/^Ti/)).toBeVisible();
    expect(() => screen.getByRole("button", { name: "Open" })).toThrow(/no element with role button named "Open"/);
    expect(screen.text()).toBe("Title x a b");
  });
});

describe("user actions", () => {
  function Form() {
    const [draft, setDraft] = useState("");
    const [saved, setSaved] = useState<string[]>([]);
    const [agree, setAgree] = useState(false);
    return (
      <div>
        <form
          aria-label="New"
          action={formData => {
            setSaved(s => [...s, `${formData.get("title")}${formData.has("agree") ? "+" : ""}`]);
            setDraft("");
          }}
        >
          <input name="title" aria-label="Title" value={draft} onChange={e => setDraft(e.target.value)} />
          <input name="agree" type="checkbox" aria-label="Agree" checked={agree} onChange={e => setAgree(Boolean(e.target.checked))} />
          <button type="submit">Save</button>
        </form>
        <p>Draft: {draft}</p>
        <p>Saved: {saved.join(",")}</p>
      </div>
    );
  }

  test("fill, check and submit a form", async () => {
    render(<Form />);
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.fill(title, "milk");
    expect(screen.getByText("Draft: milk")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("milk");
    await user.click(screen.getByRole("checkbox", { name: "Agree" }));
    expect(screen.getByRole("checkbox", { name: "Agree" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Saved: milk+")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
    await user.fill(screen.getByRole("textbox", { name: "Title" }), "eggs");
    await user.submit(screen.getByRole("textbox", { name: "Title" }));
    expect(screen.getByText("Saved: milk+,eggs+")).toBeVisible();
  });

  test("keydown reaches window bindings; a focused input keeps its own chords", async () => {
    function Keys() {
      const [last, setLast] = useState("none");
      return (
        <div onWindowKeyDown={e => setLast(`${e.ctrlKey ? "ctrl+" : ""}${e.key}`)}>
          <input aria-label="Name" />
          <p>Last: {last}</p>
        </div>
      );
    }
    render(<Keys />);
    await user.keydown("Enter");
    expect(screen.getByText("Last: Enter")).toBeVisible();
    await user.keydown("d", { focus: screen.getByRole("textbox", { name: "Name" }) });
    expect(screen.getByText("Last: Enter")).toBeVisible();
    await user.keydown("c", { ctrl: true, focus: screen.getByRole("textbox", { name: "Name" }) });
    expect(screen.getByText("Last: Enter")).toBeVisible();
    await user.keydown("d", { ctrl: true, focus: screen.getByRole("textbox", { name: "Name" }) });
    expect(screen.getByText("Last: ctrl+d")).toBeVisible();
  });

  test("keystrokes go to the keymap of the focused context", async () => {
    function Palette() {
      const [open, setOpen] = useState(false);
      useKeymap("ctrl-k", () => setOpen(true), { context: "Jobs" });
      useKeymap("escape", () => setOpen(false));
      return (
        <div>
          <button keyContext="Jobs" tabIndex={1} aria-label="Jobs panel">Jobs</button>
          <p>{open ? "Palette open" : "Palette closed"}</p>
        </div>
      );
    }
    render(<Palette />);
    await user.keystroke("ctrl-k");
    expect(screen.getByText("Palette closed")).toBeVisible();
    await user.keystroke("ctrl-k", { focus: screen.getByRole("button", { name: "Jobs panel" }) });
    expect(screen.getByText("Palette open")).toBeVisible();
    await user.keystroke("escape");
    expect(screen.getByText("Palette closed")).toBeVisible();
  });

  test("drag, pick a file, and show a list's rows", async () => {
    function Board() {
      const [at, setAt] = useState([40, 40]);
      const [file, setFile] = useState("");
      return (
        <div>
          <div aria-label="Card" onDragBy={e => setAt([at[0] + e.dx, at[1] + e.dy])}>At {at.join(",")}</div>
          <button aria-label="Choose file" onPickFile={e => setFile(e.path!)}>Choose</button>
          <p>File: {file}</p>
          <List id="jobs" rows={10000} renderRow={i => <p>Job {i}</p>} />
        </div>
      );
    }
    render(<Board />);
    await user.drag(screen.getByLabelText("Card"), 100, 50);
    expect(screen.getByText("At 140,90")).toBeVisible();
    await user.pickFile(screen.getByRole("button", { name: "Choose file" }), "/tmp/a.csv");
    expect(screen.getByText("File: /tmp/a.csv")).toBeVisible();
    await user.showRows("jobs", 9998, 9999);
    expect(screen.text()).toContain("Job 9998 Job 9999");
  });

  test("platform calls answer from the headless host", async () => {
    function Clip() {
      const [pasted, setPasted] = useState<string | null>(null);
      return (
        <div>
          <button onClick={() => clipboard.write("hi")}>Copy</button>
          <button onClick={async () => setPasted(await clipboard.read())}>Paste</button>
          <p>Pasted: {pasted}</p>
        </div>
      );
    }
    const { host } = render(<Clip />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(host.clipboard).toBe("hi");
    await user.click(screen.getByRole("button", { name: "Paste" }));
    expect(screen.getByText("Pasted: hi")).toBeVisible();
  });
});
