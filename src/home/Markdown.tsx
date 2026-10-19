import type { ReactNode } from "react";

// `code`, **bold** and [links](https://…), all the spec's descriptions use
const INLINE =
  /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

export function Markdown({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const [whole, code, bold, label, href] = match;
    parts.push(text.slice(last, match.index));
    const key = match.index;
    if (code !== undefined)
      parts.push(
        <code
          key={key}
          className="rounded-sm bg-surface-sunken px-1 font-mono text-[0.875em]"
        >
          {code}
        </code>,
      );
    else if (bold !== undefined) parts.push(<b key={key}>{bold}</b>);
    else
      parts.push(
        <a
          key={key}
          className="font-bold text-link underline decoration-2 underline-offset-3 hover:text-ink"
          href={href}
        >
          {label}
        </a>,
      );
    last = match.index + whole.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
