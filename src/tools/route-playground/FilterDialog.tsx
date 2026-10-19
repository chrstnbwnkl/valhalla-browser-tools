import { useEffect, useRef, useState } from "react";
import { Button } from "../../shared/ui/Button";
import { TextArea } from "../../shared/ui/Input";
import { toFilters, type Filters } from "./api";

type Props = {
  filters: Filters | null;
  onApply: (filters: Filters | null) => void;
  onClose: () => void;
};

export function FilterDialog({ filters, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(
    filters ? JSON.stringify({ filters }, null, 2) : "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label="Attribute filter"
      className="m-auto w-[480px] max-w-[calc(100vw-24px)] rounded-lg bg-surface-raised p-6 text-ink shadow-float backdrop:bg-ink/30"
      onClose={onClose}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onApply(text.trim() ? toFilters(JSON.parse(text)) : null);
          } catch (error) {
            return setError((error as Error).message);
          }
          dialog.current?.close();
        }}
      >
        <h2 className="subheading m-0 mb-2">Attribute filter</h2>
        <p className="caption m-0 mb-3 text-ink-muted">
          The <code className="font-mono">filters</code> object of the
          trace_attributes requests, as the{" "}
          <a
            className="font-bold text-link underline"
            href="../attributes-controller-builder/"
            target="_blank"
          >
            attributes controller builder
          </a>{" "}
          writes it. Leave it empty to get every attribute. The shape and the
          shape indices of the edges are always asked for, the edges view draws
          from them.
        </p>
        <TextArea
          mono
          aria-label="Filter"
          className="block h-[260px] resize-y px-3 py-2"
          spellCheck={false}
          placeholder='{ "filters": { "attributes": ["edge.names", "edge.speed"], "action": "include" } }'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error && (
          <p role="alert" className="caption mt-2 mb-0 text-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <Button
            onClick={() => {
              onApply(null);
              dialog.current?.close();
            }}
          >
            Clear filter
          </Button>
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </dialog>
  );
}
