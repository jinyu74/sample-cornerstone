import { describe, expect, it } from "vitest";

import { describeImportResult, describeImportSummary } from "./describe-result";

describe("describeImportResult (S2-3)", () => {
  it.each([
    [{ status: "failed", reason: "not-dicom" }, "DICOM 파일이 아닙니다"],
    [{ status: "failed", reason: "parse-error" }, "파일을 해석할 수 없습니다"],
    [
      { status: "failed", reason: "missing-uid", detail: "SeriesInstanceUID" },
      "필수 UID 누락: SeriesInstanceUID",
    ],
    [
      {
        status: "failed",
        reason: "unsupported-transfer-syntax",
        detail: "1.2.840.10008.1.2.4.100",
      },
      "지원하지 않는 전송 구문(Transfer Syntax 1.2.840.10008.1.2.4.100)",
    ],
    [
      { status: "failed", reason: "no-pixel-data" },
      "영상 픽셀 데이터가 없습니다",
    ],
    [
      {
        status: "failed",
        reason: "invalid-frame-count",
        detail: "NumberOfFrames 없음",
      },
      "프레임 수 정보가 올바르지 않습니다(NumberOfFrames 없음)",
    ],
    [{ status: "failed", reason: "read-error" }, "파일을 읽을 수 없습니다"],
    [
      { status: "failed", reason: "storage-quota-exceeded" },
      "브라우저 저장 용량이 부족해 저장하지 못했습니다",
    ],
    [
      { status: "failed", reason: "storage-unavailable" },
      "브라우저 저장소를 사용할 수 없어 저장하지 못했습니다",
    ],
    [
      { status: "failed", reason: "storage-error" },
      "저장 중 오류가 발생해 저장하지 못했습니다",
    ],
    [{ status: "duplicate" }, "이미 가져온 영상이라 건너뛰었습니다"],
    [
      { status: "conflict" },
      "같은 SOP Instance UID 의 다른 파일이 이미 있어 기존 파일을 유지했습니다",
    ],
    [{ status: "imported" }, "이 브라우저에 저장했습니다"],
  ] as const)("%o → %s", (result, message) => {
    expect(describeImportResult({ fileName: "x", ...result })).toBe(message);
  });
});

describe("describeImportSummary", () => {
  it("성공·중복·충돌·실패 수를 표시하고 로컬 저장임을 밝힌다", () => {
    expect(
      describeImportSummary({
        imported: 5,
        duplicate: 1,
        conflict: 0,
        failed: 2,
      }),
    ).toBe(
      "가져오기 완료: 저장 5 · 중복 1 · 충돌 0 · 실패 2 (이 브라우저에만 저장)",
    );
  });
});
