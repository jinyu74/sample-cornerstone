import { type ImagePlane, isValidImagePlane } from "@/shared/lib/geometry";

import { frameGeometry } from "./frame-geometry";
import type { DicomInstanceMetadata, FrameGeometry } from "./types";

function geometryAt(
  instances: readonly DicomInstanceMetadata[],
  sopInstanceUid: string,
  frameNumber: number | undefined,
): FrameGeometry | undefined {
  const instance = instances.find(
    (item) => item.sopInstanceUid === sopInstanceUid,
  );
  if (!instance) return undefined;
  try {
    return frameGeometry(instance, frameNumber ?? 1);
  } catch {
    return undefined;
  }
}

/** 주석이 참조한 영상(프레임)의 유효한 PixelSpacing [행, 열]. 0·음수·NaN 이면 보정 없음(undefined) */
export function pixelSpacingAt(
  instances: readonly DicomInstanceMetadata[],
  sopInstanceUid: string,
  frameNumber: number | undefined,
): readonly [number, number] | undefined {
  const spacing = geometryAt(
    instances,
    sopInstanceUid,
    frameNumber,
  )?.pixelSpacing;
  return spacing &&
    spacing.every((value) => Number.isFinite(value) && value > 0)
    ? spacing
    : undefined;
}

/** 주석이 참조한 영상(프레임)의 평면 기하. 위치·방향·간격이 모두 유효할 때만 돌려준다 */
export function imagePlaneAt(
  instances: readonly DicomInstanceMetadata[],
  sopInstanceUid: string,
  frameNumber: number | undefined,
): ImagePlane | undefined {
  const geometry = geometryAt(instances, sopInstanceUid, frameNumber);
  if (
    !geometry?.imagePositionPatient ||
    !geometry.imageOrientationPatient ||
    !geometry.pixelSpacing
  )
    return undefined;
  const plane: ImagePlane = {
    imagePositionPatient: geometry.imagePositionPatient,
    imageOrientationPatient: geometry.imageOrientationPatient,
    pixelSpacing: geometry.pixelSpacing,
  };
  return isValidImagePlane(plane) ? plane : undefined;
}
