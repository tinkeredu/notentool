// In-memory undo stack for grade edits (per session; undo itself is a
// normal write with a new updatedAt stamp).

type Action = { label: string; undo: () => Promise<void> | void };

const stack: Action[] = [];
const listeners = new Set<() => void>();

export function pushUndo(a: Action): void {
  stack.push(a);
  if (stack.length > 200) stack.shift();
  emit();
}

export async function undoLast(): Promise<string | null> {
  const a = stack.pop();
  if (!a) return null;
  await a.undo();
  emit();
  return a.label;
}

export function canUndo(): boolean {
  return stack.length > 0;
}

export function peekLabel(): string | null {
  return stack.length ? stack[stack.length - 1].label : null;
}

export function subscribeUndo(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const f of listeners) f();
}
