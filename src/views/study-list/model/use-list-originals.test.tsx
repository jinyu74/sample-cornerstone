import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CatalogListResult, DicomStore } from "@/entities/dicom-study";

const refresh = vi.hoisted(() => vi.fn());
const transfers = vi.hoisted(() => ({
  upload: vi.fn(async () => undefined),
  download: vi.fn(async () => undefined),
  options: undefined as
    | undefined
    | {
        save: (sop: string, bytes: ArrayBuffer) => Promise<string>;
        onChanged?: () => void;
        userId: string;
      },
}));
const importDicomFiles = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/server-originals", () => ({
  useOriginalTransfers: (options: typeof transfers.options) => {
    transfers.options = options;
    return {
      states: new Map(),
      upload: transfers.upload,
      download: transfers.download,
    };
  },
}));
vi.mock("@/features/import-dicom", () => ({ importDicomFiles }));

const { useListOriginals } = await import("./use-list-originals");

const D = (n: number) => n.toString(16).padStart(64, "0");
const server: CatalogListResult = {
  status: "ready",
  originals: "ready",
  studies: [
    {
      studyInstanceUid: "2.25.1",
      modalities: [],
      seriesCount: 1,
      seriesInstanceUids: ["2.25.10"],
      instanceCount: 3,
      instances: [
        { sopInstanceUid: "2.25.1.1", contentDigest: D(1), stored: true },
        { sopInstanceUid: "2.25.1.2", contentDigest: D(2), stored: true },
        { sopInstanceUid: "2.25.1.3", contentDigest: D(3) },
      ],
    },
  ],
};
const manifest = new Map([
  [
    "2.25.1",
    new Map([
      ["2.25.1.1", D(1)],
      ["2.25.1.3", D(3)],
      ["2.25.1.4", D(4)],
    ]),
  ],
]);

function setup() {
  const reloadLocal = vi.fn(async () => undefined);
  const view = renderHook(() =>
    useListOriginals({
      userId: "u",
      store: {} as DicomStore,
      serverCatalog: server,
      manifest,
      reloadLocal,
    }),
  );
  return { ...view, reloadLocal };
}

describe("useListOriginals", () => {
  it("보관은 이 브라우저에만 있거나 서버에 파일이 없는 영상만 보낸다", async () => {
    const { result } = setup();
    await act(async () => result.current.upload("2.25.1"));
    expect(transfers.upload).toHaveBeenCalledWith("2.25.1", [
      "2.25.1.3",
      "2.25.1.4",
    ]);
  });

  it("불러오기는 서버에 보관됐고 이 브라우저에 없는 영상만 digest 와 함께 요청한다", async () => {
    const { result } = setup();
    await act(async () => result.current.download("2.25.1"));
    expect(transfers.download).toHaveBeenCalledWith("2.25.1", [
      { sopInstanceUid: "2.25.1.2", contentDigest: D(2) },
    ]);
  });

  it("받은 원본은 기존 가져오기 경로(계정 저장소·충돌 시 덮어쓰지 않음)로 저장하고 결과를 그대로 알린다", async () => {
    setup();
    for (const [status, expected] of [
      ["imported", "imported"],
      ["duplicate", "duplicate"],
      ["conflict", "conflict"],
      ["failed", "failed"],
    ] as const) {
      importDicomFiles.mockResolvedValueOnce({
        results: [{ status }],
        summary: {},
      });
      const bytes = new Uint8Array([1]).buffer;
      expect(await transfers.options!.save("2.25.1.2", bytes)).toBe(expected);
      const [sources, deps] = importDicomFiles.mock.calls.at(-1)!;
      expect(new Uint8Array(await sources[0].read())).toEqual(
        new Uint8Array([1]),
      );
      expect(deps.store).toBeDefined();
    }
  });

  it("보관·불러오기가 바뀌면 서버 목록(router.refresh)과 이 브라우저 목록을 다시 읽는다", () => {
    const { reloadLocal } = setup();
    transfers.options!.onChanged!();
    expect(refresh).toHaveBeenCalled();
    expect(reloadLocal).toHaveBeenCalled();
  });
});
