import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CatalogInstancePayload,
  CatalogSyncRequest,
} from "../model/catalog-metadata";
import type { CatalogStudySummary } from "../model/catalog-summary";

/** 서버 목록을 읽지 못함(인증 서비스·DB 오류). 빈 목록으로 숨기지 않는다 */
export class CatalogUnavailableError extends Error {
  override name = "CatalogUnavailableError";
}

/** PostgREST 기본 max_rows 와 같다. 서버 상한이 더 작아도 keyset 이라 잘리지 않는다 */
const DEFAULT_PAGE_SIZE = 1000;
/** 키가 늘지 않는 응답 등으로 끝없이 반복하지 않도록 둔 안전 상한 */
const MAX_PAGES = 10_000;

interface SummaryRow {
  study_instance_uid: string;
  study_date: string | null;
  study_description: string | null;
  study_id: string | null;
  accession_number: string | null;
  modalities: string[] | null;
  series_count: number;
  instance_count: number;
}

interface SeriesRow {
  study_instance_uid: string;
  series_instance_uid: string;
}

interface InstanceRow {
  study_instance_uid: string;
  sop_instance_uid: string;
  content_digest: string;
}

/**
 * 고유 키 오름차순 keyset 페이지로 모두 읽는다. 다음 페이지는 DB 정렬 기준으로 "마지막 키보다 큰 것"이라
 * 서버 행 상한이 페이지 크기보다 작아도 잘리지 않고, 빈 페이지에서 끝난다.
 * 같은 키가 다시 오면(진행하지 않는 응답) 끝없이 반복하지 않고 오류로 멈춘다.
 */
async function readAll<T>(
  key: (row: T) => string,
  fetchPage: (after: string | null) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchPage(after);
    if (batch.length === 0) return rows;
    for (const row of batch) {
      const current = key(row);
      if (seen.has(current))
        throw new CatalogUnavailableError(
          "서버 목록 페이지가 같은 항목을 다시 돌려줬습니다",
        );
      seen.add(current);
      rows.push(row);
    }
    after = key(batch.at(-1)!);
  }
  throw new CatalogUnavailableError("서버 목록 페이지가 너무 많습니다");
}

function fail(message: string, cause: unknown): never {
  throw new CatalogUnavailableError(message, { cause });
}

/**
 * 계정의 서버 목록(검사 요약 + 원본 비교용 SOP UID·digest)을 읽는다.
 * RLS 가 다른 계정 행을 막고, owner 조건을 함께 걸어 의도를 분명히 한다.
 */
export async function readCatalogSummaries(
  client: SupabaseClient,
  ownerId: string,
  { pageSize = DEFAULT_PAGE_SIZE }: { pageSize?: number } = {},
): Promise<CatalogStudySummary[]> {
  const summaries = await readAll<SummaryRow>(
    (row) => row.study_instance_uid,
    async (after) => {
      let query = client
        .from("catalog_study_summaries")
        .select(
          "study_instance_uid, study_date, study_description, study_id, accession_number, modalities, series_count, instance_count",
        )
        .eq("owner_id", ownerId)
        .order("study_instance_uid", { ascending: true })
        .limit(pageSize);
      if (after !== null) query = query.gt("study_instance_uid", after);
      const { data, error } = await query;
      if (error) fail("서버 검사 목록을 읽지 못했습니다", error);
      return data as SummaryRow[];
    },
  );

  const series = await readAll<SeriesRow>(
    (row) => row.series_instance_uid,
    async (after) => {
      let query = client
        .from("catalog_series")
        .select("study_instance_uid, series_instance_uid")
        .eq("owner_id", ownerId)
        .order("series_instance_uid", { ascending: true })
        .limit(pageSize);
      if (after !== null) query = query.gt("series_instance_uid", after);
      const { data, error } = await query;
      if (error) fail("서버 시리즈 목록을 읽지 못했습니다", error);
      return data as SeriesRow[];
    },
  );
  const seriesByStudy = new Map<string, string[]>();
  for (const row of series) {
    const list = seriesByStudy.get(row.study_instance_uid) ?? [];
    list.push(row.series_instance_uid);
    seriesByStudy.set(row.study_instance_uid, list);
  }

  const instances = await readAll<InstanceRow>(
    (row) => row.sop_instance_uid,
    async (after) => {
      let query = client
        .from("catalog_instances")
        .select("study_instance_uid, sop_instance_uid, content_digest")
        .eq("owner_id", ownerId)
        .order("sop_instance_uid", { ascending: true })
        .limit(pageSize);
      if (after !== null) query = query.gt("sop_instance_uid", after);
      const { data, error } = await query;
      if (error) fail("서버 영상 목록을 읽지 못했습니다", error);
      return data as InstanceRow[];
    },
  );

  const byStudy = new Map<string, CatalogInstancePayload[]>();
  for (const row of instances) {
    const list = byStudy.get(row.study_instance_uid) ?? [];
    list.push({
      sopInstanceUid: row.sop_instance_uid,
      contentDigest: row.content_digest,
    });
    byStudy.set(row.study_instance_uid, list);
  }

  return summaries.map((row) => {
    const summary: CatalogStudySummary = {
      studyInstanceUid: row.study_instance_uid,
      modalities: row.modalities ?? [],
      seriesCount: row.series_count,
      seriesInstanceUids: seriesByStudy.get(row.study_instance_uid) ?? [],
      instanceCount: row.instance_count,
      instances: byStudy.get(row.study_instance_uid) ?? [],
    };
    if (row.study_date) summary.studyDate = row.study_date;
    if (row.study_description) summary.studyDescription = row.study_description;
    if (row.study_id) summary.studyId = row.study_id;
    if (row.accession_number) summary.accessionNumber = row.accession_number;
    return summary;
  });
}

export type CatalogSyncOutcome =
  | { status: "synced"; seriesCount: number; instanceCount: number }
  | { status: "unauthenticated" }
  | { status: "account-mismatch" }
  | { status: "conflict"; kind: "series" | "instance" }
  | { status: "invalid" }
  | { status: "unavailable" };

/** 입력 형식·제약 위반(재시도해도 같은 결과) */
const INVALID_CODES = new Set(["22023", "23514", "23503", "22P02", "22001"]);

/**
 * 한 검사(청크)를 사용자 세션으로 원자적으로 반영한다(RLS·SECURITY INVOKER RPC).
 * 기대 계정은 DB 에서도 auth.uid() 와 다시 비교한다. 결과를 화면이 구분할 수 있게 분류한다.
 */
export async function submitCatalogStudy(
  client: SupabaseClient,
  request: CatalogSyncRequest,
): Promise<CatalogSyncOutcome> {
  const { data, error } = await client.rpc("sync_catalog_study", {
    p_expected_owner: request.expectedUserId,
    p_study: request.study,
  });
  if (!error) {
    const result = data as { seriesCount: number; instanceCount: number };
    return {
      status: "synced",
      seriesCount: result.seriesCount,
      instanceCount: result.instanceCount,
    };
  }
  if (error.message === "account-mismatch")
    return { status: "account-mismatch" };
  if (error.code === "42501") return { status: "unauthenticated" };
  if (error.message === "series-conflict")
    return { status: "conflict", kind: "series" };
  if (error.message === "instance-conflict")
    return { status: "conflict", kind: "instance" };
  if (INVALID_CODES.has(error.code)) return { status: "invalid" };
  return { status: "unavailable" };
}
