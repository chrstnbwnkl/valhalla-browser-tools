import { describe, expect, it } from "vitest";
import { routeEdges } from "./edges";
import leg0 from "./fixtures/trace-leg0.json";
import leg1 from "./fixtures/trace-leg1.json";

const legs = [leg0, leg1].map((path) => ({
  path: path,
  snapped: false,
}));

describe("routeEdges", () => {
  it("numbers the edges of all legs and cuts each one's shape", () => {
    const edges = routeEdges(legs);
    expect(edges).toHaveLength(leg0.edges.length + leg1.edges.length);
    expect(edges.map((e) => e.idx)).toEqual([...edges.keys()]);
    expect(edges.at(-1)!.leg).toBe(1);
    const [first] = edges;
    expect(first!.coords).toHaveLength(
      leg0.edges[0]!.end_shape_index - leg0.edges[0]!.begin_shape_index + 1,
    );
  });

  it("swaps a node's admin_index for the admin", () => {
    const node = routeEdges(legs)[0]!.node!;
    expect(node).not.toHaveProperty("admin_index");
    expect(node.admin).toEqual(leg0.admins[0]);
  });
});
