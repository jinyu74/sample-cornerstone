import { expect, it } from "vitest";

import { measureAnnotation } from "./measure";

it("비등방 보정에서 회전된 타원의 면적은 물리 좌표 변환의 행렬식을 따른다", () => {
  // 이미지에서 반축 벡터 (1,1), (1,-1): 면적 2π px².
  // 행 간격 1, 열 간격 2이면 면적은 2배인 4π mm²이다.
  const measurement = measureAnnotation(
    "ellipse",
    [
      [11, 11],
      [9, 9],
      [11, 9],
      [9, 11],
    ],
    [1, 2],
  );
  expect(measurement?.unit).toBe("mm²");
  expect(measurement?.value).toBeCloseTo(4 * Math.PI, 10);
});
