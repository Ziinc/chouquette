// A react-reconciler host config whose mutations are levain's patch ops.
import { createContext } from "react";
import Reconciler from "react-reconciler";
import { DefaultEventPriority, NoEventPriority } from "react-reconciler/constants.js";
import { toAttrs } from "./props";
import type { Element, Node, Op } from "./wire";

export type Instance = {
  type: string;
  props: Record<string, unknown>;
  attrs: Record<string, string>;
  children: Child[];
  parent: Parent | null;
  id: string;
  root: RootContainer;
};
export type TextInstance = { text: string; parent: Parent | null };
type Child = Instance | TextInstance;
type Parent = Instance | Container;

/** A window's tree. Its mutations become patch ops. */
export type RootContainer = {
  kind: "root";
  children: Child[];
  ops: Op[];
  /** Rows containers changed in this commit. */
  dirty: Set<RowsContainer>;
  nextId: number;
  handlers: Map<string, Instance>;
  /** Called after each commit with its ops and the rows that changed. */
  commit(ops: Op[], rows: RowsContainer[]): void;
};

/** The rows a `<List>` shows, rendered through a portal and sent whole. */
export type RowsContainer = { kind: "rows"; id: string; start: number; children: Child[]; root: RootContainer };

export type Container = RootContainer | RowsContainer;

const isContainer = (p: Parent): p is Container => "kind" in p;
const rootOf = (c: Container) => (c.kind === "rows" ? c.root : c);

const isText = (n: Child | undefined): n is TextInstance => !!n && "text" in n;

/**
 * Where `child` is among `parent`'s children on the wire: a run of adjacent
 * text is one string there, as baguette's trees have it.
 */
function slot(children: Child[], child: Child): number {
  let at = -1;
  for (let i = 0; i < children.length; i++) {
    if (!(isText(children[i]) && isText(children[i - 1]))) at++;
    if (children[i] === child) return at;
  }
  throw new Error("not a child");
}

/** The text of the run `child` is in. */
function runText(children: Child[], child: Child): string {
  let i = children.indexOf(child);
  while (isText(children[i - 1])) i--;
  let text = "";
  for (; isText(children[i]); i++) text += (children[i] as TextInstance).text;
  return text;
}

/** Children as the wire has them, adjacent text joined. */
export function serializeChildren(children: Child[]): Node[] {
  const out: Node[] = [];
  children.forEach((child, i) => {
    if (!isText(child)) out.push(serialize(child));
    else if (isText(children[i - 1])) out[out.length - 1] += child.text;
    else out.push(child.text);
  });
  return out;
}

/** The container `node` is in, and its path there on the wire; null if detached. */
function locate(node: Child): { container: Container; at: number[] } | null {
  const at: number[] = [];
  for (let n: Child = node; ; ) {
    const p: Parent | null = n.parent;
    if (!p) return null;
    if (isContainer(p)) {
      // Several root elements sit in a wrapping div.
      if (p.kind === "root" && p.children.length > 1) at.unshift(slot(p.children, n));
      return { container: p, at };
    }
    at.unshift(slot(p.children, n));
    n = p;
  }
}

function record(container: Container, op: Op) {
  if (container.kind === "rows") container.root.dirty.add(container);
  else container.ops.push(op);
}

/** A window's tree on the wire: its element, or several wrapped in a div. */
export function rootNode(container: RootContainer): Node {
  if (container.children.length === 0) return null;
  if (container.children.length === 1) return serialize(container.children[0]);
  return { t: "div", a: {}, c: serializeChildren(container.children) };
}

export function serialize(node: Child): Node {
  if ("text" in node) return node.text;
  return { t: node.type, a: { ...node.attrs }, c: serializeChildren(node.children) } satisfies Element;
}

/** Replaces `parent` whole: a change that joins or splits a run of text. */
function replaceParent(parent: Instance) {
  const where = locate(parent);
  if (where) record(where.container, { op: "replace", at: where.at, node: serialize(parent) });
}

/** Whether inserting or removing `child` at `index` joins or splits a run of text. */
const touchesText = (children: Child[], child: Child, index: number) =>
  isText(child) || (isText(children[index - 1]) && isText(children[index + 1]));

function insert(parent: Parent, child: Child, index: number) {
  parent.children.splice(index, 0, child);
  child.parent = parent;
  if (isContainer(parent)) {
    record(parent, { op: "replace", at: [], node: parent.kind === "root" ? rootNode(parent) : serialize(child) });
    return;
  }
  if (touchesText(parent.children, child, index)) return replaceParent(parent);
  const where = locate(parent);
  if (where) record(where.container, { op: "splice", at: where.at, start: slot(parent.children, child), delete: 0, c: [serialize(child)] });
}

function remove(parent: Parent, child: Child) {
  const index = parent.children.indexOf(child);
  if (isContainer(parent)) {
    parent.children.splice(index, 1);
    child.parent = null;
    record(parent, { op: "replace", at: [], node: parent.kind === "root" ? rootNode(parent) : null });
    return;
  }
  const touches = touchesText(parent.children, child, index);
  const start = slot(parent.children, child);
  parent.children.splice(index, 1);
  child.parent = null;
  if (touches) return replaceParent(parent);
  const where = locate(parent);
  if (where) record(where.container, { op: "splice", at: where.at, start, delete: 1, c: [] });
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Merges ops into the canonical patch: a removal and insertion at one index
 * is a replace, inserts in a row are one splice, and a later replace of the
 * same node wins.
 */
export function coalesce(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    const last = out.at(-1);
    if (last?.op === "splice" && op.op === "splice" && same(last.at, op.at) && op.start === last.start + last.c.length) {
      last.delete += op.delete;
      last.c.push(...op.c);
    } else if (last?.op === "replace" && op.op === "replace" && same(last.at, op.at)) {
      out[out.length - 1] = op;
    } else out.push({ ...op, ...(op.op === "splice" ? { c: [...op.c] } : {}) } as Op);
  }
  return out.flatMap(op =>
    op.op === "splice" && op.delete > 0 && op.delete === op.c.length
      ? op.c.map((node, i) => ({ op: "replace" as const, at: [...op.at, op.start + i], node }))
      : [op],
  );
}

// A whole document, as Next.js's root layout renders it: <html> and <body>
// are boxes, and what <head> holds is not drawn.
const documentTags: Record<string, string> = { html: "div", body: "div" };
const hiddenTags = new Set(["head", "title", "meta", "link", "script", "style", "noscript", "base", "template"]);
const attrsOf = (tag: string, props: Record<string, unknown>, id: string) =>
  hiddenTags.has(tag) ? { class: "hidden" } : toAttrs(documentTags[tag] ?? tag, props, id);

let priority: number = NoEventPriority;
export const setPriority = (p: number) => (priority = p);
export const getPriority = () => priority;

const noop = () => {};
// React needs a host context, even one that never changes.
const hostContext = {};

export const reconciler = Reconciler({
  rendererPackageName: "chouquette",
  rendererVersion: "0.0.0",
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  warnsIfNotActing: false,
  noTimeout: -1,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,

  createInstance(tag: string, props: Record<string, unknown>, container: Container): Instance {
    const root = rootOf(container);
    const id = `h${root.nextId++}`;
    const type = hiddenTags.has(tag) ? "div" : (documentTags[tag] ?? tag);
    const inst: Instance = { type, props, attrs: attrsOf(tag, props, id), children: [], parent: null, id, root };
    root.handlers.set(id, inst);
    return inst;
  },
  createTextInstance: (text: string): TextInstance => ({ text, parent: null }),
  appendInitialChild(parent: Instance, child: Child) {
    parent.children.push(child);
    child.parent = parent;
  },
  finalizeInitialChildren: () => false,
  shouldSetTextContent: () => false,
  getRootHostContext: () => hostContext,
  getChildHostContext: () => hostContext,
  getPublicInstance: (inst: Child) => inst,
  prepareForCommit: () => null,
  resetAfterCommit(container: Container) {
    const root = rootOf(container);
    const ops = coalesce(root.ops);
    const rows = [...root.dirty];
    root.ops = [];
    root.dirty.clear();
    root.commit(ops, rows);
  },
  preparePortalMount: noop,
  clearContainer(container: Container) {
    container.children = [];
  },

  appendChild: (parent: Instance, child: Child) => insert(parent, child, parent.children.length),
  appendChildToContainer: (c: Container, child: Child) => insert(c, child, c.children.length),
  insertBefore: (parent: Instance, child: Child, before: Child) => insert(parent, child, parent.children.indexOf(before)),
  insertInContainerBefore: (c: Container, child: Child, before: Child) => insert(c, child, c.children.indexOf(before)),
  removeChild: remove,
  removeChildFromContainer: remove,
  commitTextUpdate(text: TextInstance, _old: string, next: string) {
    text.text = next;
    const where = locate(text);
    if (where && text.parent) record(where.container, { op: "replace", at: where.at, node: runText(text.parent.children, text) });
  },
  commitUpdate(inst: Instance, tag: string, _prev: unknown, next: Record<string, unknown>) {
    inst.props = next;
    const attrs = attrsOf(tag, next, inst.id);
    const keys = Object.keys(attrs);
    if (keys.length === Object.keys(inst.attrs).length && keys.every(k => attrs[k] === inst.attrs[k])) return;
    inst.attrs = attrs;
    const where = locate(inst);
    if (where) record(where.container, { op: "attrs", at: where.at, a: { ...attrs } });
  },
  resetTextContent: noop,
  detachDeletedInstance: (inst: Instance) => inst.root.handlers.delete(inst.id),
  hideInstance: noop,
  unhideInstance: noop,
  hideTextInstance: noop,
  unhideTextInstance: noop,

  setCurrentUpdatePriority: setPriority,
  getCurrentUpdatePriority: getPriority,
  resolveUpdatePriority: () => (priority !== NoEventPriority ? priority : DefaultEventPriority),
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: noop,
  maySuspendCommit: () => false,
  maySuspendCommitOnUpdate: () => false,
  maySuspendCommitInSyncRender: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: noop,
  suspendInstance: noop,
  waitForCommitToBeReady: () => null,
  getSuspendedCommitReason: () => null,
  requestPostPaintCallback: noop,
  // View transitions: GPUI animates with classes, not snapshots. As React DOM
  // does without document.startViewTransition, the commit runs straight
  // through. Next.js's canary React makes every transition eligible.
  suspendOnActiveViewTransition: noop,
  startViewTransition(
    _state: unknown, _container: unknown, _types: unknown,
    mutation: () => void, layout: () => void, afterMutation: () => void, spawned: () => void,
  ) {
    mutation();
    layout();
    afterMutation();
    spawned();
    return null;
  },
  startGestureTransition: () => null,
  stopViewTransition: noop,
  addViewTransitionFinishedListener: (_transition: unknown, callback: () => void) => callback(),
  createViewTransitionInstance: () => null,
  applyViewTransitionName: noop,
  restoreViewTransitionName: noop,
  cancelViewTransitionName: noop,
  cancelRootViewTransitionName: noop,
  restoreRootViewTransitionName: noop,
  cloneRootViewTransitionContainer: () => ({ kind: "root", children: [] }),
  removeRootViewTransitionClone: noop,
  measureInstance: () => null,
  measureClonedInstance: () => null,
  wasInstanceInViewport: () => true,
  hasInstanceChanged: () => false,
  hasInstanceAffectedParent: () => false,
  getCurrentGestureOffset: () => 0,
  // Fragment refs (<Fragment ref>) point at DOM nodes: chouquette has none.
  createFragmentInstance: () => null,
  updateFragmentInstanceFiber: noop,
  commitNewChildToFragmentInstance: noop,
  deleteChildFromFragmentInstance: noop,
  NotPendingTransition: null,
  HostTransitionContext: createContext(null),
  resetFormInstance: noop,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: noop,
  afterActiveInstanceBlur: noop,
  prepareScopeUpdate: noop,
  getInstanceFromScope: () => null,
  bindToConsole: (method: string, args: unknown[]) =>
    (console as unknown as Record<string, Function>)[method].bind(console, ...args),
} as any);
