import { describe, expect, it } from "vitest";

import {
  ORIGINALS_DEFAULTS,
  OriginalsConfigError,
  readOriginalsEnv,
} from "./originals-env";

describe("readOriginalsEnv: 서버 원본 저장 설정(server-only 환경변수)", () => {
  it("DICOM_DATA_DIR 가 없으면 기능을 끈다(null) — 임의의 기본 경로에 쓰지 않는다", () => {
    expect(readOriginalsEnv({})).toBeNull();
    expect(readOriginalsEnv({ DICOM_DATA_DIR: "  " })).toBeNull();
  });

  it("절대 경로와 기본 상한을 돌려준다", () => {
    expect(
      readOriginalsEnv({ DICOM_DATA_DIR: "/srv/dicom-originals" }),
    ).toEqual({
      root: "/srv/dicom-originals",
      maxFileBytes: ORIGINALS_DEFAULTS.maxFileBytes,
      uploadConcurrency: ORIGINALS_DEFAULTS.uploadConcurrency,
    });
    expect(ORIGINALS_DEFAULTS).toEqual({
      maxFileBytes: 256 * 1024 * 1024,
      // 로컬·초기 운영의 메모리 압력을 줄이기 위해 기본 1(환경변수로 확대 가능)
      uploadConcurrency: 1,
    });
  });

  it("상한은 환경변수로 조정할 수 있다", () => {
    expect(
      readOriginalsEnv({
        DICOM_DATA_DIR: "/srv/x",
        DICOM_MAX_FILE_BYTES: "1048576",
        DICOM_UPLOAD_CONCURRENCY: "4",
      }),
    ).toMatchObject({ maxFileBytes: 1048576, uploadConcurrency: 4 });
  });

  it.each([
    ["상대 경로", { DICOM_DATA_DIR: ".local/dicom-originals" }],
    ["루트", { DICOM_DATA_DIR: "/" }],
    ["상위 이동 포함", { DICOM_DATA_DIR: "/srv/../etc" }],
    [
      "상한이 숫자가 아님",
      { DICOM_DATA_DIR: "/srv/x", DICOM_MAX_FILE_BYTES: "1mb" },
    ],
    ["상한 0", { DICOM_DATA_DIR: "/srv/x", DICOM_MAX_FILE_BYTES: "0" }],
    [
      "상한이 너무 큼(4GiB 초과)",
      { DICOM_DATA_DIR: "/srv/x", DICOM_MAX_FILE_BYTES: String(5 * 1024 ** 3) },
    ],
    ["동시성 0", { DICOM_DATA_DIR: "/srv/x", DICOM_UPLOAD_CONCURRENCY: "0" }],
    [
      "동시성 정수 아님",
      { DICOM_DATA_DIR: "/srv/x", DICOM_UPLOAD_CONCURRENCY: "1.5" },
    ],
  ])("%s 는 설정 오류로 거부한다(fail-closed)", (_name, env) => {
    expect(() => readOriginalsEnv(env)).toThrow(OriginalsConfigError);
  });
});
