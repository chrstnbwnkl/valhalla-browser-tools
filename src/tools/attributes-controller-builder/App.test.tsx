import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App, STORAGE_KEY } from "./App";

const available = () => within(screen.getByRole("list", { name: "Available" }));
const selected = () => within(screen.getByRole("list", { name: "Selected" }));
const output = () =>
  JSON.parse(screen.getByLabelText<HTMLTextAreaElement>("Filter JSON").value);
const filterInput = () => screen.getByPlaceholderText(/^Filter/);

function setup() {
  const user = userEvent.setup();
  render(<App />);
  return user;
}

describe("attributes controller builder", () => {
  it("starts empty, with the filter focused", () => {
    setup();
    expect(
      selected().getByText(/Click attributes on the left/),
    ).toBeInTheDocument();
    expect(output()).toEqual({
      filters: { attributes: [], action: "include" },
    });
    expect(filterInput()).toHaveFocus();
  });

  it("moves attributes between the lists on click", async () => {
    const user = setup();
    await user.click(available().getByText("edge.names"));
    expect(selected().getByText("edge.names")).toBeInTheDocument();
    expect(available().queryByText("edge.names")).not.toBeInTheDocument();
    expect(output().filters.attributes).toEqual(["edge.names"]);

    await user.click(selected().getByText("edge.names"));
    expect(available().getByText("edge.names")).toBeInTheDocument();
    expect(output().filters.attributes).toEqual([]);
  });

  it("moves a whole group", async () => {
    const user = setup();
    const admin = available().getByText("admin").closest("li")!;
    await user.click(within(admin).getByRole("button", { name: "add all" }));
    expect(output().filters.attributes).toEqual([
      "admin.country_code",
      "admin.country_text",
      "admin.state_code",
      "admin.state_text",
    ]);
    expect(screen.getByText(/^4 of \d+$/)).toBeInTheDocument();
  });

  it("marks several attributes and moves them together", async () => {
    const user = setup();
    await user.keyboard("{Control>}");
    await user.click(available().getByText("admin.country_code"));
    await user.keyboard("{/Control}{Shift>}");
    await user.click(available().getByText("admin.state_code"));
    await user.keyboard("{/Shift}");
    expect(
      available().getByText("admin.country_text").closest("li"),
    ).toHaveAttribute("data-marked");

    await user.click(available().getByText("admin.country_text"));
    expect(output().filters.attributes).toEqual([
      "admin.country_code",
      "admin.country_text",
      "admin.state_code",
    ]);
  });

  it("filters, and adds the only match with Enter", async () => {
    const user = setup();
    await user.type(filterInput(), "country_t");
    expect(available().getByText("admin.country_text")).toBeInTheDocument();
    expect(available().queryByText("edge.names")).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(output().filters.attributes).toEqual(["admin.country_text"]);
    expect(filterInput()).toHaveValue("");
  });

  it("adds a custom attribute with Enter when nothing matches", async () => {
    const user = setup();
    await user.type(filterInput(), "Edge.Brand_New{Enter}");
    expect(selected().getByText("custom")).toBeInTheDocument();
    expect(output().filters.attributes).toEqual(["edge.brand_new"]);
  });

  it("offers a custom attribute by click even when there are matches", async () => {
    const user = setup();
    await user.type(filterInput(), "edge.name");
    await user.click(available().getByText('Add "edge.name"'));
    expect(output().filters.attributes).toEqual(["edge.name"]);
  });

  it("switches the action", async () => {
    const user = setup();
    await user.click(screen.getByRole("radio", { name: "exclude" }));
    expect(output().filters.action).toBe("exclude");
  });

  it("restores the saved state, ignoring junk", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ selected: ["shape", 42], action: "exclude" }),
    );
    setup();
    expect(output()).toEqual({
      filters: { attributes: ["shape"], action: "exclude" },
    });
  });

  it("saves the state and follows other tabs", async () => {
    const user = setup();
    await user.click(available().getByText("shape"));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      selected: ["shape"],
      action: "include",
    });

    const elsewhere = JSON.stringify({
      selected: ["edge.length"],
      action: "include",
    });
    localStorage.setItem(STORAGE_KEY, elsewhere);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY, newValue: elsewhere }),
      );
    });
    expect(output().filters.attributes).toEqual(["edge.length"]);
  });

  it("copies the output", async () => {
    const user = setup();
    await user.click(available().getByText("shape"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(JSON.parse(await navigator.clipboard.readText())).toEqual({
      filters: { attributes: ["shape"], action: "include" },
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
