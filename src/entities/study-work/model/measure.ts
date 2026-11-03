import type { ImagePoint } from "@/shared/lib/geometry";

import type { AnnotationTool, Measurement } from "./types";

export const POINT_COUNT = {
  length: 2,
  angle: 3,
  ellipse: 4,
  contour: { min: 3 },
  arrow: 2,
} as const;

/** 도구별 포인트 수와 좌표 형식을 검사한다. 문제가 없으면 null */
export function validatePoints(
  tool: AnnotationTool,
  points: readonly ImagePoint[],
): string | null {
  const rule = POINT_COUNT[tool];
  const countOk =
    typeof rule === "number"
      ? points.length === rule
      : points.length >= rule.min;
  if (!countOk) {
    const expected =
      typeof rule === "number" ? `${rule}개 필요` : `${rule.min}개 이상 필요`;
    return `포인트 수가 올바르지 않습니다(${tool}: ${expected}, ${points.length}개)`;
  }
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2)
      return "좌표는 [열, 행] 두 값이어야 합니다";
    if (
      !point.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    ) {
      return "좌표 값이 유한한 숫자가 아닙니다";
    }
  }
  return null;
}

function validSpacing(
  spacing: readonly [number, number] | undefined,
): spacing is readonly [number, number] {
  return (
    spacing !== undefined &&
    spacing.length === 2 &&
    spacing.every(
      (value) =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    )
  );
}

/**
 * 이미지 좌표와 PixelSpacing([행, 열])으로 측정값을 계산한다.
 * 간격이 유효하면 열 이동 × 열 간격, 행 이동 × 행 간격의 물리 좌표(mm)로, 아니면 픽셀 단위로 계산한다.
 * world 좌표는 이미 mm 이므로 쓰지 않는다(간격 이중 적용 방지).
 */
export function measureAnnotation(
  tool: AnnotationTool,
  points: readonly ImagePoint[],
  pixelSpacing: readonly [number, number] | undefined,
): Measurement | null {
  const problem = validatePoints(tool, points);
  if (problem) throw new RangeError(problem);
  if (tool === "arrow") return null;

  const calibrated = validSpacing(pixelSpacing);
  const [rowSpacing, columnSpacing] = calibrated ? pixelSpacing : [1, 1];
  const physical = points.map(
    ([column, row]) => [column * columnSpacing, row * rowSpacing] as const,
  );
  const linearUnit = calibrated ? "mm" : "px";
  const areaUnit = calibrated ? "mm²" : "px²";
  const distance = (
    a: readonly [number, number],
    b: readonly [number, number],
  ) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  switch (tool) {
    case "length":
      return {
        kind: "length",
        value: distance(physical[0]!, physical[1]!),
        unit: linearUnit,
        calibrated,
      };
    case "angle": {
      const [a, vertex, b] = physical as [
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
      ];
      const v1 = [a[0] - vertex[0], a[1] - vertex[1]];
      const v2 = [b[0] - vertex[0], b[1] - vertex[1]];
      const cosine =
        (v1[0]! * v2[0]! + v1[1]! * v2[1]!) /
        (Math.hypot(v1[0]!, v1[1]!) * Math.hypot(v2[0]!, v2[1]!));
      const value =
        (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
      return {
        kind: "angle",
        value: Number.isFinite(value) ? value : 0,
        unit: "°",
        calibrated,
      };
    }
    case "ellipse": {
      // 끝점(위·아래·왼쪽·오른쪽)으로 두 반지름 벡터를 만든다. 이미지에서 수직인 반축도 비등방 간격을
      // 적용하면 수직이 아닐 수 있으므로(공액 반지름) 넓이는 π|u×v|, 실제 반축은 a²+b²=|u|²+|v|², ab=|u×v| 로 구한다.
      const [top, bottom, left, right] = physical as [
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
      ];
      const u = [(bottom[0] - top[0]) / 2, (bottom[1] - top[1]) / 2] as const;
      const v = [(right[0] - left[0]) / 2, (right[1] - left[1]) / 2] as const;
      const product = Math.abs(u[0] * v[1] - u[1] * v[0]);
      const sumSquares = u[0] ** 2 + u[1] ** 2 + v[0] ** 2 + v[1] ** 2;
      const spread = Math.sqrt(Math.max(0, sumSquares ** 2 - 4 * product ** 2));
      const a = Math.sqrt((sumSquares + spread) / 2);
      const b = Math.sqrt(Math.max(0, (sumSquares - spread) / 2));
      // 둘레는 Ramanujan 근사
      const perimeter =
        Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      return {
        kind: "area",
        value: Math.PI * product,
        unit: areaUnit,
        perimeter: { value: perimeter, unit: linearUnit },
        calibrated,
      };
    }
    case "contour": {
      let twiceArea = 0;
      let perimeter = 0;
      for (let i = 0; i < physical.length; i += 1) {
        const current = physical[i]!;
        const next = physical[(i + 1) % physical.length]!;
        twiceArea += current[0] * next[1] - next[0] * current[1];
        perimeter += distance(current, next);
      }
      return {
        kind: "area",
        value: Math.abs(twiceArea) / 2,
        unit: areaUnit,
        perimeter: { value: perimeter, unit: linearUnit },
        calibrated,
      };
    }
  }
}

export function formatMeasurement(measurement: Measurement): string {
  const separator = measurement.unit === "°" ? "" : " ";
  const main = `${measurement.value.toFixed(2)}${separator}${measurement.unit}`;
  return measurement.perimeter
    ? `${main} · 둘레 ${measurement.perimeter.value.toFixed(2)} ${measurement.perimeter.unit}`
    : main;
}
