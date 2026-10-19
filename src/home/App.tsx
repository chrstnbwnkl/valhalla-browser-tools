import type { ReactNode } from "react";
import { OptionOfTheDay, type Option } from "./OptionOfTheDay";

const PLAYGROUNDS = [
  { href: "route-playground/", title: "Route playground" },
  { href: "locate-playground/", title: "Locate playground" },
];

const TOOLS = [
  {
    href: "attributes-controller-builder/",
    title: "Attributes controller builder",
    description:
      "Pick Valhalla attributes from a list and get the include or exclude filter as JSON.",
  },
];

const CARD =
  "grid h-full gap-1 rounded-lg border border-line bg-surface-raised text-inherit no-underline transition-colors hover:border-ink";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h2 className="label mt-12 mb-3 text-ink-muted">{title}</h2>
      {children}
    </>
  );
}

export function App({ option }: { option: Option }) {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-12">
      <h1 className="display m-0">Valhalla Browser Tools</h1>
      <p className="lead m-0 mt-2 text-ink-muted">
        Small browser-only tools for the power user.
      </p>

      <Section title="Playgrounds">
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3 p-0">
          {PLAYGROUNDS.map(({ href, title }) => (
            <li key={href}>
              <a className={`${CARD} p-6`} href={href}>
                <b className="subheading">{title}</b>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Miscellaneous">
        <ul className="m-0 grid list-none gap-3 p-0">
          {TOOLS.map(({ href, title, description }) => (
            <li key={href}>
              <a className={`${CARD} p-4`} href={href}>
                <b className="label">{title}</b>
                <small className="caption text-ink-muted">{description}</small>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <OptionOfTheDay option={option} />
    </main>
  );
}
