import path from "node:path";

/** 서버 원본 저장 설정이 잘못됨. 기본 경로로 대신 쓰지 않고 실패한다 */
export class OriginalsConfigError extends Error {
  override name = "OriginalsConfigError";
}

export interface OriginalsConfig {
  /** 서버 전용 원본 저장 루트(절대 경로). public·정적 배포 경로가 아니어야 한다 */
  root: string;
  /** 원본 1개 최대 크기(바이트). 수신은 이 상한까지만 스트림으로 읽는다 */
  maxFileBytes: number;
  /** 동시에 처리하는 업로드 수(프로세스 전역). 업로드당 파일 상한의 몇 배까지 메모리를 쓸 수 있다(추정) */
  uploadConcurrency: number;
}

/**
 * 기본 상한. 업로드 하나는 수신 조각·합친 바이트·deflate 해제본·해제본 합본 등 복사본을 함께 쥘 수 있어
 * 메모리 사용은 대략 파일 상한의 몇 배(추정치, 정확한 RAM 보장 아님)다. 그래서 기본 동시성은 1 로 둔다.
 */
export const ORIGINALS_DEFAULTS = {
  maxFileBytes: 256 * 1024 * 1024,
  uploadConcurrency: 1,
} as const;

const MAX_FILE_BYTES_LIMIT = 4 * 1024 ** 3;
const MAX_CONCURRENCY = 32;

function positiveInteger(
  raw: string | undefined,
  name: string,
  fallback: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^[0-9]+$/.test(raw.trim()))
    throw new OriginalsConfigError(
      `${name} 는 양의 정수(바이트·개수)여야 합니다`,
    );
  const value = Number(raw.trim());
  if (value < 1 || value > max)
    throw new OriginalsConfigError(`${name} 는 1 이상 ${max} 이하여야 합니다`);
  return value;
}

/**
 * 서버 원본 저장 설정(server-only 환경변수). `NEXT_PUBLIC_` 를 쓰지 않아 브라우저 번들에 들어가지 않는다.
 * DICOM_DATA_DIR 가 없으면 기능을 끈다(null). 파일 시스템 검사(symlink·권한·위험 경로)는 저장소가 연다.
 */
export function readOriginalsEnv(
  env: Record<string, string | undefined> = process.env,
): OriginalsConfig | null {
  const raw = env.DICOM_DATA_DIR?.trim();
  if (!raw) return null;
  if (!path.isAbsolute(raw))
    throw new OriginalsConfigError("DICOM_DATA_DIR 는 절대 경로여야 합니다");
  if (raw.split(/[\\/]/).includes(".."))
    throw new OriginalsConfigError(
      "DICOM_DATA_DIR 에 상위 경로(..)를 쓸 수 없습니다",
    );
  const root = path.resolve(raw);
  if (root === path.parse(root).root)
    throw new OriginalsConfigError(
      "DICOM_DATA_DIR 로 파일 시스템 루트를 쓸 수 없습니다",
    );
  return {
    root,
    maxFileBytes: positiveInteger(
      env.DICOM_MAX_FILE_BYTES,
      "DICOM_MAX_FILE_BYTES",
      ORIGINALS_DEFAULTS.maxFileBytes,
      MAX_FILE_BYTES_LIMIT,
    ),
    uploadConcurrency: positiveInteger(
      env.DICOM_UPLOAD_CONCURRENCY,
      "DICOM_UPLOAD_CONCURRENCY",
      ORIGINALS_DEFAULTS.uploadConcurrency,
      MAX_CONCURRENCY,
    ),
  };
}
