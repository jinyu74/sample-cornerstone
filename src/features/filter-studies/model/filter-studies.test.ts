import { describe, expect, it } from "vitest";

import type { StudyListItem } from "@/entities/dicom-study";

import { filterStudies } from "./filter-studies";

const item = (overrides: Partial<StudyListItem>): StudyListItem => ({
  studyInstanceUid: "2.25.1",
  displayDate: "—",
  identifier: "ID",
  modalities: [],
  seriesCount: 1,
  workStatus: "untouched",
  ...overrides,
});

const items = [
  item({
    studyInstanceUid: "a",
    identifier: "SYN-CT-1",
    studyDate: "20261102",
    displayDate: "2026.11.02",
    modalities: ["CT"],
    workStatus: "in-progress",
  }),
  item({
    studyInstanceUid: "b",
    identifier: "SYN-MR-1",
    studyDate: "20261101",
    displayDate: "2026.11.01",
    modalities: ["MR"],
    description: "Brain",
    workStatus: "untouched",
  }),
  item({
    studyInstanceUid: "c",
    identifier: "SYN-DX-1",
    studyDate: "20261030",
    displayDate: "2026.10.30",
    modalities: ["DX"],
    workStatus: "done",
  }),
];

const uids = (list: StudyListItem[]) =>
  list.map((entry) => entry.studyInstanceUid);

describe("filterStudies (S3-3)", () => {
  it("검색어와 상태가 없으면 전체를 순서 그대로 돌려준다", () => {
    expect(uids(filterStudies(items, { query: "", status: "all" }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("식별자·설명·modality 를 대소문자와 앞뒤 공백 없이 부분 일치로 찾는다", () => {
    expect(
      uids(filterStudies(items, { query: "  syn-mr ", status: "all" })),
    ).toEqual(["b"]);
    expect(
      uids(filterStudies(items, { query: "brain", status: "all" })),
    ).toEqual(["b"]);
    expect(uids(filterStudies(items, { query: "dx", status: "all" }))).toEqual([
      "c",
    ]);
  });

  it("검사 날짜는 표시 형식과 DICOM 형식 모두로 찾는다", () => {
    expect(
      uids(filterStudies(items, { query: "2026.11", status: "all" })),
    ).toEqual(["a", "b"]);
    expect(
      uids(filterStudies(items, { query: "20261030", status: "all" })),
    ).toEqual(["c"]);
  });

  it("작업 상태 필터를 검색어와 함께 적용한다", () => {
    expect(uids(filterStudies(items, { query: "", status: "done" }))).toEqual([
      "c",
    ]);
    expect(
      uids(filterStudies(items, { query: "SYN-CT", status: "untouched" })),
    ).toEqual([]);
  });
});
