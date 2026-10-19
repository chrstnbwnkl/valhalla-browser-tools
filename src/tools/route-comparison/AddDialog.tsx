import { useEffect, useRef, useState } from "react";
import { Button } from "../../shared/ui/Button";
import { Input, TextArea } from "../../shared/ui/Input";
import { parseResponse, type Response } from "./response";

type Props = {
  /** What a pane is called without a label. */
  placeholder: string;
  onAdd: (response: Response, label: string) => void;
  onClose: () => void;
};

export function AddDialog({ placeholder, onAdd, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label="Add a route response"
      className="m-auto w-[560px] max-w-[calc(100vw-24px)] rounded-lg bg-surface-raised p-6 text-ink shadow-float backdrop:bg-ink/30"
      onClose={onClose}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onAdd(parseResponse(JSON.parse(text)), label.trim());
          } catch (error) {
            return setError((error as Error).message);
          }
          dialog.current?.close();
        }}
      >
        <h2 className="subheading m-0 mb-2">Add a route response</h2>
        <p className="caption m-0 mb-3 text-ink-muted">
          A /route response in Valhalla's or OSRM's format; it opens on a map of
          its own next to the others.
        </p>
        <Input
          aria-label="Label"
          className="mb-2"
          placeholder={`Label, e.g. ${placeholder}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <TextArea
          mono
          autoFocus
          aria-label="Response"
          className="block h-[320px] resize-y px-3 py-2"
          spellCheck={false}
          placeholder='{ "trip": { … } } or { "routes": [ … ], "code": "Ok" }'
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p role="alert" className="caption mt-2 mb-0 text-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="primary" type="submit">
            Add
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
