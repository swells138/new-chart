import { describe, expect, it } from "vitest";
import { calculateShortestConnectionPath } from "@/lib/connection-distance";
import type { Relationship } from "@/types/models";

const relationships = [
  { source: "u1", target: "u2" },
  { source: "u2", target: "u3" },
  { source: "u3", target: "u4" },
  { source: "u1", target: "u5" },
  { source: "u5", target: "u4" },
] as Relationship[];

describe("calculateShortestConnectionPath", () => {
  it("returns the shortest distance and path between two users", () => {
    const result = calculateShortestConnectionPath(relationships, "u1", "u4");

    expect(result).toMatchObject({
      status: "connected",
      distance: 2,
      path: ["u1", "u5", "u4"],
    });
  });

  it("returns zero distance when the user searches themselves", () => {
    const result = calculateShortestConnectionPath(relationships, "u1", "u1");

    expect(result).toMatchObject({
      status: "connected",
      distance: 0,
      path: ["u1"],
    });
  });

  it("returns no connection when no path exists", () => {
    const result = calculateShortestConnectionPath(relationships, "u1", "u9");

    expect(result).toEqual({
      status: "no_connection",
      message: "No connection found",
      distance: null,
      degree: null,
      path: [],
      hasMultiplePaths: false,
      metadata: {
        mode: "shortest",
        multiplePathCount: 0,
        connectionStrength: null,
      },
    });
  });

  it("returns null when either user is missing", () => {
    expect(calculateShortestConnectionPath(relationships, null, "u1")).toBeNull();
    expect(calculateShortestConnectionPath(relationships, "u1", undefined)).toBeNull();
  });

  it("keeps future path-ranking metadata with the result", () => {
    const result = calculateShortestConnectionPath(relationships, "u1", "u4", {
      mode: "most_interesting",
    });

    expect(result).toMatchObject({
      status: "connected",
      metadata: {
        mode: "most_interesting",
        multiplePathCount: 1,
        connectionStrength: 0.5,
      },
    });
  });
});
