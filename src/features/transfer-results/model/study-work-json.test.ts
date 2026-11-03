import { describe, expect, it } from "vitest";

import type { DicomInstanceMetadata } from "@/entities/dicom-study";
import {
  type Annotation,
  applyWorkAction,
  createStudyWork,
  type StudyWork,
} from "@/entities/study-work";
import { imageToWorld } from "@/shared/lib/geometry";

import {
  exportStudyWork,
  parseStudyWorkImport,
  STUDY_WORK_FORMAT,
} from "./study-work-json";

const NOW = "2026-11-02T10:00:00.000Z";
const STUDY = "2.25.1";
const AXIAL = [1, 0, 0, 0, 1, 0] as const;

const single: DicomInstanceMetadata = {
  sopInstanceUid: "2.25.100",
  sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
  studyInstanceUid: STUDY,
  seriesInstanceUid: "2.25.10",
  transferSyntaxUid: "1.2.840.10008.1.2.1",
  rows: 32,
  columns: 32,
  numberOfFrames: 1,
  frameKind: "single",
  frameOfReferenceUid: "2.25.900",
  imagePositionPatient: [-10, -10, 5],
  imageOrientationPatient: AXIAL,
  pixelSpacing: [0.5, 2],
};
const multi: DicomInstanceMetadata = {
  sopInstanceUid: "2.25.200",
  sopClassUid: "1.2.840.10008.5.1.4.1.1.2.1",
  studyInstanceUid: STUDY,
  seriesInstanceUid: "2.25.20",
  transferSyntaxUid: "1.2.840.10008.1.2.1",
  rows: 16,
  columns: 16,
  numberOfFrames: 2,
  frameKind: "spatial",
  imageOrientationPatient: AXIAL,
  framePositions: [
    [0, 0, 0],
    [0, 0, 5],
  ],
  framePixelSpacings: [
    [1, 1],
    [3, 3],
  ],
};
const noGeometry: DicomInstanceMetadata = {
  ...single,
  sopInstanceUid: "2.25.300",
  seriesInstanceUid: "2.25.30",
  frameOfReferenceUid: undefined,
  imagePositionPatient: undefined,
  imageOrientationPatient: undefined,
  pixelSpacing: undefined,
};
const instances = [single, multi, noGeometry];

const plane = {
  imagePositionPatient: single.imagePositionPatient!,
  imageOrientationPatient: single.imageOrientationPatient!,
  pixelSpacing: single.pixelSpacing!,
};

function lengthOnSingle(id = "a1"): Annotation {
  const imagePoints: Annotation["imagePoints"] = [
    [0, 0],
    [3, 4],
  ];
  return {
    id,
    tool: "length",
    reference: {
      studyInstanceUid: STUDY,
      seriesInstanceUid: "2.25.10",
      sopInstanceUid: "2.25.100",
    },
    frameOfReferenceUid: "2.25.900",
    imagePoints,
    worldPoints: imagePoints.map((point) => imageToWorld(plane, point)),
    note: "메모",
    visible: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function workWith(...annotations: Annotation[]): StudyWork {
  return { ...createStudyWork(STUDY, NOW), annotations, revision: 3 };
}

const context = {
  studyInstanceUid: STUDY,
  instances,
  currentRevision: 10,
  now: NOW,
};

/** 내보낸 JSON 을 고쳐 가져오기 결과를 본다 */
function importModified(
  mutate: (
    json: Record<string, unknown> & { annotations: Record<string, unknown>[] },
  ) => void,
) {
  const json = JSON.parse(
    JSON.stringify(exportStudyWork(workWith(lengthOnSingle()), instances, NOW)),
  );
  mutate(json);
  return parseStudyWorkImport(JSON.stringify(json), context);
}

describe("exportStudyWork (S6-2, S6-5, S6-6)", () => {
  it("버전·형식·참조 UID·좌표·라벨을 담고 픽셀 데이터는 포함하지 않으며 재연결 조건을 명시한다", () => {
    const exported = exportStudyWork(
      workWith(lengthOnSingle()),
      instances,
      NOW,
    );

    expect(exported).toMatchObject({
      format: STUDY_WORK_FORMAT,
      schemaVersion: 1,
      exportedAt: NOW,
      containsPixelData: false,
      studyInstanceUid: STUDY,
      completed: false,
    });
    expect(exported.reconnection).toContain("원본 DICOM");
    expect(exported.annotations[0]).toMatchObject({
      id: "a1",
      tool: "length",
      reference: {
        studyInstanceUid: STUDY,
        seriesInstanceUid: "2.25.10",
        sopInstanceUid: "2.25.100",
      },
      frameOfReferenceUid: "2.25.900",
      coordinateSystem: {
        image: "pixel-index [column, row], first pixel center = (0,0)",
        world: "DICOM patient (mm)",
      },
      imagePoints: [
        [0, 0],
        [3, 4],
      ],
      derivedMeasurement: { kind: "length", unit: "mm", calibrated: true },
    });
    expect(exported.annotations[0]!.derivedMeasurement!.value).toBeCloseTo(
      Math.hypot(6, 2),
      9,
    );
    // 픽셀 데이터 필드(키)나 Pixel Data 태그가 없어야 한다(containsPixelData 플래그는 제외).
    expect(JSON.stringify(exported)).not.toMatch(/"pixelData"\s*:|7FE0,?0010/i);
    expect(Object.keys(exported).sort()).toEqual([
      "annotations",
      "completed",
      "containsPixelData",
      "exportedAt",
      "format",
      "labels",
      "reconnection",
      "schemaVersion",
      "studyInstanceUid",
      "targets",
    ]);
  });

  it("멀티프레임 주석의 측정값은 참조 프레임의 간격으로 계산한다", () => {
    const annotation: Annotation = {
      ...lengthOnSingle(),
      reference: {
        studyInstanceUid: STUDY,
        seriesInstanceUid: "2.25.20",
        sopInstanceUid: "2.25.200",
        frameNumber: 2,
      },
      frameOfReferenceUid: undefined,
      worldPoints: undefined,
    };

    const exported = exportStudyWork(workWith(annotation), instances, NOW);

    expect(exported.annotations[0]!.derivedMeasurement!.value).toBeCloseTo(
      15,
      9,
    );
  });
});

describe("parseStudyWorkImport (S6-5)", () => {
  it("내보낸 결과를 그대로 다시 가져오면 같은 주석을 복원하고 revision 은 현재보다 크게 한다", () => {
    const original = workWith(lengthOnSingle());
    const result = parseStudyWorkImport(
      JSON.stringify(exportStudyWork(original, instances, NOW)),
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.work).toEqual({
      ...original,
      revision: 11,
      updatedAt: NOW,
    });
  });

  it.each([
    ["JSON 이 아님", "{not json", "JSON 형식이 아닙니다"],
    [
      "형식 식별자 다름",
      JSON.stringify({ format: "other" }),
      "이 앱의 작업 결과 파일이 아닙니다",
    ],
  ])("%s", (_name, text, message) => {
    const result = parseStudyWorkImport(text, context);

    expect(result).toEqual({ ok: false, errors: [message] });
  });

  const cases: [
    string,
    (
      json: Record<string, unknown> & {
        annotations: Record<string, unknown>[];
      },
    ) => void,
    string,
  ][] = [
    [
      "지원하지 않는 schemaVersion",
      (json) => (json.schemaVersion = 2),
      "지원하지 않는 schemaVersion 입니다: 2",
    ],
    [
      "다른 검사",
      (json) => (json.studyInstanceUid = "2.25.999"),
      "현재 검사(2.25.1)와 다른 검사(2.25.999)의 결과입니다",
    ],
    [
      "중복 주석 ID",
      (json) => json.annotations.push({ ...json.annotations[0] }),
      "중복된 주석 ID: a1",
    ],
    [
      "알 수 없는 도구",
      (json) => (json.annotations[0]!.tool = "brush"),
      "주석 a1: 알 수 없는 도구 brush",
    ],
    [
      "포인트 수",
      (json) => (json.annotations[0]!.imagePoints = [[0, 0]]),
      "주석 a1: 포인트 수가 올바르지 않습니다(length: 2개 필요, 1개)",
    ],
    [
      "좌표 길이",
      (json) =>
        (json.annotations[0]!.imagePoints = [
          [0, 0, 0],
          [1, 1],
        ]),
      "주석 a1: 좌표는 [열, 행] 두 값이어야 합니다",
    ],
    [
      "숫자가 아닌 좌표",
      (json) =>
        (json.annotations[0]!.imagePoints = [
          [0, null],
          [1, 1],
        ]),
      "주석 a1: 좌표 값이 유한한 숫자가 아닙니다",
    ],
    [
      "영상 밖 좌표",
      (json) =>
        (json.annotations[0]!.imagePoints = [
          [0, 0],
          [40, 1],
        ]),
      "주석 a1: 좌표가 영상 범위(32 × 32)를 벗어났습니다",
    ],
    [
      "없는 시리즈",
      (json) =>
        ((
          json.annotations[0]!.reference as Record<string, unknown>
        ).seriesInstanceUid = "2.25.404"),
      "주석 a1: 이 검사에 시리즈 2.25.404 가 없습니다",
    ],
    [
      "다른 시리즈의 SOP",
      (json) =>
        ((
          json.annotations[0]!.reference as Record<string, unknown>
        ).sopInstanceUid = "2.25.200"),
      "주석 a1: 시리즈 2.25.10 에 영상 2.25.200 이 없습니다",
    ],
    [
      "단일 프레임에 frameNumber",
      (json) =>
        ((
          json.annotations[0]!.reference as Record<string, unknown>
        ).frameNumber = 1),
      "주석 a1: 단일 프레임 영상에 frameNumber 가 있습니다",
    ],
    [
      "FrameOfReference 불일치",
      (json) => (json.annotations[0]!.frameOfReferenceUid = "2.25.111"),
      "주석 a1: FrameOfReferenceUID 가 원본(2.25.900)과 다릅니다",
    ],
    [
      "world 좌표 불일치",
      (json) =>
        (json.annotations[0]!.worldPoints = [
          [0, 0, 0],
          [1, 1, 1],
        ]),
      "주석 a1: world 좌표가 영상 좌표와 맞지 않습니다",
    ],
    [
      "world 좌표 무한대",
      (json) =>
        (json.annotations[0]!.worldPoints = [
          [0, 0, 1e400],
          [1, 1, 1],
        ]),
      "주석 a1: world 좌표 값이 유한한 숫자가 아닙니다",
    ],
    [
      "없는 라벨",
      (json) => (json.annotations[0]!.labelId = "missing"),
      "주석 a1: 라벨 missing 이 없습니다",
    ],
    [
      "없는 대상",
      (json) => (json.annotations[0]!.targetId = "missing"),
      "주석 a1: 대상 missing 이 없습니다",
    ],
    [
      "좌표계 누락",
      (json) => delete json.annotations[0]!.coordinateSystem,
      "주석 a1: 좌표계(coordinateSystem) 선언이 없습니다",
    ],
    [
      "canvas 좌표계",
      (json) =>
        ((
          json.annotations[0]!.coordinateSystem as Record<string, unknown>
        ).image = "canvas pixels"),
      "주석 a1: 지원하지 않는 영상 좌표계입니다: canvas pixels",
    ],
    [
      "알 수 없는 world 좌표계",
      (json) =>
        ((
          json.annotations[0]!.coordinateSystem as Record<string, unknown>
        ).world = "RAS (mm)"),
      "주석 a1: 지원하지 않는 world 좌표계입니다: RAS (mm)",
    ],
    [
      "중복 라벨 ID",
      (json) => (json.labels as unknown[]).push((json.labels as unknown[])[0]),
      "중복된 라벨 ID: organ-liver",
    ],
  ];

  it.each(cases)(
    "%s 는 거부하고 아무것도 연결하지 않는다",
    (_name, mutate, message) => {
      const result = importModified(mutate);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors).toContain(message);
    },
  );

  it("멀티프레임 주석은 유효한 frameNumber 가 있어야 한다", () => {
    const annotation: Annotation = {
      ...lengthOnSingle(),
      reference: {
        studyInstanceUid: STUDY,
        seriesInstanceUid: "2.25.20",
        sopInstanceUid: "2.25.200",
        frameNumber: 3,
      },
      frameOfReferenceUid: undefined,
      worldPoints: undefined,
    };
    const text = JSON.stringify(
      exportStudyWork(workWith(annotation), instances, NOW),
    );

    const result = parseStudyWorkImport(text, context);

    expect(!result.ok && result.errors).toContain(
      "주석 a1: frameNumber 3 이(가) 범위(1~2)를 벗어났습니다",
    );
    const missing = JSON.parse(text);
    delete missing.annotations[0].reference.frameNumber;
    expect(
      parseStudyWorkImport(JSON.stringify(missing), context),
    ).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        "주석 a1: 멀티프레임 영상에는 frameNumber 가 필요합니다",
      ]),
    });
  });

  it("기하 정보가 없는 영상의 주석에 world 좌표가 있으면 연결하지 않는다", () => {
    const annotation: Annotation = {
      ...lengthOnSingle(),
      reference: {
        studyInstanceUid: STUDY,
        seriesInstanceUid: "2.25.30",
        sopInstanceUid: "2.25.300",
      },
      frameOfReferenceUid: undefined,
    };

    const result = parseStudyWorkImport(
      JSON.stringify(exportStudyWork(workWith(annotation), instances, NOW)),
      context,
    );

    expect(!result.ok && result.errors).toContain(
      "주석 a1: 원본 영상에 공간 기하 정보가 없어 world 좌표를 검증할 수 없습니다",
    );
  });

  it("대상의 라벨과 주석의 라벨이 다르면 거부한다", () => {
    const result = importModified((json) => {
      (json.targets as unknown[]).push({
        id: "t1",
        labelId: "lesion-nodule",
        name: "결절 1",
      });
      json.annotations[0]!.labelId = "organ-liver";
      json.annotations[0]!.targetId = "t1";
    });

    expect(!result.ok && result.errors).toContain(
      "주석 a1: 대상 t1 의 라벨(lesion-nodule)과 주석 라벨(organ-liver)이 다릅니다",
    );
  });
});

describe("좌표 편집 후 내보내기·가져오기 왕복", () => {
  it("좌표를 편집한 결과도 world 정합성 검증을 통과해 다시 가져온다", () => {
    const edited = applyWorkAction(
      workWith(lengthOnSingle()),
      {
        type: "annotation/update",
        id: "a1",
        patch: {
          imagePoints: [
            [1, 1],
            [10, 2],
          ],
        },
      },
      NOW,
    );
    if (!edited.ok) throw new Error(edited.error);

    const result = parseStudyWorkImport(
      JSON.stringify(exportStudyWork(edited.work, instances, NOW)),
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.work.annotations[0]!.imagePoints).toEqual([
      [1, 1],
      [10, 2],
    ]);
  });
});
