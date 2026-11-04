import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  CatalogSyncOutcome,
  CatalogSyncRequest,
  DicomStore,
  StoredInstanceRecord,
} from "@/entities/dicom-study";

import { useCatalogSync } from "./use-catalog-sync";

const A = "8f14e45f-ceea-4e7a-9b1c-00000000000a";
const B = "8f14e45f-ceea-4e7a-9b1c-00000000000b";
const D = (n: number) => n.toString(16).padStart(64, "0");

function record(sop: string, study = "2.25.1"): StoredInstanceRecord {
  return {
    sopInstanceUid: sop,
    studyInstanceUid: study,
    seriesInstanceUid: `${study}.10`,
    contentDigest: D(Number(sop.split(".").at(-1))),
    byteLength: 10,
    importedAt: "2026-11-04T00:00:00.000Z",
    metadata: {
      sopInstanceUid: sop,
      sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
      studyInstanceUid: study,
      seriesInstanceUid: `${study}.10`,
      transferSyntaxUid: "1.2.840.10008.1.2.1",
      modality: "CT",
      accessionNumber: "SYN-ACC",
      patientId: "SYN-0001",
      rows: 4,
      columns: 4,
      numberOfFrames: 1,
      frameKind: "single",
    },
  };
}

/** 원본 저장소 대역: 읽기만 하고, 동기화가 원본을 바꾸지 않는지 확인한다 */
function fakeStore(records: StoredInstanceRecord[], fail = false) {
  const listInstances = vi.fn(async () => {
    if (fail) throw new Error("IndexedDB 읽기 실패");
    return records.map((item) => structuredClone(item));
  });
  return {
    store: { listInstances } as unknown as DicomStore,
    listInstances,
  };
}

const SYNCED: CatalogSyncOutcome = {
  status: "synced",
  seriesCount: 1,
  instanceCount: 2,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("useCatalogSync", () => {
  it("검사의 허용 메타데이터만 현재 계정으로 보내고, 성공하면 반영됨으로 바꾼 뒤 서버 목록을 새로 고친다", async () => {
    const { store } = fakeStore([record("2.25.1.1"), record("2.25.1.2")]);
    const submit = vi
      .fn<(request: CatalogSyncRequest) => Promise<CatalogSyncOutcome>>()
      .mockResolvedValue(SYNCED);
    const onSynced = vi.fn();
    const { result } = renderHook(() =>
      useCatalogSync({ userId: A, store, submit, onSynced }),
    );
    let done!: Promise<void>;
    act(() => {
      done = result.current.syncStudies(["2.25.1"]);
    });
    expect(result.current.states.get("2.25.1")).toEqual({ kind: "syncing" });
    await act(() => done);

    expect(result.current.states.get("2.25.1")).toEqual({ kind: "synced" });
    expect(onSynced).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
    const [request] = submit.mock.calls[0]!;
    expect(request.expectedUserId).toBe(A);
    expect(JSON.stringify(request)).not.toContain("SYN-0001");
    expect(
      request.study.series[0]!.instances.map((i) => i.sopInstanceUid),
    ).toEqual(["2.25.1.1", "2.25.1.2"]);
  });

  it("상한을 넘는 검사는 청크를 차례로 보내고 모두 성공해야 반영됨이다", async () => {
    const records = Array.from({ length: 1001 }, (_, i) =>
      record(`2.25.1.${i + 1}`),
    );
    const { store } = fakeStore(records);
    const submit = vi.fn(async () => SYNCED);
    const { result } = renderHook(() =>
      useCatalogSync({ userId: A, store, submit, onSynced: vi.fn() }),
    );
    await act(() => result.current.syncStudies(["2.25.1"]));
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result.current.states.get("2.25.1")).toEqual({ kind: "synced" });
  });

  it("서버 반영이 실패하면 실패 사유를 남기고 원본은 그대로이며, 다시 시도는 같은 요청으로 멱등하게 반영한다", async () => {
    const { store, listInstances } = fakeStore([record("2.25.1.1")]);
    const submit = vi
      .fn<(request: CatalogSyncRequest) => Promise<CatalogSyncOutcome>>()
      .mockResolvedValueOnce({ status: "unavailable" })
      .mockResolvedValueOnce(SYNCED);
    const onSynced = vi.fn();
    const { result } = renderHook(() =>
      useCatalogSync({ userId: A, store, submit, onSynced }),
    );
    await act(() => result.current.syncStudies(["2.25.1"]));
    expect(result.current.states.get("2.25.1")).toEqual({
      kind: "failed",
      reason: "unavailable",
    });
    expect(onSynced).not.toHaveBeenCalled();
    expect(Object.keys(store)).toEqual(["listInstances"]);

    await act(() => result.current.syncStudies(["2.25.1"]));
    expect(result.current.states.get("2.25.1")).toEqual({ kind: "synced" });
    expect(submit.mock.calls[1]![0]).toEqual(submit.mock.calls[0]![0]);
    expect(listInstances).toHaveBeenCalledTimes(2);
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "네트워크 오류",
      () => Promise.reject(new TypeError("fetch failed")),
      { kind: "failed", reason: "network" },
    ],
    [
      "충돌",
      () => Promise.resolve({ status: "conflict", kind: "instance" } as const),
      { kind: "failed", reason: "conflict", conflict: "instance" },
    ],
    [
      "계정 불일치",
      () => Promise.resolve({ status: "account-mismatch" } as const),
      { kind: "failed", reason: "account-mismatch" },
    ],
    [
      "로그인 만료",
      () => Promise.resolve({ status: "unauthenticated" } as const),
      { kind: "failed", reason: "unauthenticated" },
    ],
  ])("%s 는 성공으로 표시하지 않는다", async (_name, outcome, expected) => {
    const { store } = fakeStore([record("2.25.1.1")]);
    const { result } = renderHook(() =>
      useCatalogSync({
        userId: A,
        store,
        submit: outcome as () => Promise<CatalogSyncOutcome>,
        onSynced: vi.fn(),
      }),
    );
    await act(() => result.current.syncStudies(["2.25.1"]));
    expect(result.current.states.get("2.25.1")).toEqual(expected);
  });

  it("이 브라우저 원본을 읽지 못하면 로컬 읽기 실패로 알리고 서버에 보내지 않는다", async () => {
    const { store } = fakeStore([], true);
    const submit = vi.fn(async () => SYNCED);
    const { result } = renderHook(() =>
      useCatalogSync({ userId: A, store, submit, onSynced: vi.fn() }),
    );
    await act(() => result.current.syncStudies(["2.25.1"]));
    expect(result.current.states.get("2.25.1")).toEqual({
      kind: "failed",
      reason: "local-read",
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("이미 반영 중인 검사를 다시 요청해도 중복 전송하지 않는다", async () => {
    const { store } = fakeStore([record("2.25.1.1")]);
    const pending = deferred<CatalogSyncOutcome>();
    const submit = vi.fn(() => pending.promise);
    const { result } = renderHook(() =>
      useCatalogSync({ userId: A, store, submit, onSynced: vi.fn() }),
    );
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.syncStudies(["2.25.1"]);
      second = result.current.syncStudies(["2.25.1"]);
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    pending.resolve(SYNCED);
    await act(() => Promise.all([first, second]));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("화면이 사라진 뒤 늦게 끝난 요청은 상태·목록 새로 고침에 반영하지 않는다", async () => {
    const { store } = fakeStore([record("2.25.1.1")]);
    const pending = deferred<CatalogSyncOutcome>();
    const onSynced = vi.fn();
    const { result, unmount } = renderHook(() =>
      useCatalogSync({
        userId: A,
        store,
        submit: () => pending.promise,
        onSynced,
      }),
    );
    let done!: Promise<void>;
    act(() => {
      done = result.current.syncStudies(["2.25.1"]);
    });
    await waitFor(() =>
      expect(result.current.states.get("2.25.1")).toEqual({ kind: "syncing" }),
    );
    unmount();
    pending.resolve(SYNCED);
    await done;
    expect(onSynced).not.toHaveBeenCalled();
  });

  it("계정이 A 에서 B 로 바뀐 뒤 끝난 A 의 요청은 B 의 상태·목록에 반영하지 않는다", async () => {
    const { store } = fakeStore([record("2.25.1.1")]);
    const pending = deferred<CatalogSyncOutcome>();
    const onSynced = vi.fn();
    const { result, rerender } = renderHook(
      ({ userId }) =>
        useCatalogSync({
          userId,
          store,
          submit: () => pending.promise,
          onSynced,
        }),
      { initialProps: { userId: A } },
    );
    let done!: Promise<void>;
    act(() => {
      done = result.current.syncStudies(["2.25.1"]);
    });
    rerender({ userId: B });
    pending.resolve(SYNCED);
    await act(() => done);
    expect(result.current.states.size).toBe(0);
    expect(onSynced).not.toHaveBeenCalled();
  });
});
