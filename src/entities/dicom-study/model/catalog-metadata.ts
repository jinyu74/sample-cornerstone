import type { StoredInstanceRecord } from "../api/types";

import { compareUid } from "./compare-uid";

/**
 * 서버 목록 동기화 요청 상한. DB(CHECK·RPC)도 같은 값을 다시 확인한다.
 * 길이 상한을 모두 채운 값으로도 영상 1000개·시리즈 200개 청크가 본문 상한 안에 들어간다.
 */
export const CATALOG_LIMITS = {
  maxInstancesPerRequest: 1000,
  maxSeriesPerRequest: 200,
  maxBodyBytes: 512 * 1024,
  maxUidLength: 64,
  maxTextLength: 256,
  maxShortTextLength: 64,
  maxModalityLength: 16,
} as const;

export interface CatalogInstancePayload {
  sopInstanceUid: string;
  contentDigest: string;
}

export interface CatalogSeriesPayload {
  seriesInstanceUid: string;
  modality?: string;
  seriesNumber?: number;
  seriesDescription?: string;
  instances: CatalogInstancePayload[];
}

/**
 * 서버로 보내는 검사 메타데이터(명시적 allowlist).
 * 환자 ID·이름 등 인구통계, 영상 기하·픽셀, 원본 바이트·크기, 전체 헤더는 보내지 않는다.
 */
export interface CatalogStudyPayload {
  studyInstanceUid: string;
  studyDate?: string;
  studyDescription?: string;
  studyId?: string;
  accessionNumber?: string;
  series: CatalogSeriesPayload[];
}

export interface CatalogSyncRequest {
  /** 이 요청을 만든 화면의 계정. 권한 근거가 아니라 계정이 바뀐 뒤 도착한 요청을 거부하는 데 쓴다 */
  expectedUserId: string;
  study: CatalogStudyPayload;
}

export type CatalogPayloadProblem =
  | "type"
  | "required"
  | "unknown-key"
  | "format"
  | "length"
  | "range"
  | "count"
  | "duplicate";

export type CatalogSyncRequestParse =
  | { ok: true; value: CatalogSyncRequest }
  | { ok: false; path: string; problem: CatalogPayloadProblem };

type SeriesHeader = Omit<CatalogSeriesPayload, "instances">;

/**
 * 한 검사의 저장 레코드를 전송 청크로 투영한다. 결과는 입력 순서와 무관하다(UID 순).
 * 각 청크는 영상 maxInstances 개·시리즈 maxSeries 개 이하이며, 모든 청크에 검사 정보를 담는다.
 * 검사·시리즈 속성은 SOP UID 가 가장 작은 영상 값을 쓴다(groupStudies 와 같은 규칙).
 */
export function projectCatalogStudy(
  studyInstanceUid: string,
  records: readonly StoredInstanceRecord[],
  {
    maxInstances = CATALOG_LIMITS.maxInstancesPerRequest,
    maxSeries = CATALOG_LIMITS.maxSeriesPerRequest,
  }: { maxInstances?: number; maxSeries?: number } = {},
): CatalogStudyPayload[] {
  const own = records
    .filter((record) => record.studyInstanceUid === studyInstanceUid)
    .sort((a, b) => compareUid(a.sopInstanceUid, b.sopInstanceUid));
  if (own.length === 0) return [];

  const first = own[0]!.metadata;
  const header = compact({
    studyInstanceUid,
    studyDate: first.studyDate,
    studyDescription: first.studyDescription,
    studyId: first.studyId,
    accessionNumber: first.accessionNumber,
  });

  const bySeries = new Map<
    string,
    { header: SeriesHeader; instances: CatalogInstancePayload[] }
  >();
  for (const record of own) {
    let entry = bySeries.get(record.seriesInstanceUid);
    if (!entry) {
      const meta = record.metadata;
      entry = {
        header: compact({
          seriesInstanceUid: record.seriesInstanceUid,
          modality: meta.modality,
          seriesNumber: meta.seriesNumber,
          seriesDescription: meta.seriesDescription,
        }),
        instances: [],
      };
      bySeries.set(record.seriesInstanceUid, entry);
    }
    entry.instances.push({
      sopInstanceUid: record.sopInstanceUid,
      contentDigest: record.contentDigest,
    });
  }

  const chunks: CatalogStudyPayload[] = [];
  let current: CatalogSeriesPayload[] = [];
  let count = 0;
  const flush = () => {
    if (current.length > 0) chunks.push({ ...header, series: current });
    current = [];
    count = 0;
  };
  const ordered = [...bySeries.values()].sort((a, b) =>
    compareUid(a.header.seriesInstanceUid, b.header.seriesInstanceUid),
  );
  for (const { header: seriesHeader, instances } of ordered) {
    for (let start = 0; start < instances.length;) {
      if (count === maxInstances || current.length === maxSeries) flush();
      const take = Math.min(maxInstances - count, instances.length - start);
      current.push({
        ...seriesHeader,
        instances: instances.slice(start, start + take),
      });
      count += take;
      start += take;
    }
  }
  flush();
  return chunks;
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== undefined && item !== "",
    ),
  ) as T;
}

// ---- 서버 입력 검증 ----

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UID = /^[0-9]+(\.[0-9]+)*$/;
const DIGEST = /^[0-9a-f]{64}$/;
const DICOM_DATE = /^[0-9]{8}$/;
const MODALITY = /^[A-Z0-9_]+$/;
const INT32_MAX = 2 ** 31 - 1;

class Invalid extends Error {
  constructor(
    readonly path: string,
    readonly problem: CatalogPayloadProblem,
  ) {
    super(`${path}: ${problem}`);
  }
}

type Json = Record<string, unknown>;

function object(
  value: unknown,
  path: string,
  allowed: readonly string[],
): Json {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Invalid(path, "type");
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw new Invalid(`${path}.${key}`, "unknown-key");
  return value as Json;
}

function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) throw new Invalid(path, "type");
  if (value.length === 0 || value.length > max)
    throw new Invalid(path, "count");
  return value;
}

function text(
  value: unknown,
  path: string,
  {
    max,
    pattern,
    required = false,
  }: { max: number; pattern?: RegExp; required?: boolean },
): string | undefined {
  if (value === undefined) {
    if (required) throw new Invalid(path, "required");
    return undefined;
  }
  if (typeof value !== "string") throw new Invalid(path, "type");
  if (value.length === 0 || value.length > max)
    throw new Invalid(path, "length");
  if (hasControl(value)) throw new Invalid(path, "format");
  if (pattern && !pattern.test(value)) throw new Invalid(path, "format");
  return value;
}

function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function integer(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new Invalid(path, "type");
  if (value < -INT32_MAX || value > INT32_MAX) throw new Invalid(path, "range");
  return value;
}

const uid = (value: unknown, path: string, required = true) => {
  if (typeof value === "string" && value.length > CATALOG_LIMITS.maxUidLength)
    throw new Invalid(path, "length");
  return text(value, path, {
    max: CATALOG_LIMITS.maxUidLength,
    pattern: UID,
    required,
  });
};

/**
 * 동기화 요청 본문(JSON)을 엄격히 검증한다. 알 수 없는 키·타입 오류·길이/개수 초과·중복 UID 를 거부하고
 * 허용한 키만 담은 새 객체를 돌려준다(입력 객체를 그대로 쓰지 않는다).
 */
export function parseCatalogSyncRequest(
  input: unknown,
): CatalogSyncRequestParse {
  try {
    return { ok: true, value: parseRequest(input) };
  } catch (error) {
    if (error instanceof Invalid)
      return { ok: false, path: error.path, problem: error.problem };
    throw error;
  }
}

function parseRequest(input: unknown): CatalogSyncRequest {
  const root = object(input, "$", ["expectedUserId", "study"]);
  const expectedUserId = text(root.expectedUserId, "$.expectedUserId", {
    max: 36,
    pattern: UUID,
    required: true,
  })!;
  if (root.study === undefined) throw new Invalid("$.study", "required");
  const raw = object(root.study, "$.study", [
    "studyInstanceUid",
    "studyDate",
    "studyDescription",
    "studyId",
    "accessionNumber",
    "series",
  ]);
  const short = { max: CATALOG_LIMITS.maxShortTextLength };
  const study: CatalogStudyPayload = compact({
    studyInstanceUid: uid(raw.studyInstanceUid, "$.study.studyInstanceUid")!,
    studyDate: text(raw.studyDate, "$.study.studyDate", {
      max: CATALOG_LIMITS.maxShortTextLength,
      pattern: DICOM_DATE,
    }),
    studyDescription: text(raw.studyDescription, "$.study.studyDescription", {
      max: CATALOG_LIMITS.maxTextLength,
    }),
    studyId: text(raw.studyId, "$.study.studyId", short),
    accessionNumber: text(
      raw.accessionNumber,
      "$.study.accessionNumber",
      short,
    ),
    series: [],
  });

  const seriesSeen = new Set<string>();
  const sopSeen = new Set<string>();
  let instanceTotal = 0;
  const rawSeries = array(
    raw.series,
    "$.study.series",
    CATALOG_LIMITS.maxSeriesPerRequest,
  );
  rawSeries.forEach((item, s) => {
    const path = `$.study.series[${s}]`;
    const series = object(item, path, [
      "seriesInstanceUid",
      "modality",
      "seriesNumber",
      "seriesDescription",
      "instances",
    ]);
    const seriesInstanceUid = uid(
      series.seriesInstanceUid,
      `${path}.seriesInstanceUid`,
    )!;
    if (seriesSeen.has(seriesInstanceUid))
      throw new Invalid(`${path}.seriesInstanceUid`, "duplicate");
    seriesSeen.add(seriesInstanceUid);
    const instances = array(
      series.instances,
      `${path}.instances`,
      CATALOG_LIMITS.maxInstancesPerRequest,
    ).map((value, i) => {
      const instancePath = `${path}.instances[${i}]`;
      const instance = object(value, instancePath, [
        "sopInstanceUid",
        "contentDigest",
      ]);
      const sopInstanceUid = uid(
        instance.sopInstanceUid,
        `${instancePath}.sopInstanceUid`,
      )!;
      if (sopSeen.has(sopInstanceUid))
        throw new Invalid(`${instancePath}.sopInstanceUid`, "duplicate");
      sopSeen.add(sopInstanceUid);
      return {
        sopInstanceUid,
        contentDigest: text(
          instance.contentDigest,
          `${instancePath}.contentDigest`,
          {
            max: 64,
            pattern: DIGEST,
            required: true,
          },
        )!,
      };
    });
    instanceTotal += instances.length;
    if (instanceTotal > CATALOG_LIMITS.maxInstancesPerRequest)
      throw new Invalid(`${path}.instances`, "count");
    study.series.push(
      compact({
        seriesInstanceUid,
        modality: text(series.modality, `${path}.modality`, {
          max: CATALOG_LIMITS.maxModalityLength,
          pattern: MODALITY,
        }),
        seriesNumber: integer(series.seriesNumber, `${path}.seriesNumber`),
        seriesDescription: text(
          series.seriesDescription,
          `${path}.seriesDescription`,
          { max: CATALOG_LIMITS.maxTextLength },
        ),
        instances,
      }),
    );
  });
  return { expectedUserId, study };
}
