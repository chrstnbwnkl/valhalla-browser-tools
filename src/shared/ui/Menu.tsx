import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button";

export type MenuItem = { label: string; action: () => void; danger?: boolean };

type Props = {
  /** Where it opens, in client coordinates. */
  at: { x: number; y: number };
  title: string;
  items: MenuItem[];
  onClose: () => void;
};

/** A context menu; a click outside it or Escape closes it. */
export function Menu({ at, title, items, onClose }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(at);

  // keep it on screen
  useLayoutEffect(() => {
    const { offsetWidth, offsetHeight } = list.current!;
    setPosition({
      x: Math.max(0, Math.min(at.x, innerWidth - offsetWidth - 4)),
      y: Math.max(0, Math.min(at.y, innerHeight - offsetHeight - 4)),
    });
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // the backdrop takes the click that closes the menu, so nothing underneath gets it
    <div
      className="fixed inset-0 z-10"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onContextMenu={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={list}
        role="menu"
        aria-label={title}
        className="fixed flex max-h-[60vh] min-w-[180px] flex-col overflow-y-auto rounded-lg bg-surface-raised p-1 shadow-float"
        style={{ left: position.x, top: position.y }}
      >
        <b className="caption px-2 py-1 text-ink-muted">{title}</b>
        {items.map(({ label, action, danger }) => (
          <Button
            key={label}
            role="menuitem"
            size="sm"
            variant={danger ? "danger" : "ghost"}
            className="justify-start"
            onClick={() => {
              onClose();
              action();
            }}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
