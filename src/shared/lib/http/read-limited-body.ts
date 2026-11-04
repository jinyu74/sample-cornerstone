export class BodyTooLargeError extends Error {
  override name = "BodyTooLargeError";
}

/**
 * 요청 본문을 최대 maxBytes 까지만 읽어 UTF-8 문자열로 돌려준다.
 * 길이 헤더가 상한을 넘으면 읽지 않고, 헤더가 없거나 거짓이어도 상한을 넘는 순간 읽기를 멈춘다.
 */
export async function readLimitedText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes)
    throw new BodyTooLargeError("요청 본문이 너무 큽니다");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError("요청 본문이 너무 큽니다");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
