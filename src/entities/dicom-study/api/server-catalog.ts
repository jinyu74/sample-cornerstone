import "server-only";

import { createServerSupabase } from "@/shared/api/supabase/server";
import { AuthServiceError, getCurrentUser } from "@/shared/auth/server";

import type { CatalogSyncRequest } from "../model/catalog-metadata";
import type { CatalogListResult } from "../model/catalog-summary";
import { markStoredOriginals } from "../model/server-originals";

import {
  CatalogUnavailableError,
  type CatalogSyncOutcome,
  readCatalogSummaries,
  submitCatalogStudy,
} from "./catalog-repository";
import { listStoredOriginals } from "./server-originals";

/**
 * 현재 요청 계정의 서버 목록(최소 DTO). Auth 서버로 계정을 확인하고 요청별 서버 클라이언트(RLS)로 읽는다.
 * 서비스 비밀키를 쓰지 않는다. 서버 목록 장애는 빈 목록이 아니라 unavailable 로 알린다.
 */
export async function listCatalogStudies(): Promise<CatalogListResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: "unavailable" };
    const studies = await readCatalogSummaries(
      await createServerSupabase(),
      user.id,
    );
    // 서버 보관 여부는 실제 파일로만 판정한다(경로·헤더는 props 에 넣지 않고 영상별 stored 표시만)
    const originals = await listStoredOriginals();
    if (originals.status === "ready")
      return {
        status: "ready",
        studies: markStoredOriginals(studies, originals.stored),
        originals: "ready",
      };
    return {
      status: "ready",
      studies,
      originals:
        originals.status === "unconfigured" ? "unconfigured" : "unavailable",
    };
  } catch (error) {
    if (
      error instanceof CatalogUnavailableError ||
      error instanceof AuthServiceError
    )
      return { status: "unavailable" };
    throw error;
  }
}

/**
 * 검증된 동기화 요청을 현재 계정으로 반영한다. 권한 근거는 Auth 서버가 확인한 현재 계정뿐이며,
 * 요청의 기대 계정이 다르면(계정이 바뀐 뒤 도착한 이전 화면 요청) DB 에 닿기 전에 거부한다.
 */
export async function syncCatalogStudy(
  request: CatalogSyncRequest,
): Promise<CatalogSyncOutcome> {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof AuthServiceError) return { status: "unavailable" };
    throw error;
  }
  if (!user) return { status: "unauthenticated" };
  if (user.id !== request.expectedUserId) return { status: "account-mismatch" };
  return submitCatalogStudy(await createServerSupabase(), request);
}
