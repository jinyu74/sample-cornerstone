import { expect, it } from "vitest";

import type { DicomInstanceMetadata } from "@/entities/dicom-study";
import { createStudyWork } from "@/entities/study-work";

import { exportStudyWork, parseStudyWorkImport } from "./study-work-json";

it("화면 canvas 좌표라고 선언된 JSON을 영상 픽셀 좌표로 해석해 연결하지 않는다", () => {
  const now = "2026-11-02T10:00:00.000Z";
  const instance: DicomInstanceMetadata = {
    sopInstanceUid: "2.25.3",
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.2",
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    rows: 32,
    columns: 32,
    numberOfFrames: 1,
    frameKind: "single",
  };
  const work = createStudyWork(instance.studyInstanceUid, now);
  work.annotations.push({
    id: "a1",
    tool: "length",
    reference: {
      studyInstanceUid: instance.studyInstanceUid,
      seriesInstanceUid: instance.seriesInstanceUid,
      sopInstanceUid: instance.sopInstanceUid,
    },
    imagePoints: [
      [1, 1],
      [2, 2],
    ],
    note: "",
    visible: true,
    createdAt: now,
    updatedAt: now,
  });
  const json = exportStudyWork(work, [instance], now);
  json.annotations[0]!.coordinateSystem.image = "canvas pixels";
  const result = parseStudyWorkImport(JSON.stringify(json), {
    studyInstanceUid: instance.studyInstanceUid,
    instances: [instance],
    currentRevision: 0,
    now,
  });
  expect(result.ok).toBe(false);
});
