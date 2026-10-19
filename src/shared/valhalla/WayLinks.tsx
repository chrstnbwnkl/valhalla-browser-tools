import { Fragment } from "react";

export function WayLink({ id }: { id: string | number }) {
  return (
    <a
      className="font-bold text-link underline decoration-2 underline-offset-3 hover:text-ink hover:decoration-green"
      href={`https://www.openstreetmap.org/way/${id}`}
      target="_blank"
      rel="noopener"
    >
      {id}
    </a>
  );
}

/** Links the way ids in `text` ("way_id": 123, way 123, …) to openstreetmap.org. */
export function WayLinks({ text }: { text: string }) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(/(way_id"?:\s*|\bway )(\d+)/g)) {
    const [, prefix = "", id = ""] = match;
    const at = match.index + prefix.length;
    parts.push(
      <Fragment key={at}>{text.slice(last, at)}</Fragment>,
      <WayLink key={`way:${at}`} id={id} />,
    );
    last = at + id.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
