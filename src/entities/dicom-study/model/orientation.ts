import { cross, dot, normalize, type Vec3 } from "@/shared/lib/geometry";

import type { Orientation } from "./types";

/** 방향 코사인 비교 허용 오차 (DICOM DS 반올림 고려) */
const ORIENTATION_TOLERANCE = 1e-4;
/** 행·열 방향 직교성 허용 오차 */
const ORTHOGONALITY_TOLERANCE = 1e-3;
/** 같은 위치로 볼 슬라이스 법선 방향 투영 거리(mm) */
export const POSITION_TOLERANCE_MM = 1e-3;

export interface OrientationAxes {
  row: Vec3;
  column: Vec3;
  normal: Vec3;
}

/** 방향 코사인이 유효(유한, 길이 0 아님, 직교)하면 정규화된 축을, 아니면 null 을 돌려준다. */
export function orientationAxes(
  orientation: Orientation | undefined,
): OrientationAxes | null {
  if (!orientation) return null;
  const row = normalize([orientation[0], orientation[1], orientation[2]]);
  const column = normalize([orientation[3], orientation[4], orientation[5]]);
  if (!row || !column || Math.abs(dot(row, column)) > ORTHOGONALITY_TOLERANCE)
    return null;
  const normal = normalize(cross(row, column));
  return normal ? { row, column, normal } : null;
}

/**
 * 정렬된 거리 목록을 앵커(그룹 첫 값) 기준 허용 오차로 묶은 그룹 수를 센다.
 * 입력 순서와 무관하도록 내부에서 정렬한다.
 */
export function countDistinctPositions(distances: readonly number[]): number {
  const sorted = [...distances].sort((a, b) => a - b);
  let groups = 0;
  let anchor = Number.NEGATIVE_INFINITY;
  for (const distance of sorted) {
    if (groups === 0 || distance - anchor > POSITION_TOLERANCE_MM) {
      groups += 1;
      anchor = distance;
    }
  }
  return groups;
}

export function sameDirection(a: Vec3, b: Vec3): boolean {
  return a.every(
    (value, i) => Math.abs(value - b[i]!) <= ORIENTATION_TOLERANCE,
  );
}

/** 두 방향의 행·열 축이 허용 오차 안에서 같은지 */
export function sameAxes(a: OrientationAxes, b: OrientationAxes): boolean {
  return sameDirection(a.row, b.row) && sameDirection(a.column, b.column);
}

/**
 * 모든 방향이 유효하고 첫 방향과 같으면 첫 방향의 축을, 아니면 null 을 돌려준다.
 * 프레임별 방향처럼 순서가 데이터로 고정된 목록에 쓴다.
 */
export function commonAxes(
  orientations: readonly Orientation[],
): OrientationAxes | null {
  const axes = orientations.map(orientationAxes);
  const first = axes[0];
  if (!first || axes.some((axis) => axis === null || !sameAxes(axis, first)))
    return null;
  return first;
}
