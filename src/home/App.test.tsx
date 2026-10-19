import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { Option } from "./OptionOfTheDay";

const OPTION: Option = {
  id: "Pedestrian.type",
  name: "type",
  scope: "costing option · pedestrian, bikeshare",
  type: "string",
  default: "foot",
  enum: ["foot", "wheelchair", "blind"],
  description: "If set to `blind`, enables additional route instructions.",
  badge: "changed in Valhalla",
  notes: ["new values: blind"],
};

const option = () =>
  within(screen.getByRole("region", { name: "Option of the Day" }));

describe("landing page", () => {
  it("links every tool by its directory", () => {
    render(<App option={OPTION} />);
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([
      "route-playground/",
      "locate-playground/",
      "attributes-controller-builder/",
    ]);
  });

  it("shows the option of the day with what changed", () => {
    render(<App option={OPTION} />);
    expect(
      option().getByText("type", { selector: "code" }),
    ).toBeInTheDocument();
    expect(option().getByText("changed in Valhalla")).toBeInTheDocument();
    expect(option().getByText("costing option")).toBeInTheDocument();
    expect(option().getByText("for pedestrian, bikeshare")).toBeInTheDocument();
    expect(option().getByRole("note")).toHaveTextContent("new values: blind");
    expect(
      option().getByText("blind", { selector: "p code" }),
    ).toBeInTheDocument();
    expect(option().getByText("default").nextSibling).toHaveTextContent("foot");
    expect(option().getByText("wheelchair")).toBeInTheDocument();
  });

  it("leaves out what an option doesn't have", () => {
    render(
      <App
        option={{
          id: "Base.exclude_tolls",
          name: "exclude_tolls",
          scope: "costing option · all costings",
          type: "boolean",
          default: false,
          description: "",
          badge: null,
          notes: [],
        }}
      />,
    );
    expect(option().queryByRole("note")).not.toBeInTheDocument();
    expect(option().queryByText("min")).not.toBeInTheDocument();
    expect(option().queryByText("one of")).not.toBeInTheDocument();
    expect(option().getByText("No description.")).toBeInTheDocument();
    expect(option().getByText("default").nextSibling).toHaveTextContent(
      "false",
    );
  });
});
