import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  type DicomInstanceMetadata,
  groupStudies,
} from "@/entities/dicom-study";
import { type Annotation, createStudyWork } from "@/entities/study-work";

import {
  canvasTextLines,
  useWorkspaceAnnotations,
} from "./use-workspace-annotations";

const AXIAL = [1, 0, 0, 0, 1, 0] as const;
const meta = (
  sop: string,
  z: number,
  overrides: Partial<DicomInstanceMetadata> = {},
): DicomInstanceMetadata => ({
  sopInstanceUid: sop,
  sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
  studyInstanceUid: "2.25.1",
  seriesInstanceUid: "2.25.10",
  seriesDescription: "Axial",
  transferSyntaxUid: "1.2.840.10008.1.2.1",
  rows: 32,
  columns: 32,
  numberOfFrames: 1,
  frameKind: "single",
  imagePositionPatient: [0, 0, z],
  imageOrientationPatient: AXIAL,
  pixelSpacing: [0.5, 0.5],
  ...overrides,
});

const annotation = (
  id: string,
  sop: string,
  overrides: Partial<Annotation> = {},
): Annotation => ({
  id,
  tool: "length",
  reference: {
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.10",
    sopInstanceUid: sop,
  },
  imagePoints: [
    [0, 0],
    [10, 0],
  ],
  note: "",
  visible: true,
  createdAt: "2026-11-02T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
  ...overrides,
});

describe("useWorkspaceAnnotations (S5-7)", () => {
  it("스택 순번이 아닌 SOP UID 로 위치를 찾고, 참조 영상의 간격으로 측정값을 계산한다", () => {
    const [study] = groupStudies([
      meta("2.25.103", 6),
      meta("2.25.101", 0),
      meta("2.25.102", 3, { pixelSpacing: undefined }),
    ]);
    const work = {
      ...createStudyWork("2.25.1", "2026-11-02T00:00:00.000Z"),
      annotations: [
        annotation("a1", "2.25.103"),
        annotation("a2", "2.25.102"),
        annotation("a3", "2.25.999"),
      ],
    };

    const { result } = renderHook(() => useWorkspaceAnnotations(study, work));

    expect(result.current.locations.get("a1")).toEqual({
      seriesInstanceUid: "2.25.10",
      index: 2,
    });
    expect(result.current.locations.get("a2")).toEqual({
      seriesInstanceUid: "2.25.10",
      index: 1,
    });
    expect(result.current.locations.has("a3")).toBe(false);
    expect(
      result.current.entries.map((entry) => [
        entry.measurementText,
        entry.calibrated,
        entry.locationText,
      ]),
    ).toEqual([
      ["5.00 mm", true, "Axial · 영상 3/3"],
      ["10.00 px", false, "Axial · 영상 2/3"],
      ["10.00 px", false, "원본 영상 없음"],
    ]);
  });
});

describe("canvasTextLines", () => {
  it("대상(또는 라벨) 이름, 측정값, 화살표 메모를 순서대로 표시한다", () => {
    expect(
      canvasTextLines({
        annotation: annotation("a1", "x", { tool: "arrow", note: "확인" }),
        label: { id: "l", name: "결절", color: "#000000", category: "lesion" },
        locationText: "",
      }),
    ).toEqual(["결절", "확인"]);
    expect(
      canvasTextLines({
        annotation: annotation("a2", "x"),
        measurementText: "5.00 mm",
        locationText: "",
      }),
    ).toEqual(["5.00 mm"]);
  });
});
