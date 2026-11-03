import { describe, expect, it } from "vitest";

import { samePoints } from "./same-points";

describe("samePoints", () => {
  it("개수와 각 좌표가 허용 오차 안에서 같으면 true", () => {
    expect(
      samePoints(
        [
          [1, 2],
          [3, 4],
        ],
        [
          [1, 2 + 1e-10],
          [3, 4],
        ],
      ),
    ).toBe(true);
    expect(
      samePoints(
        [[1, 2]],
        [
          [1, 2],
          [3, 4],
        ],
      ),
    ).toBe(false);
    expect(samePoints([[1, 2]], [[1, 2.01]])).toBe(false);
  });
});
