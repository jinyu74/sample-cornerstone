import { describe, expect, it } from "vitest";

import type { CatalogStudySummary } from "./catalog-summary";
import {
  markStoredOriginals,
  summarizeServerOriginals,
} from "./server-originals";

const D = (n: number) => n.toString(16).padStart(64, "0");
const study = (
  instances: CatalogStudySummary["instances"],
): CatalogStudySummary => ({
  studyInstanceUid: "2.25.1",
  modalities: ["CT"],
  seriesCount: 1,
  seriesInstanceUids: ["2.25.10"],
  instanceCount: instances.length,
  instances,
});

describe("markStoredOriginals: 실제 서버 파일로만 보관됨을 표시한다", () => {
  it("파일의 digest 가 카탈로그 digest 와 같을 때만 stored 이다(이름만 같은 다른 내용은 아님)", () => {
    const [marked] = markStoredOriginals(
      [
        study([
          { sopInstanceUid: "2.25.1.1", contentDigest: D(1) },
          { sopInstanceUid: "2.25.1.2", contentDigest: D(2) },
          { sopInstanceUid: "2.25.1.3", contentDigest: D(3) },
        ]),
      ],
      new Map([
        ["2.25.1.1", D(1)],
        ["2.25.1.2", D(9)],
      ]),
    );
    expect(marked!.instances).toEqual([
      { sopInstanceUid: "2.25.1.1", contentDigest: D(1), stored: true },
      { sopInstanceUid: "2.25.1.2", contentDigest: D(2) },
      { sopInstanceUid: "2.25.1.3", contentDigest: D(3) },
    ]);
  });

  it("카탈로그에 없는 파일은 목록에 끼워 넣지 않는다", () => {
    const [marked] = markStoredOriginals(
      [study([{ sopInstanceUid: "2.25.1.1", contentDigest: D(1) }])],
      new Map([["2.25.9.9", D(9)]]),
    );
    expect(marked!.instances).toEqual([
      { sopInstanceUid: "2.25.1.1", contentDigest: D(1) },
    ]);
  });
});

describe("summarizeServerOriginals: 서버 보관 수와 보관·불러오기 후보", () => {
  const server = study([
    { sopInstanceUid: "2.25.1.1", contentDigest: D(1), stored: true },
    { sopInstanceUid: "2.25.1.2", contentDigest: D(2), stored: true },
    { sopInstanceUid: "2.25.1.3", contentDigest: D(3) },
  ]);

  it("서버 보관 수/전체 수, 이 브라우저에 없는 보관 원본은 불러오기 후보", () => {
    expect(
      summarizeServerOriginals(server, new Map([["2.25.1.1", D(1)]])),
    ).toEqual({
      stored: 2,
      total: 3,
      uploadable: [],
      downloadable: ["2.25.1.2"],
    });
  });

  it("이 브라우저에만 있거나 서버에 보관되지 않은 원본은 보관 후보이고, 서버와 내용이 다른 원본은 후보가 아니다", () => {
    expect(
      summarizeServerOriginals(
        server,
        new Map([
          ["2.25.1.1", D(1)],
          ["2.25.1.2", D(7)],
          ["2.25.1.3", D(3)],
          ["2.25.1.4", D(4)],
        ]),
      ),
    ).toEqual({
      stored: 2,
      total: 3,
      uploadable: ["2.25.1.3", "2.25.1.4"],
      downloadable: [],
    });
  });

  it("서버 목록에 없는 로컬 전용 검사는 전부 보관 후보이고 서버 보관 수는 0/0", () => {
    expect(
      summarizeServerOriginals(
        undefined,
        new Map([
          ["2.25.1.2", D(2)],
          ["2.25.1.1", D(1)],
        ]),
      ),
    ).toEqual({
      stored: 0,
      total: 0,
      uploadable: ["2.25.1.1", "2.25.1.2"],
      downloadable: [],
    });
  });
});
