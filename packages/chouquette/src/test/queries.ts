// Finds elements as a screen reader would, in the tree the host last drew.
import type { Element, Node } from "../wire";

export type HostElement = { window: number; node: Element };

function elements(node: Node): Element[] {
  if (!node || typeof node === "string") return [];
  return [node, ...node.c.flatMap(elements)];
}

/** An element's text: adjacent text runs join as they are, elements with a space. */
export function textOf(node: Element): string {
  const parts: string[] = [];
  let run = "";
  for (const child of node.c) {
    if (typeof child === "string") run += child;
    else if (child) {
      parts.push(run, textOf(child));
      run = "";
    }
  }
  parts.push(run);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const implicitRoles: Record<string, string> = {
  button: "button", textarea: "textbox", img: "img", ul: "list", ol: "list", li: "listitem", form: "form", nav: "navigation",
  h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
};

function roleOf({ t, a }: Element): string | undefined {
  if (a.role) return a.role;
  if (t === "a") return a.href !== undefined ? "link" : undefined;
  if (t === "input") return { checkbox: "checkbox", radio: "radio", submit: "button", button: "button" }[a.type] ?? "textbox";
  return implicitRoles[t];
}

const nameOf = (el: Element) => el.a["aria-label"] ?? (el.t === "img" ? el.a.alt : undefined) ?? textOf(el);

export function queryAllByRole(tree: Node, role: string, { name }: { name?: string } = {}) {
  return elements(tree).filter(el => roleOf(el) === role && (name === undefined || nameOf(el) === name));
}

/** The innermost elements whose text is `text`. */
export function queryAllByText(tree: Node, text: string) {
  return elements(tree).filter(el => textOf(el) === text && !el.c.some(c => c && typeof c !== "string" && textOf(c) === text));
}

export function contains(tree: Node, target: Element): boolean {
  return elements(tree).includes(target);
}
