import type {
  ImportFailureReason,
  ImportFileResult,
  ImportStatus,
} from "../model/types";

const FAILURE_MESSAGES: Record<
  ImportFailureReason,
  (detail?: string) => string
> = {
  "not-dicom": () => "DICOM 파일이 아닙니다",
  "parse-error": () => "파일을 해석할 수 없습니다",
  "missing-uid": (detail) => `필수 UID 누락: ${detail ?? "알 수 없음"}`,
  "unsupported-transfer-syntax": (detail) =>
    `지원하지 않는 전송 구문(Transfer Syntax ${detail ?? "알 수 없음"})`,
  "no-pixel-data": () => "영상 픽셀 데이터가 없습니다",
  "invalid-frame-count": (detail) =>
    detail
      ? `프레임 수 정보가 올바르지 않습니다(${detail})`
      : "프레임 수 정보가 올바르지 않습니다",
  "read-error": () => "파일을 읽을 수 없습니다",
  "storage-quota-exceeded": () =>
    "브라우저 저장 용량이 부족해 저장하지 못했습니다",
  "storage-unavailable": () =>
    "브라우저 저장소를 사용할 수 없어 저장하지 못했습니다",
  "storage-error": () => "저장 중 오류가 발생해 저장하지 못했습니다",
};

/** 파일별 가져오기 결과를 사용자 문구로 바꾼다. 서버 업로드로 표현하지 않는다. */
export function describeImportResult(result: ImportFileResult): string {
  switch (result.status) {
    case "imported":
      return "이 브라우저에 저장했습니다";
    case "duplicate":
      return "이미 가져온 영상이라 건너뛰었습니다";
    case "conflict":
      return "같은 SOP Instance UID 의 다른 파일이 이미 있어 기존 파일을 유지했습니다";
    case "failed":
      return result.reason
        ? FAILURE_MESSAGES[result.reason](result.detail)
        : "가져오지 못했습니다";
  }
}

export function describeImportSummary(
  summary: Record<ImportStatus, number>,
): string {
  return `가져오기 완료: 저장 ${summary.imported} · 중복 ${summary.duplicate} · 충돌 ${summary.conflict} · 실패 ${summary.failed} (이 브라우저에만 저장)`;
}
