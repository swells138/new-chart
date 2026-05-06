import { describe, expect, it } from "vitest";
import { calculateConnectionScore } from "@/lib/connection-score";

describe("calculateConnectionScore", () => {
  it("weights direct connections by 5 and second-degree connections by 1", () => {
    expect(
      calculateConnectionScore({
        totalConnections: 4,
        secondDegreeConnections: 7,
      }),
    ).toBe(27);
  });
});
