import { inflateRawSync } from "node:zlib";

/** dicom-parser `options.inflater` 형식: 헤더(position 까지) + 풀린 데이터셋 전체 바이트를 돌려준다 */
export type DicomInflater = (
  byteArray: Uint8Array,
  position: number,
) => Uint8Array;

/** deflate 데이터셋이 상한보다 크게 팽창함 */
export class InflatedTooLargeError extends Error {
  override name = "InflatedTooLargeError";
}

/**
 * 서버 전용 deflate 해제기. dicom-parser 의 Node 기본 경로(inflateRawSync 상한 없음)를 대신해
 * 풀린 크기를 maxInflatedBytes 로 제한한다. 메모리는 수신 원본 + 풀린 데이터 + 합친 복사본까지 쓸 수 있다.
 */
export function createBoundedInflater(maxInflatedBytes: number): DicomInflater {
  return (byteArray, position) => {
    let inflated: Buffer;
    try {
      inflated = inflateRawSync(byteArray.subarray(position), {
        maxOutputLength: maxInflatedBytes,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE")
        throw new InflatedTooLargeError("inflated-too-large");
      throw error;
    }
    const full = new Uint8Array(position + inflated.byteLength);
    full.set(byteArray.subarray(0, position), 0);
    full.set(inflated, position);
    return full;
  };
}
