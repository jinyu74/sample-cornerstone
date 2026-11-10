import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DicomStore } from "@/entities/dicom-study";
import type { ImportReport } from "@/features/import-dicom";

const refresh = vi.hoisted(() => vi.fn());
const syncStudies = vi.hoisted(() => vi.fn(async () => undefined));
const useCatalogSync = vi.hoisted(() =>
  vi.fn((options: { onSynced?: () => void }) => {
    syncOptions = options;
    return { states: new Map(), syncStudies };
  }),
);
let syncOptions: { onSynced?: () => void } | undefined;
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/sync-catalog", () => ({ useCatalogSync }));

const { useListSync } = await import("./use-list-sync");

const report = (results: ImportReport["results"]): ImportReport => ({
  results,
  summary: { imported: 0, duplicate: 0, conflict: 0, failed: 0 },
});

describe("useListSync", () => {
  it("가져오기가 끝나면 로컬 목록을 다시 읽고, 저장된(새로·중복) 원본의 검사만 한 번씩 서버 목록에 반영한다", async () => {
    const reloadLocal = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useListSync({
        userId: "u",
        store: {} as DicomStore,
        reloadLocal,
      }),
    );
    await act(async () =>
      result.current.onImported(
        report([
          { fileName: "a", status: "imported", studyInstanceUid: "2.25.1" },
          { fileName: "b", status: "duplicate", studyInstanceUid: "2.25.1" },
          { fileName: "c", status: "imported", studyInstanceUid: "2.25.2" },
          // 로컬 충돌·실패는 이 브라우저에 새로 저장된 원본이 없으므로 보내지 않는다
          { fileName: "d", status: "conflict", studyInstanceUid: "2.25.3" },
          { fileName: "e", status: "failed", reason: "not-dicom" },
        ]),
      ),
    );
    expect(reloadLocal).toHaveBeenCalledTimes(1);
    expect(syncStudies).toHaveBeenCalledWith(["2.25.1", "2.25.2"]);
  });

  it("반영에 성공하면 서버 목록을 다시 렌더링(router.refresh)한다", () => {
    renderHook(() =>
      useListSync({
        userId: "u",
        store: {} as DicomStore,
        reloadLocal: vi.fn(),
      }),
    );
    syncOptions!.onSynced!();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
