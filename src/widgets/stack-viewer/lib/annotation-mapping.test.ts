import { describe, expect, it } from "vitest";

import type { Annotation } from "@/entities/study-work";

import {
  ENGINE_TOOL_NAMES,
  fromEngineAnnotation,
  toEngineAnnotation,
} from "./annotation-mapping";

/** 엔진 world 변환 대역: world = (열 × 2, 행 × 0.5, 7) */
const toWorld = ([column, row]: readonly [number, number]) =>
  [column * 2, row * 0.5, 7] as const;
const toImage = (world: readonly number[]) =>
  [world[0]! / 2, world[1]! / 0.5] as [number, number];

function annotation(
  tool: Annotation["tool"],
  imagePoints: Annotation["imagePoints"],
  note = "",
): Annotation {
  return {
    id: `${tool}-1`,
    tool,
    reference: {
      studyInstanceUid: "2.25.1",
      seriesInstanceUid: "2.25.2",
      sopInstanceUid: "2.25.3",
    },
    imagePoints,
    note,
    visible: true,
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

describe("엔진 주석 ↔ 작업 문서 변환", () => {
  it("도구 이름을 공식 Cornerstone Tools 이름에 대응시킨다", () => {
    expect(ENGINE_TOOL_NAMES).toEqual({
      length: "Length",
      angle: "Angle",
      ellipse: "EllipticalROI",
      contour: "PlanarFreehandROI",
      arrow: "ArrowAnnotate",
    });
  });

  it("길이: 이미지 좌표를 엔진 world 좌표 handles 로 바꾸고 참조 영상을 지정한다", () => {
    const engine = toEngineAnnotation(
      annotation("length", [
        [1, 2],
        [3, 4],
      ]),
      {
        imageId: "dicomfile:0",
        frameOfReferenceUid: "2.25.9",
        selected: true,
        toWorld,
      },
    );

    expect(engine).toEqual({
      toolName: "Length",
      base: {
        annotationUID: "length-1",
        highlighted: true,
        isSelected: true,
        metadata: {
          toolName: "Length",
          referencedImageId: "dicomfile:0",
          FrameOfReferenceUID: "2.25.9",
        },
        data: {
          handles: {
            points: [
              [2, 1, 7],
              [6, 2, 7],
            ],
            activeHandleIndex: null,
          },
          label: "",
          cachedStats: {},
        },
      },
    });
  });

  it("타원: 문서 [위,아래,왼,오] 를 엔진 [아래,위,왼,오] 로, 되돌릴 때 다시 문서 순서로 바꾼다", () => {
    const source = annotation("ellipse", [
      [5, 0],
      [5, 4],
      [3, 2],
      [7, 2],
    ]);
    const engine = toEngineAnnotation(source, {
      imageId: "dicomfile:0",
      selected: false,
      toWorld,
    });

    expect(engine.base.data.handles.points).toEqual([
      toWorld([5, 4]),
      toWorld([5, 0]),
      toWorld([3, 2]),
      toWorld([7, 2]),
    ]);
    expect(
      fromEngineAnnotation(
        {
          annotationUID: "e",
          metadata: { toolName: "EllipticalROI" },
          data: engine.base.data,
        },
        toImage,
      ),
    ).toEqual({
      id: "e",
      tool: "ellipse",
      imagePoints: source.imagePoints,
    });
  });

  it("윤곽: 닫힌 polyline 으로 보내고 polyline 에서 좌표를 되찾는다", () => {
    const engine = toEngineAnnotation(
      annotation("contour", [
        [0, 0],
        [4, 0],
        [4, 4],
      ]),
      {
        imageId: "dicomfile:0",
        selected: false,
        toWorld,
      },
    );

    expect(engine.base.data).toMatchObject({
      contour: {
        polyline: [toWorld([0, 0]), toWorld([4, 0]), toWorld([4, 4])],
        closed: true,
      },
      handles: { points: [] },
    });
    expect(
      fromEngineAnnotation(
        {
          annotationUID: "c",
          metadata: { toolName: "PlanarFreehandROI" },
          data: engine.base.data,
        },
        toImage,
      ),
    ).toEqual({
      id: "c",
      tool: "contour",
      imagePoints: [
        [0, 0],
        [4, 0],
        [4, 4],
      ],
    });
  });

  it("화살표 메모: 메모를 엔진 label 로 표시한다", () => {
    const engine = toEngineAnnotation(
      annotation(
        "arrow",
        [
          [1, 1],
          [2, 2],
        ],
        "확인 필요",
      ),
      {
        imageId: "dicomfile:0",
        selected: false,
        toWorld,
      },
    );

    expect(engine.base.data.label).toBe("확인 필요");
  });

  it("지원하지 않는 엔진 도구나 좌표가 없는 주석은 무시한다", () => {
    expect(
      fromEngineAnnotation(
        {
          annotationUID: "x",
          metadata: { toolName: "Probe" },
          data: { handles: { points: [[0, 0, 0]] } },
        },
        toImage,
      ),
    ).toBeNull();
    expect(
      fromEngineAnnotation(
        {
          annotationUID: "y",
          metadata: { toolName: "Length" },
          data: { handles: { points: [] } },
        },
        toImage,
      ),
    ).toBeNull();
  });
});
