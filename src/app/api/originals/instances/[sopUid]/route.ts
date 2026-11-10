import { type NextRequest, NextResponse } from "next/server";

import {
  type OriginalFailure,
  readOriginal,
  storeOriginal,
} from "@/entities/dicom-study/server";
import { NO_STORE } from "@/shared/api/supabase/proxy";
import { isSameOriginRequest } from "@/shared/auth/same-origin";

type Context = { params: Promise<{ sopUid: string }> };

const EXPECTED_HEADER = "x-expected-user-id";

const HTTP_STATUS: Record<OriginalFailure, number> = {
  unauthenticated: 401,
  "account-mismatch": 409,
  "bad-request": 400,
  unconfigured: 503,
  busy: 429,
  "too-large": 413,
  "inflated-too-large": 413,
  aborted: 400,
  "invalid-dicom": 400,
  "sop-mismatch": 400,
  conflict: 409,
  "not-found": 404,
  "storage-full": 507,
  "storage-corrupt": 500,
  "storage-unavailable": 503,
  unavailable: 503,
};

/** 사용자별 원본 응답은 어떤 캐시에도 남기지 않고, 형식 추측을 막는다 */
const PRIVATE_HEADERS = {
  "Cache-Control": NO_STORE,
  "X-Content-Type-Options": "nosniff",
};

function sameOrigin(request: NextRequest) {
  return isSameOriginRequest({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    protocol: request.nextUrl.protocol,
    secFetchSite: request.headers.get("sec-fetch-site"),
  });
}

function json(body: Record<string, unknown>, status: number) {
  const headers: Record<string, string> = { ...PRIVATE_HEADERS };
  if (status === 429) headers["Retry-After"] = "5";
  return NextResponse.json(body, { status, headers });
}

/**
 * 원본 1개 보관(사용자가 검사별 "서버에 원본 보관"을 누를 때만 호출). 본문은 raw DICOM 하나.
 * Proxy matcher 에서 제외된 경로라 본문이 복제·버퍼링되지 않으며, 인증은 이 핸들러가 Auth 서버로 직접 한다.
 * 오류 응답에는 상태 코드만 담고 서버 경로·비밀값을 담지 않는다.
 */
export async function PUT(request: NextRequest, { params }: Context) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  if (
    !/^application\/dicom\s*(;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    return json({ status: "unsupported-media-type" }, 415);
  const { sopUid } = await params;
  const outcome = await storeOriginal({
    sopInstanceUid: sopUid,
    expectedUserId: request.headers.get(EXPECTED_HEADER),
    body: request.body,
  });
  if (outcome.status === "stored" || outcome.status === "already-stored")
    return json(outcome, 200);
  return json({ status: outcome.status }, HTTP_STATUS[outcome.status]);
}

/** 소유자 원본 1개 다운로드(같은 출처 fetch 만). 다른 계정·없는 원본은 구별 없이 404 */
export async function GET(request: NextRequest, { params }: Context) {
  if (!sameOrigin(request)) return json({ status: "forbidden" }, 403);
  const { sopUid } = await params;
  const outcome = await readOriginal({
    sopInstanceUid: sopUid,
    expectedUserId: request.headers.get(EXPECTED_HEADER),
  });
  if (outcome.status !== "ok")
    return json({ status: outcome.status }, HTTP_STATUS[outcome.status]);
  return new Response(outcome.stream, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/dicom",
      "Content-Length": String(outcome.size),
      "Content-Disposition": 'attachment; filename="original.dcm"',
      "X-Content-SHA256": outcome.digest,
    },
  });
}
