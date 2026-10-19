import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

const html = (text: string) =>
  render(<Markdown text={text} />).container.innerHTML.replace(
    / class="[^"]*"/g,
    "",
  );

describe("Markdown", () => {
  it("renders code, bold and links", () => {
    expect(
      html(
        "Set `exclude_tolls` to **true**, see [the docs](https://valhalla.github.io/valhalla/).",
      ),
    ).toBe(
      'Set <code>exclude_tolls</code> to <b>true</b>, see <a href="https://valhalla.github.io/valhalla/">the docs</a>.',
    );
  });

  it("leaves anything else as text", () => {
    expect(html("a <b> and [x](javascript:alert(1))")).toBe(
      "a &lt;b&gt; and [x](javascript:alert(1))",
    );
  });
});
