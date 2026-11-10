/** 서버 원본 API 실패 사유(클라이언트 표시용) */
export type OriginalTransferFailure =
  | "network"
  | "aborted"
  | "unauthenticated"
  | "account-mismatch"
  | "bad-request"
  | "unconfigured"
  | "busy"
  | "too-large"
  | "inflated-too-large"
  | "invalid-dicom"
  | "sop-mismatch"
  | "conflict"
  | "not-found"
  | "storage-full"
  | "storage-corrupt"
  | "storage-unavailable"
  | "unavailable";

const KNOWN = new Set<OriginalTransferFailure>([
  "unauthenticated",
  "account-mismatch",
  "bad-request",
  "unconfigured",
  "busy",
  "too-large",
  "inflated-too-large",
  "invalid-dicom",
  "sop-mismatch",
  "conflict",
  "not-found",
  "storage-full",
  "storage-corrupt",
  "storage-unavailable",
  "unavailable",
]);

export type PutOriginalResult =
  { status: "stored" | "already-stored" } | { status: OriginalTransferFailure };
export type GetOriginalResult =
  { status: "ok"; bytes: ArrayBuffer } | { status: OriginalTransferFailure };

export interface TransferOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

export const ORIGINALS_ENDPOINT = "/api/originals/instances";
export const originalUrl = (sop: string) =>
  `${ORIGINALS_ENDPOINT}/${encodeURIComponent(sop)}`;
const EXPECTED_HEADER = "x-expected-user-id";

function aborted(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function failureFrom(
  response: Response,
): Promise<OriginalTransferFailure> {
  if (!response.headers.get("content-type")?.includes("application/json"))
    return "unavailable";
  try {
    const body = (await response.json()) as { status?: unknown };
    return KNOWN.has(body.status as OriginalTransferFailure)
      ? (body.status as OriginalTransferFailure)
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * 원본 1개를 서버 비공개 폴더에 보관한다(사용자가 "서버에 원본 보관"을 눌렀을 때만).
 * 기대 계정은 계정이 바뀐 뒤 도착한 요청을 서버가 거부하게 하는 값이며 권한 근거가 아니다.
 * 알 수 없는 응답은 성공으로 보지 않는다.
 */
export async function putOriginal(
  sop: string,
  bytes: ArrayBuffer,
  expectedUserId: string,
  { signal, fetcher = fetch }: TransferOptions = {},
): Promise<PutOriginalResult> {
  let response: Response;
  try {
    response = await fetcher(originalUrl(sop), {
      method: "PUT",
      headers: {
        "content-type": "application/dicom",
        [EXPECTED_HEADER]: expectedUserId,
      },
      body: bytes,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch (error) {
    return { status: aborted(error) ? "aborted" : "network" };
  }
  if (
    response.ok &&
    response.headers.get("content-type")?.includes("application/json")
  ) {
    try {
      const body = (await response.json()) as { status?: unknown };
      if (body.status === "stored" || body.status === "already-stored")
        return { status: body.status };
    } catch {
      return { status: "unavailable" };
    }
    return { status: "unavailable" };
  }
  return { status: await failureFrom(response) };
}

/** 소유자 원본 1개를 받는다. DICOM 이 아닌 성공 응답·중간에 끊긴 본문은 실패다 */
export async function getOriginal(
  sop: string,
  expectedUserId: string,
  { signal, fetcher = fetch }: TransferOptions = {},
): Promise<GetOriginalResult> {
  let response: Response;
  try {
    response = await fetcher(originalUrl(sop), {
      method: "GET",
      headers: { [EXPECTED_HEADER]: expectedUserId },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch (error) {
    return { status: aborted(error) ? "aborted" : "network" };
  }
  if (!response.ok) return { status: await failureFrom(response) };
  if (!response.headers.get("content-type")?.startsWith("application/dicom"))
    return { status: "unavailable" };
  try {
    return { status: "ok", bytes: await response.arrayBuffer() };
  } catch (error) {
    return { status: aborted(error) ? "aborted" : "network" };
  }
}
