import type {
  CatalogSyncOutcome,
  CatalogSyncRequest,
} from "@/entities/dicom-study";

export const CATALOG_SYNC_ENDPOINT = "/api/catalog/sync";

const UNAVAILABLE: CatalogSyncOutcome = { status: "unavailable" };

/**
 * 동기화 Route Handler 호출. 같은 출처 쿠키로만 보내고 캐시·리다이렉트를 따르지 않는다.
 * 알 수 없는 응답(로그인 화면 HTML·형식이 다른 JSON)은 성공으로 보지 않는다. 네트워크 오류는 그대로 던진다.
 */
export async function postCatalogStudy(
  request: CatalogSyncRequest,
  fetcher: typeof fetch = fetch,
): Promise<CatalogSyncOutcome> {
  const response = await fetcher(CATALOG_SYNC_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
  });
  if (response.status === 413) return { status: "invalid" };
  if (!response.headers.get("content-type")?.includes("application/json"))
    return UNAVAILABLE;
  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return UNAVAILABLE;
  }
  switch (body?.status) {
    case "synced":
      return response.ok &&
        typeof body.seriesCount === "number" &&
        typeof body.instanceCount === "number"
        ? {
            status: "synced",
            seriesCount: body.seriesCount,
            instanceCount: body.instanceCount,
          }
        : UNAVAILABLE;
    case "conflict":
      return body.kind === "series" || body.kind === "instance"
        ? { status: "conflict", kind: body.kind }
        : UNAVAILABLE;
    case "account-mismatch":
    case "unauthenticated":
    case "invalid":
    case "unavailable":
      return { status: body.status };
    default:
      return UNAVAILABLE;
  }
}
