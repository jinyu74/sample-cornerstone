import { describe, expect, it } from "vitest";

import { classifyFrames } from "./classify-frames";

const AXIAL = [1, 0, 0, 0, 1, 0] as const;

describe("classifyFrames (S2-5)", () => {
  it("프레임이 1개면 single", () => {
    expect(classifyFrames({ numberOfFrames: 1 })).toBe("single");
  });

  it("모든 프레임에 서로 다른 위치가 있으면 spatial", () => {
    expect(
      classifyFrames({
        numberOfFrames: 3,
        imageOrientationPatient: AXIAL,
        framePositions: [
          [0, 0, 10],
          [0, 0, 0],
          [0, 0, 5],
        ],
      }),
    ).toBe("spatial");
  });

  it("위치가 반복되고 시간 정보가 있으면 temporal (위치가 있다는 이유만으로 spatial 아님)", () => {
    expect(
      classifyFrames({
        numberOfFrames: 3,
        imageOrientationPatient: AXIAL,
        framePositions: [
          [0, 0, 7],
          [0, 0, 7],
          [0, 0, 7],
        ],
        frameTimeMs: 40,
      }),
    ).toBe("temporal");
  });

  it("위치 없이 FrameTime 또는 FrameTimeVector 만 있으면 temporal", () => {
    expect(classifyFrames({ numberOfFrames: 4, frameTimeMs: 33.3 })).toBe(
      "temporal",
    );
    expect(
      classifyFrames({ numberOfFrames: 3, frameTimeVector: [0, 33, 33] }),
    ).toBe("temporal");
  });

  it("일부 위치만 반복되면(공간+시간 혼합 등) 공간 스택으로 보지 않고 unknown", () => {
    expect(
      classifyFrames({
        numberOfFrames: 4,
        imageOrientationPatient: AXIAL,
        framePositions: [
          [0, 0, 0],
          [0, 0, 5],
          [0, 0, 0],
          [0, 0, 5],
        ],
        frameTimeMs: 50,
      }),
    ).toBe("unknown");
  });

  it("위치가 같고 시간 정보도 없으면 unknown", () => {
    expect(
      classifyFrames({
        numberOfFrames: 2,
        imageOrientationPatient: AXIAL,
        framePositions: [
          [0, 0, 1],
          [0, 0, 1],
        ],
      }),
    ).toBe("unknown");
  });

  it("위치 수가 프레임 수와 다르거나 방향이 없으면 위치를 근거로 쓰지 않는다", () => {
    expect(
      classifyFrames({
        numberOfFrames: 3,
        imageOrientationPatient: AXIAL,
        framePositions: [
          [0, 0, 0],
          [0, 0, 1],
        ],
      }),
    ).toBe("unknown");
    expect(
      classifyFrames({
        numberOfFrames: 2,
        framePositions: [
          [0, 0, 0],
          [0, 0, 1],
        ],
        frameTimeMs: 10,
      }),
    ).toBe("temporal");
  });

  it("법선 방향 투영이 같으면 면 안에서만 움직인 위치도 반복 위치로 본다", () => {
    expect(
      classifyFrames({
        numberOfFrames: 2,
        imageOrientationPatient: AXIAL,
        framePositions: [
          [0, 0, 3],
          [5, 5, 3],
        ],
        frameTimeMs: 20,
      }),
    ).toBe("temporal");
  });

  it("프레임별 방향이 서로 다르면 위치가 달라도 spatial 로 보지 않는다", () => {
    expect(
      classifyFrames({
        numberOfFrames: 2,
        framePositions: [
          [0, 0, 0],
          [0, 0, 5],
        ],
        frameOrientations: [
          [1, 0, 0, 0, 1, 0],
          [0, 1, 0, 0, 0, 1],
        ],
      }),
    ).toBe("unknown");
  });

  it("프레임별 방향이 모두 같으면 그 방향으로 공간 여부를 판단한다", () => {
    expect(
      classifyFrames({
        numberOfFrames: 2,
        framePositions: [
          [0, 0, 0],
          [0, 0, 5],
        ],
        frameOrientations: [AXIAL, AXIAL],
      }),
    ).toBe("spatial");
  });
});
