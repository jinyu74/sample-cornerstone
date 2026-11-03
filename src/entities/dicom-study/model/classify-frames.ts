import { dot } from "@/shared/lib/geometry";

import {
  commonAxes,
  countDistinctPositions,
  orientationAxes,
} from "./orientation";
import type { FrameClassificationInput, FrameKind } from "./types";

/**
 * 멀티프레임 프레임이 공간 슬라이스인지 시간 프레임인지 메타데이터로 분류한다.
 * - 모든 프레임에 위치가 있고 법선 방향 투영 위치가 서로 다르면 spatial
 * - 위치가 모두 같거나 없고 FrameTime/FrameTimeVector 가 있으면 temporal
 * - 일부 위치만 반복(공간+시간 혼합 등)되거나 근거가 없으면 unknown
 * - 프레임별 방향이 서로 다르면 unknown
 * 위치 정보가 있다는 사실만으로 spatial 로 보지 않는다.
 */
export function classifyFrames(input: FrameClassificationInput): FrameKind {
  const { numberOfFrames } = input;
  if (numberOfFrames <= 1) return "single";

  const hasTime =
    (input.frameTimeMs !== undefined &&
      Number.isFinite(input.frameTimeMs) &&
      input.frameTimeMs > 0) ||
    (input.frameTimeVector?.length ?? 0) > 0;

  // 프레임별 방향이 있으면 모든 프레임이 같은 방향일 때만 위치 비교에 쓴다.
  const frameOrientations = input.frameOrientations;
  if (frameOrientations && frameOrientations.length > 0) {
    if (
      frameOrientations.length !== numberOfFrames ||
      !commonAxes(frameOrientations)
    ) {
      return "unknown";
    }
  }
  const axes = frameOrientations?.length
    ? commonAxes(frameOrientations)
    : orientationAxes(input.imageOrientationPatient);
  const positions = input.framePositions;
  const usablePositions =
    axes !== null &&
    positions !== undefined &&
    positions.length === numberOfFrames &&
    positions.every((position) => position.every(Number.isFinite));

  if (usablePositions) {
    const distinct = countDistinctPositions(
      positions.map((position) => dot(position, axes.normal)),
    );
    if (distinct === numberOfFrames) return "spatial";
    if (distinct === 1) return hasTime ? "temporal" : "unknown";
    return "unknown";
  }

  return hasTime ? "temporal" : "unknown";
}
