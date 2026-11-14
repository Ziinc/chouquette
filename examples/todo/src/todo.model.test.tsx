// Model-based: random sequences of adding, toggling, deleting and clearing
// todos, checked after each step against a plain model of the list.
import { render, screen, user } from "chouquette/test";
import fc from "fast-check";
import { expect, test } from "vitest";
import { Todo } from "./todo";

type Model = { title: string; done: boolean }[];
type Real = Record<string, never>;

const left = (m: Model) => `${m.filter(t => !t.done).length} of ${m.length} left`;

class Add implements fc.AsyncCommand<Model, Real> {
  constructor(readonly title: string) {}
  check = (m: Readonly<Model>) => !m.some(t => t.title === this.title);
  async run(m: Model) {
    await user.fill(screen.getByRole("textbox", { name: "Title" }), this.title);
    await user.submit(screen.getByRole("textbox", { name: "Title" }));
    m.push({ title: this.title, done: false });
    expect(screen.getByText(left(m))).toBeVisible();
  }
  toString = () => `Add(${this.title})`;
}

class Toggle implements fc.AsyncCommand<Model, Real> {
  constructor(readonly at: number) {}
  check = (m: Readonly<Model>) => m.length > 0;
  async run(m: Model) {
    const todo = m[this.at % m.length];
    await user.click(screen.getByRole("checkbox", { name: todo.title }));
    todo.done = !todo.done;
    expect(screen.getByText(left(m))).toBeVisible();
  }
  toString = () => `Toggle(${this.at})`;
}

class Delete implements fc.AsyncCommand<Model, Real> {
  constructor(readonly at: number) {}
  check = (m: Readonly<Model>) => m.length > 0;
  async run(m: Model) {
    const [todo] = m.splice(this.at % m.length, 1);
    await user.click(screen.getByRole("button", { name: `Delete ${todo.title}` }));
    expect(screen.getByText(left(m))).toBeVisible();
  }
  toString = () => `Delete(${this.at})`;
}

class ClearDone implements fc.AsyncCommand<Model, Real> {
  check = () => true;
  async run(m: Model) {
    await user.keydown("d", { ctrl: true });
    m.splice(0, m.length, ...m.filter(t => !t.done));
    expect(screen.getByText(left(m))).toBeVisible();
  }
  toString = () => "ClearDone";
}

test("the todo list follows its model", async () => {
  const title = fc.stringMatching(/^[a-z]{1,6}$/);
  const commands = [
    title.map(t => new Add(t)),
    fc.nat(9).map(i => new Toggle(i)),
    fc.nat(9).map(i => new Delete(i)),
    fc.constant(new ClearDone()),
  ];
  await fc.assert(
    fc.asyncProperty(fc.commands(commands, { maxCommands: 15 }), async cmds => {
      render(<Todo />);
      await fc.asyncModelRun(() => ({ model: [] as Model, real: {} as Real }), cmds);
    }),
    { numRuns: 40 },
  );
});
