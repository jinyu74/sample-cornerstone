import { type NextRequest, NextResponse } from "next/server";

import {
  CATALOG_LIMITS,
  parseCatalogSyncRequest,
  syncCatalogStudy,
} from "@/entities/dicom-study/server";
import { NO_STORE } from "@/shared/api/supabase/proxy";
import { isSameOriginRequest } from "@/shared/auth/same-origin";
import { BodyTooLargeError, readLimitedText } from "@/shared/lib/http";

const STATUS = {
  synced: 200,
  invalid: 400,
  unauthenticated: 401,
  "account-mismatch": 409,
  conflict: 409,
  unavailable: 503,
} as const;

/**
 * 검사 목록용 메타데이터 동기화. 원본 파일·픽셀은 받지 않는다(본문 상한·엄격 검증).
 * 다른 사이트 요청(CSRF)·JSON 이 아닌 요청은 거부하고, 모든 응답을 캐시하지 않는다.
 */
export async function POST(request: NextRequest) {
  const sameOrigin = isSameOriginRequest({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    protocol: request.nextUrl.protocol,
    secFetchSite: request.headers.get("sec-fetch-site"),
  });
  if (!sameOrigin) return json({ status: "forbidden" }, 403);
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type))
    return json({ status: "unsupported-media-type" }, 415);

  let text: string;
  try {
    text = await readLimitedText(request, CATALOG_LIMITS.maxBodyBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return json({ status: "too-large" }, 413);
    return json({ status: "invalid" }, 400);
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return json({ status: "invalid" }, 400);
  }
  const parsed = parseCatalogSyncRequest(input);
  if (!parsed.ok)
    return json(
      { status: "invalid", path: parsed.path, problem: parsed.problem },
      400,
    );

  const outcome = await syncCatalogStudy(parsed.value);
  return json(outcome, STATUS[outcome.status]);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": NO_STORE },
  });
}
