import { describe, expect, it } from "vitest";

import {
  formatMeasurement,
  measureAnnotation,
  POINT_COUNT,
  validatePoints,
} from "./measure";

/** 행 간격 0.5mm, 열 간격 2mm: [행, 열] 순서를 바꾸면 결과가 달라진다 */
const ANISOTROPIC = [0.5, 2] as const;

describe("measureAnnotation — 이미지 좌표 × PixelSpacing[행,열] 을 한 번만 적용", () => {
  it("길이: 열 이동에는 열 간격, 행 이동에는 행 간격을 곱한다", () => {
    const result = measureAnnotation(
      "length",
      [
        [0, 0],
        [3, 4],
      ],
      ANISOTROPIC,
    );

    expect(result).toMatchObject({
      kind: "length",
      unit: "mm",
      calibrated: true,
    });
    expect(result!.value).toBeCloseTo(Math.hypot(3 * 2, 4 * 0.5), 9);
  });

  it.each([
    ["보정 없음", undefined],
    ["간격 0", [0, 1]],
    ["간격 NaN", [Number.NaN, 1]],
    ["음수 간격", [0.5, -1]],
    ["무한대", [Number.POSITIVE_INFINITY, 1]],
  ] as const)("%s 이면 px 단위로 계산한다", (_name, spacing) => {
    const result = measureAnnotation(
      "length",
      [
        [0, 0],
        [3, 4],
      ],
      spacing as readonly [number, number] | undefined,
    );

    expect(result).toEqual({
      kind: "length",
      value: 5,
      unit: "px",
      calibrated: false,
    });
  });

  it("각도: 비등방 간격에서는 물리 좌표 기준으로 계산한다", () => {
    // 픽셀 좌표로는 45° 이지만 열 간격 2mm, 행 간격 1mm 이면 atan(1/2) ≈ 26.565°
    const calibrated = measureAnnotation(
      "angle",
      [
        [1, 1],
        [0, 0],
        [1, 0],
      ],
      [1, 2],
    );
    const uncalibrated = measureAnnotation(
      "angle",
      [
        [1, 1],
        [0, 0],
        [1, 0],
      ],
      undefined,
    );

    expect(calibrated!.unit).toBe("°");
    expect(calibrated!.value).toBeCloseTo(
      (Math.atan(1 / 2) * 180) / Math.PI,
      9,
    );
    expect(uncalibrated!.value).toBeCloseTo(45, 9);
    expect(uncalibrated!.calibrated).toBe(false);
  });

  it("타원: 위·아래·왼쪽·오른쪽 끝점의 물리 반지름으로 넓이와 둘레를 계산한다", () => {
    const result = measureAnnotation(
      "ellipse",
      [
        [5, 0],
        [5, 4],
        [3, 2],
        [7, 2],
      ],
      ANISOTROPIC,
    );

    // 가로 반지름 2px × 2mm = 4mm, 세로 반지름 2px × 0.5mm = 1mm
    expect(result!.unit).toBe("mm²");
    expect(result!.value).toBeCloseTo(Math.PI * 4 * 1, 9);
    expect(result!.perimeter!.unit).toBe("mm");
    expect(result!.perimeter!.value).toBeCloseTo(17.157, 2);
  });

  it("닫힌 윤곽: 물리 좌표 다각형 넓이(신발끈 공식)와 둘레", () => {
    const result = measureAnnotation(
      "contour",
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      ANISOTROPIC,
    );

    expect(result).toEqual({
      kind: "area",
      value: 4,
      unit: "mm²",
      perimeter: { value: 10, unit: "mm" },
      calibrated: true,
    });
  });

  it("보정이 없으면 넓이는 px², 둘레는 px", () => {
    const result = measureAnnotation(
      "contour",
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      undefined,
    );

    expect(result).toEqual({
      kind: "area",
      value: 4,
      unit: "px²",
      perimeter: { value: 8, unit: "px" },
      calibrated: false,
    });
  });

  it("화살표 메모는 측정값이 없다", () => {
    expect(
      measureAnnotation(
        "arrow",
        [
          [0, 0],
          [1, 1],
        ],
        ANISOTROPIC,
      ),
    ).toBeNull();
  });
});

describe("validatePoints — 도구별 포인트 수와 숫자 유한성", () => {
  it("도구별 포인트 수", () => {
    expect(POINT_COUNT).toEqual({
      length: 2,
      angle: 3,
      ellipse: 4,
      contour: { min: 3 },
      arrow: 2,
    });
    expect(
      validatePoints("length", [
        [0, 0],
        [1, 1],
      ]),
    ).toBeNull();
    expect(validatePoints("length", [[0, 0]])).toBe(
      "포인트 수가 올바르지 않습니다(length: 2개 필요, 1개)",
    );
    expect(
      validatePoints("contour", [
        [0, 0],
        [1, 1],
      ]),
    ).toBe("포인트 수가 올바르지 않습니다(contour: 3개 이상 필요, 2개)");
    expect(
      validatePoints("contour", [
        [0, 0],
        [1, 1],
        [2, 0],
        [3, 3],
      ]),
    ).toBeNull();
  });

  it("좌표가 [열, 행] 두 개의 유한한 숫자가 아니면 거부한다", () => {
    expect(
      validatePoints("length", [
        [0, 0],
        [Number.NaN, 1],
      ]),
    ).toBe("좌표 값이 유한한 숫자가 아닙니다");
    expect(
      validatePoints("length", [
        [0, 0],
        [1, 2, 3] as unknown as [number, number],
      ]),
    ).toBe("좌표는 [열, 행] 두 값이어야 합니다");
  });

  it("측정 계산도 잘못된 포인트를 거부한다", () => {
    expect(() =>
      measureAnnotation(
        "angle",
        [
          [0, 0],
          [1, 1],
        ],
        undefined,
      ),
    ).toThrow(RangeError);
  });
});

describe("formatMeasurement", () => {
  it("단위와 함께 소수 둘째 자리까지 표시한다", () => {
    expect(
      formatMeasurement({
        kind: "length",
        value: 24.567,
        unit: "mm",
        calibrated: true,
      }),
    ).toBe("24.57 mm");
    expect(
      formatMeasurement({
        kind: "angle",
        value: 90,
        unit: "°",
        calibrated: false,
      }),
    ).toBe("90.00°");
    expect(
      formatMeasurement({
        kind: "area",
        value: 4,
        unit: "px²",
        perimeter: { value: 8, unit: "px" },
        calibrated: false,
      }),
    ).toBe("4.00 px² · 둘레 8.00 px");
  });
});
