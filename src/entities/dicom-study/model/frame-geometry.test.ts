import { describe, expect, it } from "vitest";

import { frameGeometry } from "./frame-geometry";
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
};

describe("frameGeometry (측정·스택이 쓸 프레임별 기하)", () => {
  it("프레임별 값이 있으면 해당 프레임 값을 쓴다", () => {
    const metadata: DicomInstanceMetadata = {
      ...base,
      framePositions: [
        [0, 0, 0],
        [0, 0, 5],
      ],
      frameOrientations: [
        [1, 0, 0, 0, 1, 0],
        [0, 1, 0, 0, 0, 1],
      ],
      framePixelSpacings: [
        [0.5, 0.5],
        [1, 1],
      ],
    };

    expect(frameGeometry(metadata, 2)).toEqual({
      imagePositionPatient: [0, 0, 5],
      imageOrientationPatient: [0, 1, 0, 0, 0, 1],
      pixelSpacing: [1, 1],
    });
  });

  it("프레임별 값이 없으면 영상 공통 값을 쓰고, 단일 프레임은 frameNumber 없이 조회한다", () => {
    const metadata: DicomInstanceMetadata = {
      ...base,
      numberOfFrames: 1,
      frameKind: "single",
      imagePositionPatient: [1, 2, 3],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [0.7, 0.7],
    };

    expect(frameGeometry(metadata)).toEqual({
      imagePositionPatient: [1, 2, 3],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [0.7, 0.7],
    });
  });

  it("범위를 벗어난 프레임 번호는 거부한다", () => {
    expect(() => frameGeometry(base, 3)).toThrow(RangeError);
    expect(() => frameGeometry(base, 0)).toThrow(RangeError);
  });
});
