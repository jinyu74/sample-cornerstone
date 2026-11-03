import { describe, expect, it } from "vitest";

import {
  imageToWorld,
  isValidImagePlane,
  worldToImage,
  type ImagePlane,
} from "./image-plane";

const s = Math.SQRT1_2;
/** 사선(행 방향이 x·y 사이 45°) + 비등방 간격: 행 간격 0.5mm, 열 간격 2mm */
const oblique: ImagePlane = {
  imagePositionPatient: [10, 20, 30],
  imageOrientationPatient: [s, s, 0, 0, 0, -1],
  pixelSpacing: [0.5, 2],
};

describe("image-plane 좌표 변환 (첫 픽셀 중심 = (0,0), 좌표는 [열, 행])", () => {
  it("열 이동은 행 방향 코사인 × 열 간격, 행 이동은 열 방향 코사인 × 행 간격으로 world 를 만든다", () => {
    const world = imageToWorld(oblique, [3, 4]);

    expect(world[0]).toBeCloseTo(10 + 6 * s, 9);
    expect(world[1]).toBeCloseTo(20 + 6 * s, 9);
    expect(world[2]).toBeCloseTo(30 - 2, 9);
  });

  it("world → image 역변환은 간격을 두 번 적용하지 않고 원래 픽셀 좌표로 돌아온다", () => {
    for (const point of [
      [0, 0],
      [3, 4],
      [-0.5, 31.5],
      [12.25, 7.75],
    ] as const) {
      const [column, row] = worldToImage(oblique, imageToWorld(oblique, point));
      expect(column).toBeCloseTo(point[0], 9);
      expect(row).toBeCloseTo(point[1], 9);
    }
  });

  it("평면 밖 world 좌표는 평면에 투영한 픽셀 좌표를 돌려준다", () => {
    const onPlane = imageToWorld(oblique, [2, 2]);
    const normal = [s, -s, 0] as const;
    const offPlane = [
      onPlane[0] + normal[0] * 5,
      onPlane[1] + normal[1] * 5,
      onPlane[2],
    ] as const;

    const [column, row] = worldToImage(oblique, offPlane);

    expect(column).toBeCloseTo(2, 9);
    expect(row).toBeCloseTo(2, 9);
  });

  it.each([
    ["간격 0", { ...oblique, pixelSpacing: [0, 1] }],
    ["간격 NaN", { ...oblique, pixelSpacing: [Number.NaN, 1] }],
    ["음수 간격", { ...oblique, pixelSpacing: [-1, 1] }],
    [
      "방향 0 벡터",
      { ...oblique, imageOrientationPatient: [0, 0, 0, 0, 0, -1] },
    ],
    [
      "비직교 방향",
      { ...oblique, imageOrientationPatient: [1, 0, 0, 1, 0, 0] },
    ],
    ["위치 NaN", { ...oblique, imagePositionPatient: [Number.NaN, 0, 0] }],
  ] as const)("유효하지 않은 평면(%s)은 거부한다", (_name, plane) => {
    expect(isValidImagePlane(plane as unknown as ImagePlane)).toBe(false);
    expect(() => imageToWorld(plane as unknown as ImagePlane, [0, 0])).toThrow(
      RangeError,
    );
  });

  it("유효한 평면은 받아들인다", () => {
    expect(isValidImagePlane(oblique)).toBe(true);
  });
});
