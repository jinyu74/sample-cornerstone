import { describe, expect, it } from "vitest";

import { imagePlaneAt, pixelSpacingAt } from "./image-plane-at";
import type { DicomInstanceMetadata } from "./types";

const base: DicomInstanceMetadata = {
  sopInstanceUid: "2.25.1",
  sopClassUid: "1.2.840.10008.5.1.4.1.1.2.1",
  studyInstanceUid: "2.25.2",
  seriesInstanceUid: "2.25.3",
  transferSyntaxUid: "1.2.840.10008.1.2.1",
  rows: 4,
  columns: 4,
  numberOfFrames: 2,
  frameKind: "spatial",
  imageOrientationPatient: [1, 0, 0, 0, 1, 0],
  framePositions: [
    [0, 0, 0],
    [0, 0, 5],
  ],
  framePixelSpacings: [
    [0.5, 0.5],
    [1, 2],
  ],
};

describe("pixelSpacingAt / imagePlaneAt (프레임별 보정)", () => {
  it("멀티프레임은 참조한 프레임의 간격과 위치를 쓴다", () => {
    expect(pixelSpacingAt([base], "2.25.1", 2)).toEqual([1, 2]);
    expect(imagePlaneAt([base], "2.25.1", 2)).toEqual({
      imagePositionPatient: [0, 0, 5],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [1, 2],
    });
  });

  it("없는 영상·범위 밖 프레임은 undefined, 기하가 불완전하면 평면은 undefined 이고 간격만 돌려준다", () => {
    expect(pixelSpacingAt([base], "2.25.404", 1)).toBeUndefined();
    expect(pixelSpacingAt([base], "2.25.1", 3)).toBeUndefined();
    const noPosition = { ...base, framePositions: undefined };
    expect(imagePlaneAt([noPosition], "2.25.1", 1)).toBeUndefined();
    expect(pixelSpacingAt([noPosition], "2.25.1", 1)).toEqual([0.5, 0.5]);
  });

  it("단일 프레임은 frameNumber 없이 조회하고 유효하지 않은 간격(0)은 보정 없음으로 본다", () => {
    const single: DicomInstanceMetadata = {
      ...base,
      numberOfFrames: 1,
      frameKind: "single",
      framePositions: undefined,
      framePixelSpacings: undefined,
      imagePositionPatient: [1, 2, 3],
      pixelSpacing: [0, 1],
    };

    expect(pixelSpacingAt([single], "2.25.1", undefined)).toBeUndefined();
    expect(imagePlaneAt([single], "2.25.1", undefined)).toBeUndefined();
  });
});
