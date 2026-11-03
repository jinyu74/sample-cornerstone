import type { DicomInstanceMetadata, FrameGeometry } from "./types";

/**
 * 특정 프레임의 위치·방향·픽셀 간격을 돌려준다. 프레임별 값이 있으면 그것을 쓰고,
 * 없으면 영상 공통 값을 쓴다. 측정 단위 보정과 좌표 복원은 이 값을 기준으로 한다.
 * frameNumber 는 1부터 시작하며 단일 프레임은 생략한다.
 */
export function frameGeometry(
  metadata: DicomInstanceMetadata,
  frameNumber = 1,
): FrameGeometry {
  if (
    !Number.isInteger(frameNumber) ||
    frameNumber < 1 ||
    frameNumber > metadata.numberOfFrames
  ) {
    throw new RangeError(
      `프레임 번호 ${frameNumber} 이(가) 범위(1~${metadata.numberOfFrames})를 벗어났습니다`,
    );
  }
  const index = frameNumber - 1;
  const geometry: FrameGeometry = {
    imagePositionPatient:
      metadata.framePositions?.[index] ?? metadata.imagePositionPatient,
    imageOrientationPatient:
      metadata.frameOrientations?.[index] ?? metadata.imageOrientationPatient,
    pixelSpacing: metadata.framePixelSpacings?.[index] ?? metadata.pixelSpacing,
  };
  return Object.fromEntries(
    Object.entries(geometry).filter(([, value]) => value !== undefined),
  ) as FrameGeometry;
}
