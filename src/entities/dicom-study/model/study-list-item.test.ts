import { describe, expect, it } from "vitest";

import { formatDicomDate, toStudyListItem } from "./study-list-item";
import type { StudyGroup } from "./types";

const study = (overrides: Partial<StudyGroup>): StudyGroup => ({
  studyInstanceUid: "2.25.1",
  modalities: ["CT"],
  series: [],
  ...overrides,
});

describe("formatDicomDate (S3-2)", () => {
  it("DA(YYYYMMDD)를 YYYY.MM.DD 로 표시한다", () => {
    expect(formatDicomDate("20261102")).toBe("2026.11.02");
  });

  it("값이 없거나 형식이 다르면 원문 또는 대시를 표시한다(추측하지 않는다)", () => {
    expect(formatDicomDate(undefined)).toBe("—");
    expect(formatDicomDate("2026")).toBe("2026");
    expect(formatDicomDate("20261340")).toBe("20261340");
  });
});

describe("toStudyListItem (S3-2)", () => {
  it("식별자는 Accession Number → Study ID → Patient ID → Study UID 순으로 고른다", () => {
    expect(
      toStudyListItem(
        study({ accessionNumber: "ACC", studyId: "S", patientId: "P" }),
        "untouched",
      ).identifier,
    ).toBe("ACC");
    expect(
      toStudyListItem(study({ studyId: "S", patientId: "P" }), "untouched")
        .identifier,
    ).toBe("S");
    expect(
      toStudyListItem(study({ patientId: "P" }), "untouched").identifier,
    ).toBe("P");
    expect(toStudyListItem(study({}), "untouched").identifier).toBe("2.25.1");
  });

  it("검사 날짜·modality·시리즈 수·작업 상태를 담는다", () => {
    const item = toStudyListItem(
      study({
        studyDate: "20261102",
        studyDescription: "Synthetic",
        modalities: ["CT", "SR"],
        series: [
          {} as StudyGroup["series"][number],
          {} as StudyGroup["series"][number],
        ],
      }),
      "in-progress",
    );

    expect(item).toEqual({
      studyInstanceUid: "2.25.1",
      studyDate: "20261102",
      displayDate: "2026.11.02",
      identifier: "2.25.1",
      description: "Synthetic",
      modalities: ["CT", "SR"],
      seriesCount: 2,
      workStatus: "in-progress",
    });
  });
});
