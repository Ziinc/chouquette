// A react-reconciler host config whose mutations are levain's patch ops.
import Reconciler from "react-reconciler";
import { DefaultEventPriority, NoEventPriority } from "react-reconciler/constants.js";
import { createContext } from "react";
import { toAttrs } from "./props";
import type { Element, Node, Op } from "./wire";

export type Instance = {
  type: string;
  props: Record<string, unknown>;
  attrs: Record<string, string>;
  children: Child[];
  parent: Parent | null;
  id: string;
  root: Container;
};
export type TextInstance = { text: string; parent: Parent | null };
type Child = Instance | TextInstance;
type Parent = Instance | Container;

export type Container = {
  children: Child[];
  ops: Op[];
  nextId: number;
  handlers: Map<string, Instance>;
  /** Called after each commit with the ops it made. */
  commit(ops: Op[], root: Node): void;
};

const isContainer = (p: Parent): p is Container => "ops" in p;

function path(node: Child): number[] | null {
  const at: number[] = [];
  for (let n: Child = node; ; ) {
    const p = n.parent;
    if (!p) return null;
    if (isContainer(p)) return at;
    at.unshift(p.children.indexOf(n));
    n = p;
  }
}

export function serialize(node: Child): Node {
  if ("text" in node) return node.text;
  return { t: node.type, a: { ...node.attrs }, c: node.children.map(serialize) } satisfies Element;
}

function containerOf(node: Child): Container | null {
  let p = node.parent;
  while (p && !isContainer(p)) p = p.parent;
  return p;
}

function insert(parent: Parent, child: Child, index: number) {
  parent.children.splice(index, 0, child);
  child.parent = parent;
  if (isContainer(parent)) {
    if (parent.children.length > 1) throw new Error("chouquette renders one root element per window");
    parent.ops.push({ op: "replace", at: [], node: serialize(child) });
    return;
  }
  const at = path(parent);
  if (at) containerOf(parent)!.ops.push({ op: "splice", at, start: index, delete: 0, c: [serialize(child)] });
}

function remove(parent: Parent, child: Child) {
  const index = parent.children.indexOf(child);
  const container = isContainer(parent) ? parent : containerOf(parent);
  const at = isContainer(parent) ? [] : path(parent);
  parent.children.splice(index, 1);
  child.parent = null;
  if (!container || !at) return;
  if (isContainer(parent)) container.ops.push({ op: "replace", at: [], node: null });
  else container.ops.push({ op: "splice", at, start: index, delete: 1, c: [] });
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Merges ops into baguette's canonical patch: a removal and insertion at one
 * index is a replace, inserts in a row are one splice, and a later replace
 * of the same node wins.
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

let priority: number = NoEventPriority;
export const setPriority = (p: number) => (priority = p);
export const getPriority = () => priority;

const noop = () => {};

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

  createInstance(type: string, props: Record<string, unknown>, root: Container): Instance {
    const id = `h${root.nextId++}`;
    const inst: Instance = { type, props, attrs: toAttrs(props, id), children: [], parent: null, id, root };
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
  getRootHostContext: () => null,
  getChildHostContext: (ctx: null) => ctx,
  getPublicInstance: (inst: Child) => inst,
  prepareForCommit: () => null,
  resetAfterCommit(container: Container) {
    const ops = coalesce(container.ops);
    container.ops = [];
    container.commit(ops, container.children[0] ? serialize(container.children[0]) : null);
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
    const at = path(text);
    if (at) containerOf(text)!.ops.push({ op: "replace", at, node: next });
  },
  commitUpdate(inst: Instance, _type: string, _prev: unknown, next: Record<string, unknown>) {
    inst.props = next;
    const attrs = toAttrs(next, inst.id);
    const keys = Object.keys(attrs);
    if (keys.length === Object.keys(inst.attrs).length && keys.every(k => attrs[k] === inst.attrs[k])) return;
    inst.attrs = attrs;
    const at = path(inst);
    if (at) containerOf(inst)!.ops.push({ op: "attrs", at, a: { ...attrs } });
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
