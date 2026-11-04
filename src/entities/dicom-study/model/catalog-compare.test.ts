import { describe, expect, it } from "vitest";

import { compareCatalogStudy } from "./catalog-compare";

const D = (n: number) => n.toString(16).padStart(64, "0");
const server = [
  { sopInstanceUid: "2.25.1", contentDigest: D(1) },
  { sopInstanceUid: "2.25.2", contentDigest: D(2) },
  { sopInstanceUid: "2.25.3", contentDigest: D(3) },
];
const local = (entries: [string, string][]) => new Map(entries);

describe("compareCatalogStudy: 서버 목록과 이 브라우저 원본을 구분한다", () => {
  it("서버의 모든 영상이 같은 내용으로 있으면 전체 있음", () => {
    expect(
      compareCatalogStudy(
        server,
        local([
          ["2.25.1", D(1)],
          ["2.25.2", D(2)],
          ["2.25.3", D(3)],
        ]),
      ),
    ).toEqual({ originals: { kind: "complete", total: 3 }, unsynced: 0 });
  });

  it("이 브라우저에 원본이 하나도 없으면 없음(다른 브라우저·새 브라우저)", () => {
    expect(compareCatalogStudy(server, local([]))).toEqual({
      originals: { kind: "missing", total: 3 },
      unsynced: 0,
    });
  });

  it("일부만 있으면 일부 있음과 개수", () => {
    expect(compareCatalogStudy(server, local([["2.25.2", D(2)]]))).toEqual({
      originals: { kind: "partial", present: 1, total: 3 },
      unsynced: 0,
    });
  });

  it("같은 SOP UID 의 내용(digest)이 다르면 다른 상태보다 우선해 불일치로 알린다", () => {
    expect(
      compareCatalogStudy(
        server,
        local([
          ["2.25.1", D(1)],
          ["2.25.2", D(9)],
          ["2.25.3", D(3)],
        ]),
      ),
    ).toEqual({
      originals: { kind: "mismatch", mismatched: 1, present: 2, total: 3 },
      unsynced: 0,
    });
  });

  it("서버에 없는 로컬 영상은 서버 미반영 수로 센다", () => {
    expect(
      compareCatalogStudy(
        server,
        local([
          ["2.25.1", D(1)],
          ["2.25.2", D(2)],
          ["2.25.3", D(3)],
          ["2.25.4", D(4)],
        ]),
      ),
    ).toEqual({ originals: { kind: "complete", total: 3 }, unsynced: 1 });
  });

  it("서버에 없는 로컬 전용 검사는 원본 전체 있음 + 전부 미반영", () => {
    expect(
      compareCatalogStudy(
        [],
        local([
          ["2.25.1", D(1)],
          ["2.25.2", D(2)],
        ]),
      ),
    ).toEqual({ originals: { kind: "complete", total: 2 }, unsynced: 2 });
  });
});
