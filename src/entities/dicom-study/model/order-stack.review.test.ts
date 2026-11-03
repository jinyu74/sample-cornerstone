import { describe, expect, it } from "vitest";

import { orderStackImages } from "./order-stack";
import type { StackImageRef } from "./types";

describe("슬라이스 정렬 검수 회귀 테스트", () => {
  it("위치 허용 오차가 연쇄적으로 겹쳐도 모든 입력 순열에서 같은 결과를 낸다", () => {
    const images: StackImageRef[] = [
      {
        sopInstanceUid: "1.1",
        instanceNumber: 3,
        imagePositionPatient: [0, 0, 0],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      },
      {
        sopInstanceUid: "1.2",
        instanceNumber: 2,
        imagePositionPatient: [0, 0, 0.00075],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      },
      {
        sopInstanceUid: "1.3",
        instanceNumber: 1,
        imagePositionPatient: [0, 0, 0.0015],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      },
    ];
    const permutations = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const results = permutations.map((order) =>
      orderStackImages(order.map((i) => images[i]!))
        .ordered.map((image) => image.sopInstanceUid)
        .join(","),
    );
    expect(new Set(results).size).toBe(1);
  });
});
