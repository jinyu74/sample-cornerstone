import { describe, expect, it } from "vitest";

import {
  collectDroppedFiles,
  type DroppedEntry,
} from "./collect-dropped-files";

function file(name: string): DroppedEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve) => resolve(new File(["x"], name)),
  };
}

function directory(
  name: string,
  children: DroppedEntry[],
  batchSize = 2,
): DroppedEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let offset = 0;
      // readEntries 는 빈 배열을 돌려줄 때까지 여러 번 호출해야 한다.
      return {
        readEntries: (resolve) => {
          const batch = children.slice(offset, offset + batchSize);
          offset += batch.length;
          resolve(batch);
        },
      };
    },
  };
}

describe("collectDroppedFiles (S2-6 폴더 드롭)", () => {
  it("폴더 안의 파일을 하위 폴더까지 모두 모으고 상대 경로 이름을 붙인다", async () => {
    const entries = [
      directory("study", [
        file("a"),
        file("b"),
        directory("series", [file("c")]),
        file("d"),
      ]),
      file("loose.dcm"),
    ];

    const files = await collectDroppedFiles(entries, []);

    expect(files.map((entry) => entry.path)).toEqual([
      "study/a",
      "study/b",
      "study/series/c",
      "study/d",
      "loose.dcm",
    ]);
    expect(files.every((entry) => entry.file instanceof File)).toBe(true);
  });

  it("항목 API 가 없으면 dataTransfer.files 를 그대로 쓴다", async () => {
    const fallback = [new File(["x"], "one.dcm"), new File(["y"], "two")];

    const files = await collectDroppedFiles([], fallback);

    expect(files.map((entry) => entry.path)).toEqual(["one.dcm", "two"]);
  });
});
