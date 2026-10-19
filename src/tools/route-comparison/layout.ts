// Panes split the screen like a terminal multiplexer: each split holds two
// parts side by side ("row") or stacked ("column").
export type Layout =
  { pane: number } | { split: "row" | "column"; first: Layout; second: Layout };

/** Adds a pane by splitting `at`, alternating the direction, so the screen fills evenly. */
export function withPane(
  layout: Layout | null,
  pane: number,
  at: number,
): Layout {
  if (!layout) return { pane };
  const split = (node: Layout, depth: number): Layout => {
    if ("pane" in node)
      return node.pane === at
        ? { split: depth % 2 ? "column" : "row", first: node, second: { pane } }
        : node;
    return {
      ...node,
      first: split(node.first, depth + 1),
      second: split(node.second, depth + 1),
    };
  };
  return split(layout, 0);
}

/** Removes a pane, its sibling taking the room. */
export function withoutPane(layout: Layout, pane: number): Layout | null {
  if ("pane" in layout) return layout.pane === pane ? null : layout;
  const first = withoutPane(layout.first, pane);
  const second = withoutPane(layout.second, pane);
  if (!first) return second;
  if (!second) return first;
  return { ...layout, first, second };
}

/** Where each pane goes, in fractions of the screen. */
export type Rect = { x: number; y: number; width: number; height: number };

export function rects(layout: Layout | null): Map<number, Rect> {
  const all = new Map<number, Rect>();
  const place = (node: Layout, rect: Rect) => {
    if ("pane" in node) return void all.set(node.pane, rect);
    const { x, y, width, height } = rect;
    if (node.split === "row") {
      place(node.first, { x, y, width: width / 2, height });
      place(node.second, { x: x + width / 2, y, width: width / 2, height });
    } else {
      place(node.first, { x, y, width, height: height / 2 });
      place(node.second, { x, y: y + height / 2, width, height: height / 2 });
    }
  };
  if (layout) place(layout, { x: 0, y: 0, width: 1, height: 1 });
  return all;
}
