import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { type CatalogStudySummary, groupStudies } from "@/entities/dicom-study";
import { buildCatalogRows } from "@/views/study-list/model/build-catalog-rows";
import { StudyTable } from "@/widgets/study-table";

/** 새 브라우저에서 기존 서버 검사에 새 영상을 가져왔지만 메타 반영이 실패한 경우. */
function rows() {
  const study = "2.25.9801";
  const localSop = "2.25.9803";
  const digest = "1".padStart(64, "0");
  const remote: CatalogStudySummary = {
    studyInstanceUid: study,
    accessionNumber: "REVIEW-LOCAL",
    modalities: ["CT"],
    seriesCount: 1,
    seriesInstanceUids: ["2.25.9899"],
    instanceCount: 1,
    instances: [{ sopInstanceUid: "2.25.9802", contentDigest: digest }],
  };
  return buildCatalogRows({
    server: { status: "ready", studies: [remote] },
    local: {
      status: "ready",
      studies: groupStudies([
        {
          studyInstanceUid: study,
          seriesInstanceUid: "2.25.9810",
          sopInstanceUid: localSop,
          sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
          transferSyntaxUid: "1.2.840.10008.1.2.1",
          accessionNumber: "REVIEW-LOCAL",
          rows: 1,
          columns: 1,
          numberOfFrames: 1,
          frameKind: "single",
        },
      ]),
      manifest: new Map([[study, new Map([[localSop, digest]])]]),
    },
    works: { status: "ready", statuses: new Map() },
    sync: new Map([[study, { kind: "failed", reason: "unavailable" }]]),
  });
}

describe("서버 미반영 새 원본의 로컬 사용", () => {
  it("서버가 알고 있는 영상과 달라도 이 브라우저의 정상 원본은 열 수 있다", () => {
    render(
      <StudyTable
        status="ready"
        items={rows()}
        getStudyHref={(uid) => `/studies/${uid}`}
      />,
    );
    expect(screen.getByRole("link", { name: /검사 열기/ })).toHaveAttribute(
      "href",
      "/studies/2.25.9801",
    );
  });

  it("실제 로컬 원본과 작업 저장소를 확인했으면 미작업을 기록 없음으로 바꾸지 않는다", () => {
    expect(rows()[0]?.workStatus).toBe("untouched");
  });
});
