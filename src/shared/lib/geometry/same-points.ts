import type { ImagePoint } from "./image-plane";

/** 이미지 좌표 목록이 같은지(허용 오차 안). 같은 좌표로의 편집을 만들지 않기 위해 쓴다 */
export function samePoints(
  a: readonly ImagePoint[],
  b: readonly ImagePoint[],
  tolerance = 1e-6,
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (point, index) =>
        Math.abs(point[0] - b[index]![0]) <= tolerance &&
        Math.abs(point[1] - b[index]![1]) <= tolerance,
    )
  );
}
