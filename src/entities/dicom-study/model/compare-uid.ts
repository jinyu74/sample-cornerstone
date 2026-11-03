/**
 * DICOM UID 를 구성요소별 숫자로 비교한다("1.2.9" < "1.2.10").
 * UID 구성요소는 선행 0 이 없는 숫자이므로 길이 → 사전순 비교로 큰 수도 정확히 비교한다.
 */
export function compareUid(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  const count = Math.min(left.length, right.length);
  for (let i = 0; i < count; i += 1) {
    const l = left[i]!;
    const r = right[i]!;
    if (l === r) continue;
    if (l.length !== r.length) return l.length - r.length;
    return l < r ? -1 : 1;
  }
  return left.length - right.length;
}
