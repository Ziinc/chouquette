// Finds elements as a screen reader would, in the tree the host last drew.
import type { Element, Node } from "../wire";

/** An element as a query found it: where, and what it was then. */
export type HostElement = { window: number; path: string; node: Element };

/** Every element with its path ("root", then ".<index>" among all children) and enclosing form. */
export type Entry = { path: string; node: Element; form: { path: string; node: Element } | null };

export function entries(node: Node, path = "root", form: Entry["form"] = null): Entry[] {
  if (!node || typeof node === "string") return [];
  const inner = node.t === "form" ? { path, node } : form;
  return [{ path, node, form }, ...node.c.flatMap((child, i) => entries(child, `${path}.${i}`, inner))];
}

/** An element's text: adjacent text runs join as they are, elements with a space. */
export function textOf(node: Node): string {
  if (!node) return "";
  if (typeof node === "string") return node.replace(/\s+/g, " ").trim();
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
  button: "button", textarea: "textbox", img: "img", ul: "list", ol: "list", li: "listitem", list: "list", form: "form",
  nav: "navigation", h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
};

export function roleOf({ t, a }: Element): string | undefined {
  if (a.role) return a.role;
  if (t === "a") return a.href !== undefined ? "link" : undefined;
  if (t === "input") return ({ checkbox: "checkbox", radio: "radio", submit: "button", button: "button" } as Record<string, string>)[a.type] ?? "textbox";
  return implicitRoles[t];
}

export const nameOf = (el: Element) => el.a["aria-label"] ?? (el.t === "img" ? el.a.alt : undefined) ?? textOf(el);

export type Matcher = string | RegExp;
export const matches = (value: string | undefined, m: Matcher) =>
  value !== undefined && (typeof m === "string" ? value === m : m.test(value));

export const describe = (m: Matcher) => (typeof m === "string" ? JSON.stringify(m) : String(m));

export const isTextInput = ({ t, a }: Element) => (t === "input" && !["checkbox", "submit", "radio", "button"].includes(a.type)) || t === "textarea";
