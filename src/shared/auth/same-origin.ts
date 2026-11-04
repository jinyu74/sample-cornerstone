export interface SameOriginInput {
  /** 브라우저가 보낸 Origin 헤더 */
  origin: string | null;
  /** 요청 Host 헤더(host:port) */
  host: string | null;
  /** 서버가 받은 요청의 scheme("http:"). 로컬은 http, 클라우드 프록시 신뢰 설정은 후속 범위 */
  protocol: string;
  /** Origin 이 없을 때만 보는 Fetch Metadata(Sec-Fetch-Site) */
  secFetchSite?: string | null;
}

/**
 * 상태를 바꾸는 요청(로그아웃)이 같은 출처에서 왔는지 판정한다.
 * 같은 출처 = scheme + host + port 가 모두 같음. host 만 같거나 port·scheme 이 다르면 거부한다.
 */
export function isSameOriginRequest({
  origin,
  host,
  protocol,
  secFetchSite,
}: SameOriginInput): boolean {
  if (!host) return false;
  if (origin === null) return secFetchSite === "same-origin";
  let expected: string;
  try {
    expected = new URL(`${protocol}//${host}`).origin;
  } catch {
    return false;
  }
  return origin === expected;
}
