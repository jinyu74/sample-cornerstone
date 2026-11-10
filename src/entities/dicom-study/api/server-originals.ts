import "server-only";

import { createServerSupabase } from "@/shared/api/supabase/server";
import { AuthServiceError, getCurrentUser } from "@/shared/auth/server";
import { SupabaseConfigError } from "@/shared/config/supabase-env";
import {
  OriginalsConfigError,
  type OriginalsConfig,
  readOriginalsEnv,
} from "@/shared/config/originals-env";

import { projectCatalogStudy } from "../model/catalog-metadata";

import { createBoundedInflater } from "./bounded-inflater";
import { submitCatalogStudy } from "./catalog-repository";
import {
  OriginalStoreError,
  openOriginalStore,
  type OriginalStore,
} from "./original-store";
import { parseDicomFile } from "./parse-dicom-file";
import type { StoredInstanceRecord } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UID = /^[0-9]+(\.[0-9]+)*$/;

export type OriginalFailure =
  | "unauthenticated"
  | "account-mismatch"
  | "bad-request"
  | "unconfigured"
  | "busy"
  | "too-large"
  | "inflated-too-large"
  | "aborted"
  | "invalid-dicom"
  | "sop-mismatch"
  | "conflict"
  | "not-found"
  | "storage-full"
  | "storage-corrupt"
  | "storage-unavailable"
  | "unavailable";

export type StoreOriginalOutcome =
  | {
      status: "stored" | "already-stored";
      studyInstanceUid: string;
      sopInstanceUid: string;
    }
  | { status: OriginalFailure };

export type ReadOriginalOutcome =
  | {
      status: "ok";
      stream: ReadableStream<Uint8Array>;
      size: number;
      digest: string;
    }
  | { status: OriginalFailure };

/** 프로세스 전역 업로드 동시 처리 수(메모리 상한 관리) */
let activeUploads = 0;

type Authorized =
  | {
      ok: true;
      userId: string;
      client: Awaited<ReturnType<typeof createServerSupabase>>;
    }
  | { ok: false; status: OriginalFailure };

/**
 * 권한 근거는 Auth 서버가 확인한 현재 계정뿐이다. 기대 계정(요청을 만든 화면의 계정)은 경합 거부용이며,
 * 설정·동시성·파일 시스템보다 먼저 확인한다.
 */
async function authorize(expectedUserId: string | null): Promise<Authorized> {
  if (!expectedUserId || !UUID.test(expectedUserId))
    return { ok: false, status: "bad-request" };
  // 이 경로는 Proxy 를 거치지 않으므로 인증 설정 오류도 여기서 fail-closed(503)로 처리한다.
  // 그 밖의 오류(Next 동적 렌더 신호 등)는 삼키지 않는다.
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, status: "unauthenticated" };
    if (user.id !== expectedUserId)
      return { ok: false, status: "account-mismatch" };
    return { ok: true, userId: user.id, client: await createServerSupabase() };
  } catch (error) {
    if (authUnavailable(error)) return { ok: false, status: "unavailable" };
    throw error;
  }
}

/** 인증 서비스 장애·인증 설정 오류(성공으로 보지 않고 503) */
function authUnavailable(error: unknown) {
  return (
    error instanceof AuthServiceError || error instanceof SupabaseConfigError
  );
}

function readConfig(): OriginalsConfig | "unconfigured" | "invalid" {
  try {
    return readOriginalsEnv() ?? "unconfigured";
  } catch (error) {
    if (error instanceof OriginalsConfigError) return "invalid";
    throw error;
  }
}

async function openStore(
  config: OriginalsConfig,
): Promise<OriginalStore | null> {
  try {
    return await openOriginalStore(config, { projectRoot: process.cwd() });
  } catch (error) {
    if (error instanceof OriginalStoreError) return null;
    throw error;
  }
}

function storeFailure(error: unknown): OriginalFailure {
  if (!(error instanceof OriginalStoreError)) throw error;
  switch (error.code) {
    case "too-large":
      return "too-large";
    case "aborted":
      return "aborted";
    case "conflict":
      return "conflict";
    case "storage-full":
      return "storage-full";
    case "corrupt":
      return "storage-corrupt";
    case "invalid":
      return "bad-request";
    default:
      return "storage-unavailable";
  }
}

/**
 * 원본 1개 보관: 인증·기대 계정 → 설정 → 동시성 → 스트림 수신(상한) → 서버 파싱(deflate 상한) →
 * 주소 SOP = 파일 SOP → 서버가 만든 메타데이터로 카탈로그 반영(RLS·충돌 검사) → 원자적 공개.
 * 카탈로그 충돌(같은 SOP 의 다른 내용)은 다른 요청·프로세스와의 경합도 DB 고유 키로 막으며, 이때 파일을 공개하지 않는다.
 */
export async function storeOriginal({
  sopInstanceUid,
  expectedUserId,
  body,
}: {
  sopInstanceUid: string;
  expectedUserId: string | null;
  body: ReadableStream<Uint8Array> | null;
}): Promise<StoreOriginalOutcome> {
  const auth = await authorize(expectedUserId);
  if (!auth.ok) return { status: auth.status };
  if (sopInstanceUid.length > 64 || !UID.test(sopInstanceUid) || !body)
    return { status: "bad-request" };
  const config = readConfig();
  if (config === "unconfigured") return { status: "unconfigured" };
  if (config === "invalid") return { status: "storage-unavailable" };
  if (activeUploads >= config.uploadConcurrency) return { status: "busy" };
  activeUploads += 1;
  try {
    const store = await openStore(config);
    if (!store) return { status: "storage-unavailable" };
    let received;
    try {
      received = await store.receive(auth.userId, body);
    } catch (error) {
      return { status: storeFailure(error) };
    }
    try {
      const parsed = parseDicomFile(received.bytes, {
        inflater: createBoundedInflater(config.maxFileBytes),
      });
      if (!parsed.ok)
        return {
          status:
            parsed.reason === "inflated-too-large"
              ? "inflated-too-large"
              : "invalid-dicom",
        };
      const metadata = parsed.metadata;
      if (metadata.sopInstanceUid !== sopInstanceUid)
        return { status: "sop-mismatch" };

      const record: StoredInstanceRecord = {
        sopInstanceUid: metadata.sopInstanceUid,
        studyInstanceUid: metadata.studyInstanceUid,
        seriesInstanceUid: metadata.seriesInstanceUid,
        contentDigest: received.digest,
        byteLength: received.size,
        importedAt: new Date().toISOString(),
        metadata,
      };
      const [study] = projectCatalogStudy(metadata.studyInstanceUid, [record]);
      if (!study) return { status: "invalid-dicom" };
      const synced = await submitCatalogStudy(auth.client, {
        expectedUserId: auth.userId,
        study,
      });
      if (synced.status === "conflict") return { status: "conflict" };
      if (synced.status === "account-mismatch")
        return { status: "account-mismatch" };
      if (synced.status === "unauthenticated")
        return { status: "unauthenticated" };
      if (synced.status === "invalid") return { status: "invalid-dicom" };
      if (synced.status !== "synced") return { status: "unavailable" };

      let published;
      try {
        published = await store.publish(auth.userId, received, sopInstanceUid);
      } catch (error) {
        return { status: storeFailure(error) };
      }
      return {
        status: published,
        studyInstanceUid: metadata.studyInstanceUid,
        sopInstanceUid,
      };
    } finally {
      await store.discard(received);
    }
  } finally {
    activeUploads -= 1;
  }
}

/**
 * 소유자 원본 1개 읽기. 카탈로그(RLS)에 없거나 실제 파일이 없으면 not-found(다른 계정 UID 추측과 구별하지 않는다).
 * 스트림은 읽는 동안 digest 를 다시 확인하며 손상되면 오류로 끝난다.
 */
export async function readOriginal({
  sopInstanceUid,
  expectedUserId,
}: {
  sopInstanceUid: string;
  expectedUserId: string | null;
}): Promise<ReadOriginalOutcome> {
  const auth = await authorize(expectedUserId);
  if (!auth.ok) return { status: auth.status };
  if (sopInstanceUid.length > 64 || !UID.test(sopInstanceUid))
    return { status: "bad-request" };
  const config = readConfig();
  if (config === "unconfigured") return { status: "unconfigured" };
  if (config === "invalid") return { status: "storage-unavailable" };

  const { data, error } = await auth.client
    .from("catalog_instances")
    .select("content_digest")
    .eq("owner_id", auth.userId)
    .eq("sop_instance_uid", sopInstanceUid)
    .maybeSingle();
  if (error) return { status: "unavailable" };
  const digest = (data as { content_digest?: string } | null)?.content_digest;
  if (!digest) return { status: "not-found" };

  const store = await openStore(config);
  if (!store) return { status: "storage-unavailable" };
  let found;
  try {
    found = await store.open(auth.userId, sopInstanceUid, digest);
  } catch (error) {
    return { status: storeFailure(error) };
  }
  if (!found) return { status: "not-found" };
  return { status: "ok", stream: found.stream, size: found.size, digest };
}

/**
 * 현재 요청 계정의 서버 보관 원본(SOP UID → digest). owner 는 인자로 받지 않고 Auth 서버가 확인한 계정만 쓴다.
 * 실제 파일로만 판정하며, 설정이 없으면 unconfigured, 저장소 오류는 unavailable(보관됨으로 추정하지 않는다).
 */
export async function listStoredOriginals(): Promise<
  | { status: "ready"; stored: Map<string, string> }
  | { status: "unauthenticated" | "unconfigured" | "unavailable" }
> {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (authUnavailable(error)) return { status: "unavailable" };
    throw error;
  }
  if (!user) return { status: "unauthenticated" };
  const config = readConfig();
  if (config === "unconfigured") return { status: "unconfigured" };
  if (config === "invalid") return { status: "unavailable" };
  const store = await openStore(config);
  if (!store) return { status: "unavailable" };
  try {
    return { status: "ready", stored: await store.list(user.id) };
  } catch (error) {
    if (error instanceof OriginalStoreError) return { status: "unavailable" };
    throw error;
  }
}
