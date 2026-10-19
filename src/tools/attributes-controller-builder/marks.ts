// Ctrl/shift+click marks attributes to move together; shift ranges start at `anchor`.
export type Marks = { marked: ReadonlySet<string>; anchor: string | null };

export const NO_MARKS: Marks = { marked: new Set(), anchor: null };

export type Modifiers = {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

/** A click either changes the marks or moves attributes (all marked ones, if it hit one). */
export function click(
  marks: Marks,
  name: string,
  shown: readonly string[],
  e: Modifiers,
): { marks: Marks } | { move: string[] } {
  if (e.shiftKey && marks.anchor !== null && shown.includes(marks.anchor)) {
    const [from, to] = [shown.indexOf(marks.anchor), shown.indexOf(name)].sort(
      (a, b) => a - b,
    ) as [number, number];
    return {
      marks: {
        ...marks,
        marked: new Set([...marks.marked, ...shown.slice(from, to + 1)]),
      },
    };
  }
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    const marked = new Set(marks.marked);
    if (!marked.delete(name)) marked.add(name);
    return { marks: { marked, anchor: name } };
  }
  return {
    move: marks.marked.has(name)
      ? shown.filter((other) => marks.marked.has(other))
      : [name],
  };
}
