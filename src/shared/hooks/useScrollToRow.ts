import { useEffect, useRef } from "react";

/** Scrolls the active row of a list into view; `ref(idx)` registers a row. */
export function useScrollToRow(active: number | null) {
  const rows = useRef(new Map<number, HTMLElement>());
  useEffect(() => {
    if (active !== null)
      rows.current.get(active)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return (idx: number) => (element: HTMLElement | null) => {
    if (element) rows.current.set(idx, element);
    else rows.current.delete(idx);
  };
}
