import { describe, expect, it } from "vitest";

import { groupStudies } from "./group-studies";
import type { DicomInstanceMetadata } from "./types";

const AXIAL = [1, 0, 0, 0, 1, 0] as const;

function meta(
  overrides: Partial<DicomInstanceMetadata> & { sopInstanceUid: string },
): DicomInstanceMetadata {
  return {
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.10",
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    modality: "CT",
    rows: 4,
    columns: 4,
    numberOfFrames: 1,
    frameKind: "single",
    ...overrides,
  };
}

const items = (series: {
  stack: { ordered: { sopInstanceUid: string; frameNumber?: number }[] };
}) =>
  series.stack.ordered.map((item) =>
    item.frameNumber === undefined
      ? item.sopInstanceUid
      : `${item.sopInstanceUid}#${item.frameNumber}`,
  );

describe("groupStudies (S2-2)", () => {
  it("검사 → 시리즈로 묶고 시리즈 스택을 위치 순서로 정렬한다", () => {
    const studies = groupStudies([
      meta({
        sopInstanceUid: "2.25.103",
        instanceNumber: 1,
        imagePositionPatient: [0, 0, 6],
        imageOrientationPatient: AXIAL,
      }),
      meta({
        sopInstanceUid: "2.25.101",
        instanceNumber: 3,
        imagePositionPatient: [0, 0, 0],
        imageOrientationPatient: AXIAL,
      }),
      meta({
        sopInstanceUid: "2.25.102",
        instanceNumber: 2,
        imagePositionPatient: [0, 0, 3],
        imageOrientationPatient: AXIAL,
      }),
    ]);

    expect(studies).toHaveLength(1);
    expect(studies[0]!.series).toHaveLength(1);
    const [series] = studies[0]!.series;
    expect(series!.stack.method).toBe("spatial");
    expect(items(series!)).toEqual(["2.25.101", "2.25.102", "2.25.103"]);
    expect(series!.instanceCount).toBe(3);
    expect(series!.frameCount).toBe(3);
  });

  it("다른 검사는 분리하고, 같은 SeriesInstanceUID 라도 검사가 다르면 한 스택에 섞지 않는다", () => {
    const studies = groupStudies([
      meta({
        sopInstanceUid: "2.25.201",
        studyInstanceUid: "2.25.1",
        seriesInstanceUid: "2.25.10",
      }),
      meta({
        sopInstanceUid: "2.25.202",
        studyInstanceUid: "2.25.2",
        seriesInstanceUid: "2.25.10",
      }),
      meta({
        sopInstanceUid: "2.25.203",
        studyInstanceUid: "2.25.1",
        seriesInstanceUid: "2.25.11",
      }),
    ]);

    const summary = studies.map((study) => ({
      study: study.studyInstanceUid,
      series: study.series.map((series) => [
        series.seriesInstanceUid,
        items(series),
      ]),
    }));
    expect(summary).toEqual([
      {
        study: "2.25.1",
        series: [
          ["2.25.10", ["2.25.201"]],
          ["2.25.11", ["2.25.203"]],
        ],
      },
      { study: "2.25.2", series: [["2.25.10", ["2.25.202"]]] },
    ]);
  });

  it("공간 멀티프레임은 프레임별 위치로, 시간 멀티프레임은 프레임 번호 순으로 스택을 만든다", () => {
    const [study] = groupStudies([
      meta({
        sopInstanceUid: "2.25.301",
        seriesInstanceUid: "2.25.30",
        numberOfFrames: 3,
        frameKind: "spatial",
        imageOrientationPatient: AXIAL,
        framePositions: [
          [0, 0, 10],
          [0, 0, 0],
          [0, 0, 5],
        ],
      }),
      meta({
        sopInstanceUid: "2.25.302",
        seriesInstanceUid: "2.25.31",
        numberOfFrames: 3,
        frameKind: "temporal",
        imageOrientationPatient: AXIAL,
        framePositions: [
          [0, 0, 7],
          [0, 0, 7],
          [0, 0, 7],
        ],
      }),
    ]);

    const [spatial, temporal] = study!.series;
    expect(items(spatial!)).toEqual(["2.25.301#2", "2.25.301#3", "2.25.301#1"]);
    expect(spatial!.stack.method).toBe("spatial");
    expect(spatial!.instanceCount).toBe(1);
    expect(spatial!.frameCount).toBe(3);
    expect(items(temporal!)).toEqual([
      "2.25.302#1",
      "2.25.302#2",
      "2.25.302#3",
    ]);
    expect(
      temporal!.stack.ordered.every((item) => item.frameKind === "temporal"),
    ).toBe(true);
  });

  it("프레임별 방향이 다른 멀티프레임은 프레임별 방향을 스택 정렬에 넘겨 공간 정렬하지 않는다", () => {
    const [study] = groupStudies([
      meta({
        sopInstanceUid: "2.25.701",
        seriesInstanceUid: "2.25.70",
        numberOfFrames: 2,
        frameKind: "unknown",
        instanceNumber: 1,
        framePositions: [
          [0, 0, 5],
          [0, 0, 0],
        ],
        frameOrientations: [
          [1, 0, 0, 0, 1, 0],
          [0, 1, 0, 0, 0, 1],
        ],
      }),
    ]);

    const [series] = study!.series;
    expect(
      series!.stack.ordered.map((item) => item.imageOrientationPatient),
    ).toEqual([
      [1, 0, 0, 0, 1, 0],
      [0, 1, 0, 0, 0, 1],
    ]);
    expect(series!.stack.method).not.toBe("spatial");
  });

  it("검사는 날짜 내림차순, 시리즈는 SeriesNumber 순서이며 modality 는 중복 없이 모은다", () => {
    const studies = groupStudies([
      meta({
        sopInstanceUid: "2.25.401",
        studyInstanceUid: "2.25.40",
        studyDate: "20250101",
        seriesInstanceUid: "2.25.402",
        seriesNumber: 2,
        modality: "MR",
      }),
      meta({
        sopInstanceUid: "2.25.403",
        studyInstanceUid: "2.25.40",
        studyDate: "20250101",
        seriesInstanceUid: "2.25.404",
        seriesNumber: 1,
        modality: "MR",
      }),
      meta({
        sopInstanceUid: "2.25.405",
        studyInstanceUid: "2.25.40",
        studyDate: "20250101",
        seriesInstanceUid: "2.25.406",
        seriesNumber: 3,
        modality: "SR",
      }),
      meta({
        sopInstanceUid: "2.25.501",
        studyInstanceUid: "2.25.50",
        studyDate: "20260301",
      }),
      meta({ sopInstanceUid: "2.25.601", studyInstanceUid: "2.25.60" }),
    ]);

    expect(studies.map((study) => study.studyInstanceUid)).toEqual([
      "2.25.50",
      "2.25.40",
      "2.25.60",
    ]);
    expect(studies[1]!.series.map((series) => series.seriesNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(studies[1]!.modalities).toEqual(["MR", "SR"]);
  });

  it("빈 입력은 빈 목록", () => {
    expect(groupStudies([])).toEqual([]);
  });
});
