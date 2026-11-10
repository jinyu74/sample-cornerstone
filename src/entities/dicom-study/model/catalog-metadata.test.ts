import { describe, expect, it } from "vitest";

import type { StoredInstanceRecord } from "../api/types";

import {
  CATALOG_LIMITS,
  parseCatalogSyncRequest,
  projectCatalogStudy,
} from "./catalog-metadata";
import type { DicomInstanceMetadata } from "./types";

const DIGEST = (n: number) => n.toString(16).padStart(64, "0");
const USER = "8f14e45f-ceea-4e7a-9b1c-000000000001";

function record(
  overrides: Partial<DicomInstanceMetadata> & { sopInstanceUid: string },
  digest = DIGEST(1),
): StoredInstanceRecord {
  const metadata: DicomInstanceMetadata = {
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.10",
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    modality: "CT",
    studyDate: "20260101",
    studyTime: "101500",
    studyDescription: "Synthetic study",
    studyId: "S1",
    accessionNumber: "SYN-ACC",
    patientId: "SYN-0001",
    seriesNumber: 2,
    seriesDescription: "Axial",
    instanceNumber: 1,
    frameOfReferenceUid: "2.25.99",
    rows: 4,
    columns: 4,
    numberOfFrames: 1,
    imagePositionPatient: [0, 0, 0],
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    pixelSpacing: [0.5, 0.5],
    frameKind: "single",
    ...overrides,
  };
  return {
    sopInstanceUid: metadata.sopInstanceUid,
    studyInstanceUid: metadata.studyInstanceUid,
    seriesInstanceUid: metadata.seriesInstanceUid,
    contentDigest: digest,
    byteLength: 1234,
    importedAt: "2026-11-04T00:00:00.000Z",
    metadata,
  };
}

/** 객체·배열을 따라가며 나오는 모든 키 경로 */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value))
    return value.flatMap((item) => keyPaths(item, `${prefix}[]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, child]) => {
      const path = `${prefix}${prefix && !prefix.endsWith("]") ? "." : ""}${key}`;
      return [path, ...keyPaths(child, path)];
    });
  return [];
}

describe("projectCatalogStudy: 목록용 메타데이터만 명시적으로 투영한다", () => {
  it("허용한 필드만 남기고 환자 ID·기하·픽셀 정보·크기·가져온 시각은 보내지 않는다", () => {
    const [chunk, ...rest] = projectCatalogStudy("2.25.1", [
      record({ sopInstanceUid: "2.25.101" }, DIGEST(1)),
      record({ sopInstanceUid: "2.25.102", instanceNumber: 2 }, DIGEST(2)),
    ]);
    expect(rest).toEqual([]);
    expect(new Set(keyPaths(chunk))).toEqual(
      new Set([
        "studyInstanceUid",
        "studyDate",
        "studyDescription",
        "studyId",
        "accessionNumber",
        "series",
        "series[]seriesInstanceUid",
        "series[]modality",
        "series[]seriesNumber",
        "series[]seriesDescription",
        "series[]instances",
        "series[]instances[]sopInstanceUid",
        "series[]instances[]contentDigest",
      ]),
    );
    expect(chunk).toEqual({
      studyInstanceUid: "2.25.1",
      studyDate: "20260101",
      studyDescription: "Synthetic study",
      studyId: "S1",
      accessionNumber: "SYN-ACC",
      series: [
        {
          seriesInstanceUid: "2.25.10",
          modality: "CT",
          seriesNumber: 2,
          seriesDescription: "Axial",
          instances: [
            { sopInstanceUid: "2.25.101", contentDigest: DIGEST(1) },
            { sopInstanceUid: "2.25.102", contentDigest: DIGEST(2) },
          ],
        },
      ],
    });
    expect(JSON.stringify(chunk)).not.toContain("SYN-0001");
  });

  it("다른 검사의 영상은 넣지 않고, 비어 있는 선택 값은 키를 생략하며, 입력 순서와 무관하게 같은 결과를 낸다", () => {
    const records = [
      record({
        sopInstanceUid: "2.25.202",
        seriesInstanceUid: "2.25.20",
        seriesNumber: undefined,
        seriesDescription: undefined,
        modality: undefined,
      }),
      record({ sopInstanceUid: "2.25.101" }),
      record({ sopInstanceUid: "2.25.900", studyInstanceUid: "2.25.9" }),
    ];
    const forward = projectCatalogStudy("2.25.1", records);
    const backward = projectCatalogStudy("2.25.1", [...records].reverse());
    expect(forward).toEqual(backward);
    expect(JSON.stringify(forward)).not.toContain("2.25.900");
    expect(
      forward[0]!.series.map((series) => series.seriesInstanceUid),
    ).toEqual(["2.25.10", "2.25.20"]);
    expect(forward[0]!.series[1]).toEqual({
      seriesInstanceUid: "2.25.20",
      instances: [{ sopInstanceUid: "2.25.202", contentDigest: DIGEST(1) }],
    });
  });

  it("검사에 영상이 없으면 보낼 청크가 없다", () => {
    expect(projectCatalogStudy("2.25.1", [])).toEqual([]);
  });

  it("영상이 요청 상한을 넘으면 검사·시리즈 정보를 유지한 여러 청크로 나누고, 모든 영상을 한 번씩만 담는다", () => {
    const records = Array.from({ length: 5 }, (_, index) =>
      record({
        sopInstanceUid: `2.25.10${index}`,
        seriesInstanceUid: index < 3 ? "2.25.10" : "2.25.20",
      }),
    );
    const chunks = projectCatalogStudy("2.25.1", records, { maxInstances: 2 });
    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) {
      expect(chunk.studyInstanceUid).toBe("2.25.1");
      expect(chunk.accessionNumber).toBe("SYN-ACC");
      expect(
        chunk.series.reduce((sum, series) => sum + series.instances.length, 0),
      ).toBeLessThanOrEqual(2);
      for (const series of chunk.series) {
        expect(series.instances.length).toBeGreaterThan(0);
        expect(series.seriesDescription).toBe("Axial");
      }
    }
    const sops = chunks.flatMap((chunk) =>
      chunk.series.flatMap((series) =>
        series.instances.map((instance) => instance.sopInstanceUid),
      ),
    );
    expect(sops.sort()).toEqual(records.map((r) => r.sopInstanceUid).sort());
  });

  /** 길이 상한까지 채운 UID(64자) */
  const longUid = (prefix: string, n: number) => {
    const head = `2.25.${prefix}${n}.`;
    return head + "1".repeat(CATALOG_LIMITS.maxUidLength - head.length);
  };

  it.each([
    ["시리즈 수 상한(200)을 넘는 검사", 450, 1],
    ["영상 수 상한(1000)을 넘는 시리즈", 1, 2500],
    ["시리즈·영상 상한을 함께 넘는 검사", 230, 7],
  ])(
    "%s는 기본 상한에서 각 청크가 서버 검증·본문 크기 상한을 모두 통과하도록 나눈다(최대 길이 값 포함)",
    (_name, seriesCount, perSeries) => {
      const records = Array.from({ length: seriesCount }, (_, s) =>
        Array.from({ length: perSeries }, (_, i) =>
          record(
            {
              sopInstanceUid: longUid(`${s}.`, i),
              seriesInstanceUid: longUid("9.", s),
              studyInstanceUid: longUid("8.", 0),
              studyDescription: "가".repeat(CATALOG_LIMITS.maxTextLength),
              seriesDescription: "나".repeat(CATALOG_LIMITS.maxTextLength),
              studyId: "S".repeat(CATALOG_LIMITS.maxShortTextLength),
              accessionNumber: "A".repeat(CATALOG_LIMITS.maxShortTextLength),
              seriesNumber: s,
            },
            DIGEST(s * 10_000 + i),
          ),
        ),
      ).flat();
      const chunks = projectCatalogStudy(longUid("8.", 0), records);
      const sent = new Set<string>();
      for (const chunk of chunks) {
        const body = JSON.stringify(request(chunk));
        expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(
          CATALOG_LIMITS.maxBodyBytes,
        );
        expect(parseCatalogSyncRequest(JSON.parse(body))).toMatchObject({
          ok: true,
        });
        for (const series of chunk.series)
          for (const instance of series.instances) {
            expect(sent.has(instance.sopInstanceUid)).toBe(false);
            sent.add(instance.sopInstanceUid);
          }
      }
      expect(sent.size).toBe(records.length);
    },
  );
});

function request(study: unknown = validStudy(), extra: object = {}) {
  return { expectedUserId: USER, study, ...extra };
}

function validStudy() {
  return {
    studyInstanceUid: "2.25.1",
    studyDate: "20260101",
    studyDescription: "Synthetic study",
    studyId: "S1",
    accessionNumber: "SYN-ACC",
    series: [
      {
        seriesInstanceUid: "2.25.10",
        modality: "CT",
        seriesNumber: 2,
        seriesDescription: "Axial",
        instances: [{ sopInstanceUid: "2.25.101", contentDigest: DIGEST(1) }],
      },
    ],
  };
}

type Study = ReturnType<typeof validStudy>;
function withStudy(mutate: (study: Study) => void) {
  const study = validStudy();
  mutate(study);
  return request(study);
}

describe("parseCatalogSyncRequest: 서버 입력을 엄격히 검증한다", () => {
  it("올바른 요청과 선택 값을 생략한 최소 요청을 받는다", () => {
    expect(parseCatalogSyncRequest(request())).toEqual({
      ok: true,
      value: request(),
    });
    const minimal = request({
      studyInstanceUid: "2.25.1",
      series: [
        {
          seriesInstanceUid: "2.25.10",
          instances: [{ sopInstanceUid: "2.25.101", contentDigest: DIGEST(1) }],
        },
      ],
    });
    expect(parseCatalogSyncRequest(minimal)).toEqual({
      ok: true,
      value: minimal,
    });
  });

  it.each([
    ["최상위", request(validStudy(), { ownerId: USER })],
    ["검사", withStudy((s) => Object.assign(s, { patientId: "SYN-0001" }))],
    [
      "시리즈",
      withStudy((s) => Object.assign(s.series[0]!, { pixelSpacing: [1, 1] })),
    ],
    [
      "영상",
      withStudy((s) =>
        Object.assign(s.series[0]!.instances[0]!, { pixelData: "AAAA" }),
      ),
    ],
  ])("알 수 없는 필드(%s)는 거부한다", (_level, input) => {
    expect(parseCatalogSyncRequest(input)).toMatchObject({
      ok: false,
      problem: "unknown-key",
    });
  });

  it.each([
    ["요청이 객체가 아님", "text", "type"],
    ["배열", [], "type"],
    ["expectedUserId 누락", { study: validStudy() }, "required"],
    [
      "expectedUserId 가 UUID 아님",
      { ...request(), expectedUserId: "a" },
      "format",
    ],
    [
      "검사 UID 형식",
      withStudy((s) => (s.studyInstanceUid = "2.25.x")),
      "format",
    ],
    [
      "검사 UID 길이",
      withStudy((s) => (s.studyInstanceUid = `2.${"1".repeat(63)}`)),
      "length",
    ],
    [
      "검사 날짜 형식",
      withStudy((s) => (s.studyDate = "2026-01-01")),
      "format",
    ],
    [
      "설명 길이 상한",
      withStudy(
        (s) =>
          (s.studyDescription = "x".repeat(CATALOG_LIMITS.maxTextLength + 1)),
      ),
      "length",
    ],
    [
      "제어 문자",
      withStudy((s) => (s.studyDescription = "line\u0000break")),
      "format",
    ],
    [
      "문자열 대신 객체",
      withStudy((s) => Object.assign(s, { accessionNumber: { value: "SYN" } })),
      "type",
    ],
    [
      "modality 형식",
      withStudy((s) => (s.series[0]!.modality = "ct; drop")),
      "format",
    ],
    [
      "시리즈 번호가 정수가 아님",
      withStudy((s) => (s.series[0]!.seriesNumber = 1.5)),
      "type",
    ],
    [
      "시리즈 번호 범위",
      withStudy((s) => (s.series[0]!.seriesNumber = 2 ** 31)),
      "range",
    ],
    [
      "digest 형식(대문자·길이)",
      withStudy(
        (s) => (s.series[0]!.instances[0]!.contentDigest = "ABC".repeat(10)),
      ),
      "format",
    ],
    ["시리즈 없음", withStudy((s) => (s.series = [])), "count"],
    [
      "영상 없는 시리즈",
      withStudy((s) => (s.series[0]!.instances = [])),
      "count",
    ],
    [
      "영상 수 상한",
      withStudy(
        (s) =>
          (s.series[0]!.instances = Array.from(
            { length: CATALOG_LIMITS.maxInstancesPerRequest + 1 },
            (_, i) => ({
              sopInstanceUid: `2.25.${i + 1}`,
              contentDigest: DIGEST(i),
            }),
          )),
      ),
      "count",
    ],
    [
      "시리즈 수 상한",
      withStudy(
        (s) =>
          (s.series = Array.from(
            { length: CATALOG_LIMITS.maxSeriesPerRequest + 1 },
            (_, i) => ({
              seriesInstanceUid: `2.25.7${i}`,
              instances: [
                { sopInstanceUid: `2.25.8${i}`, contentDigest: DIGEST(i) },
              ],
            }),
          ) as Study["series"]),
      ),
      "count",
    ],
    [
      "같은 시리즈 UID 중복",
      withStudy((s) => s.series.push(structuredClone(s.series[0]!))),
      "duplicate",
    ],
    [
      "같은 SOP UID 중복(다른 시리즈에 있어도)",
      withStudy((s) =>
        s.series.push({
          ...structuredClone(s.series[0]!),
          seriesInstanceUid: "2.25.20",
        }),
      ),
      "duplicate",
    ],
  ])("%s → 거부", (_name, input, problem) => {
    expect(parseCatalogSyncRequest(input)).toMatchObject({
      ok: false,
      problem,
    });
  });

  it("검증한 값은 입력 객체와 분리된 새 객체다(이후 입력 변경이 반영되지 않음)", () => {
    const input = request();
    const parsed = parseCatalogSyncRequest(input);
    if (!parsed.ok) throw new Error("통과해야 한다");
    (input.study as Study).series[0]!.instances[0]!.contentDigest = "changed";
    expect(parsed.value.study.series[0]!.instances[0]!.contentDigest).toBe(
      DIGEST(1),
    );
  });
});
