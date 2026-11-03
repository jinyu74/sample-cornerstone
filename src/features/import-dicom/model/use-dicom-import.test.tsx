import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createIndexedDbDicomStore,
  type DicomStore,
} from "@/entities/dicom-study";
import { ctStack, nonDicom } from "@tests/fixtures/dicom/scenarios";

import { useDicomImport } from "./use-dicom-import";

let counter = 0;
const stores: DicomStore[] = [];
function newStore() {
  const store = createIndexedDbDicomStore({
    databaseName: `use-import-${(counter += 1)}`,
  });
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

const toFile = ({ name, bytes }: { name: string; bytes: Uint8Array }) =>
  new File([bytes.slice()], name);

describe("useDicomImport", () => {
  it("가져오기 중 진행 상황을 보여 주고 끝나면 보고서와 완료 콜백을 남긴다", async () => {
    const onFinished = vi.fn();
    const files = [...(await ctStack()).map(toFile), toFile(nonDicom())];
    const { result } = renderHook(() =>
      useDicomImport({ store: newStore(), onFinished }),
    );
    expect(result.current.phase).toBe("idle");

    let running!: Promise<unknown>;
    act(() => {
      running = result.current.importFiles(files);
    });
    expect(result.current.phase).toBe("running");
    await act(() => running);

    expect(result.current.phase).toBe("done");
    expect(result.current.progress).toEqual({ completed: 6, total: 6 });
    expect(result.current.report?.summary).toEqual({
      imported: 5,
      duplicate: 0,
      conflict: 0,
      failed: 1,
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("빈 파일 목록은 무시한다", async () => {
    const { result } = renderHook(() => useDicomImport({ store: newStore() }));

    await act(() => result.current.importFiles([]));

    expect(result.current.phase).toBe("idle");
  });

  it("실행 중 다시 요청하면 무시하고 첫 작업만 수행한다", async () => {
    const store = newStore();
    const files = (await ctStack()).map(toFile);
    const { result } = renderHook(() => useDicomImport({ store }));

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.importFiles(files);
      second = result.current.importFiles(files);
    });
    await act(() => Promise.all([first, second]));

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.report?.summary.imported).toBe(5);
    expect(result.current.report?.summary.duplicate).toBe(0);
  });
});
