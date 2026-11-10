import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DicomStore } from "@/entities/dicom-study";
import { sha256Hex } from "@/shared/lib/digest";

import type {
  GetOriginalResult,
  PutOriginalResult,
} from "../api/originals-client";

import { useOriginalTransfers } from "./use-original-transfers";

const A = "8f14e45f-ceea-4e7a-9b1c-00000000000a";
const B = "8f14e45f-ceea-4e7a-9b1c-00000000000b";
const STUDY = "2.25.1";
const bytesOf = (n: number) => new Uint8Array([n, n, n]).buffer;

function fakeStore(files: Record<string, ArrayBuffer>) {
  const getFile = vi.fn(async (sop: string) => files[sop]?.slice(0));
  return { store: { getFile } as unknown as DicomStore, getFile };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("useOriginalTransfers: 서버에 원본 보관", () => {
  it("이 브라우저 원본을 차례로 보내며 진행률을 보이고, 끝나면 완료와 목록 새로 고침을 한 번 한다", async () => {
    const { store } = fakeStore({
      "2.25.1.1": bytesOf(1),
      "2.25.1.2": bytesOf(2),
    });
    const gate = deferred<PutOriginalResult>();
    const put = vi
      .fn<
        (
          sop: string,
          bytes: ArrayBuffer,
          user: string,
        ) => Promise<PutOriginalResult>
      >()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValueOnce({ status: "already-stored" });
    const onChanged = vi.fn();
    const { result } = renderHook(() =>
      useOriginalTransfers({ userId: A, store, put, save: vi.fn(), onChanged }),
    );
    let done!: Promise<void>;
    act(() => {
      done = result.current.upload(STUDY, ["2.25.1.1", "2.25.1.2"]);
    });
    await waitFor(() =>
      expect(result.current.states.get(STUDY)).toEqual({
        kind: "running",
        direction: "upload",
        done: 0,
        total: 2,
      }),
    );
    gate.resolve({ status: "stored" });
    await act(() => done);
    expect(result.current.states.get(STUDY)).toEqual({
      kind: "done",
      direction: "upload",
      done: 2,
      total: 2,
    });
    expect(
      put.mock.calls.map(([sop, bytes, user]) => [
        sop,
        new Uint8Array(bytes)[0],
        user,
      ]),
    ).toEqual([
      ["2.25.1.1", 1, A],
      ["2.25.1.2", 2, A],
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("중간 실패는 그 자리에서 멈추고 사유·진행을 남기며, 보관된 것이 있으면 목록을 새로 고친다", async () => {
    const { store } = fakeStore({
      "2.25.1.1": bytesOf(1),
      "2.25.1.2": bytesOf(2),
      "2.25.1.3": bytesOf(3),
    });
    const put = vi
      .fn<(...args: unknown[]) => Promise<PutOriginalResult>>()
      .mockResolvedValueOnce({ status: "stored" })
      .mockResolvedValueOnce({ status: "conflict" });
    const onChanged = vi.fn();
    const { result } = renderHook(() =>
      useOriginalTransfers({ userId: A, store, put, save: vi.fn(), onChanged }),
    );
    await act(() =>
      result.current.upload(STUDY, ["2.25.1.1", "2.25.1.2", "2.25.1.3"]),
    );
    expect(result.current.states.get(STUDY)).toEqual({
      kind: "failed",
      direction: "upload",
      reason: "conflict",
      done: 1,
      total: 3,
    });
    expect(put).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("이 브라우저 원본을 읽지 못하면 local-read 실패이고 서버로 보내지 않는다", async () => {
    const { store } = fakeStore({});
    const put = vi.fn();
    const { result } = renderHook(() =>
      useOriginalTransfers({
        userId: A,
        store,
        put,
        save: vi.fn(),
        onChanged: vi.fn(),
      }),
    );
    await act(() => result.current.upload(STUDY, ["2.25.1.1"]));
    expect(result.current.states.get(STUDY)).toMatchObject({
      kind: "failed",
      reason: "local-read",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("진행 중인 검사를 다시 눌러도 중복 실행하지 않는다", async () => {
    const { store } = fakeStore({ "2.25.1.1": bytesOf(1) });
    const gate = deferred<PutOriginalResult>();
    const put = vi.fn(() => gate.promise);
    const { result } = renderHook(() =>
      useOriginalTransfers({
        userId: A,
        store,
        put,
        save: vi.fn(),
        onChanged: vi.fn(),
      }),
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.upload(STUDY, ["2.25.1.1"]);
      void result.current.upload(STUDY, ["2.25.1.1"]);
      void result.current.download(STUDY, [
        { sopInstanceUid: "2.25.1.1", contentDigest: "x" },
      ]);
    });
    gate.resolve({ status: "stored" });
    await act(() => first);
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe("useOriginalTransfers: 서버에서 원본 불러오기", () => {
  it("받은 바이트의 digest 가 서버 목록 digest 와 같을 때만 이 브라우저에 저장한다", async () => {
    const good = bytesOf(5);
    const goodDigest = await sha256Hex(good);
    const get = vi
      .fn<(sop: string, user: string) => Promise<GetOriginalResult>>()
      .mockResolvedValue({ status: "ok", bytes: good });
    const save = vi
      .fn<(sop: string, bytes: ArrayBuffer) => Promise<"imported">>()
      .mockResolvedValue("imported");
    const onChanged = vi.fn();
    const { store } = fakeStore({});
    const { result } = renderHook(() =>
      useOriginalTransfers({ userId: A, store, get, save, onChanged }),
    );
    await act(() =>
      result.current.download(STUDY, [
        { sopInstanceUid: "2.25.1.1", contentDigest: goodDigest },
        { sopInstanceUid: "2.25.1.2", contentDigest: "f".repeat(64) },
      ]),
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toBe("2.25.1.1");
    expect(result.current.states.get(STUDY)).toEqual({
      kind: "failed",
      direction: "download",
      reason: "integrity",
      done: 1,
      total: 2,
    });
    expect(get.mock.calls.every(([, user]) => user === A)).toBe(true);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("이 브라우저의 같은 SOP 에 다른 내용이 있으면(저장 결과 conflict) 덮어쓰지 않고 실패로 알린다", async () => {
    const bytes = bytesOf(6);
    const { store } = fakeStore({});
    const { result } = renderHook(() =>
      useOriginalTransfers({
        userId: A,
        store,
        get: async () => ({ status: "ok", bytes }),
        save: async () => "conflict" as const,
        onChanged: vi.fn(),
      }),
    );
    await act(async () =>
      result.current.download(STUDY, [
        { sopInstanceUid: "2.25.1.1", contentDigest: await sha256Hex(bytes) },
      ]),
    );
    expect(result.current.states.get(STUDY)).toMatchObject({
      kind: "failed",
      reason: "conflict",
    });
  });

  it("화면이 사라지면 요청을 취소하고, 늦게 도착한 원본을 저장하거나 목록을 새로 고치지 않는다", async () => {
    const bytes = bytesOf(7);
    const digest = await sha256Hex(bytes);
    const gate = deferred<GetOriginalResult>();
    let signal: AbortSignal | undefined;
    const get = vi.fn(
      (_sop: string, _user: string, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return gate.promise;
      },
    );
    const save = vi.fn();
    const onChanged = vi.fn();
    const { store } = fakeStore({});
    const { result, unmount } = renderHook(() =>
      useOriginalTransfers({ userId: A, store, get, save, onChanged }),
    );
    let done!: Promise<void>;
    act(() => {
      done = result.current.download(STUDY, [
        { sopInstanceUid: "2.25.1.1", contentDigest: digest },
      ]);
    });
    await waitFor(() => expect(get).toHaveBeenCalled());
    unmount();
    expect(signal?.aborted).toBe(true);
    gate.resolve({ status: "ok", bytes });
    await done;
    expect(save).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("계정이 A 에서 B 로 바뀌면 A 의 불러오기 결과를 저장하지 않고 B 의 상태에 남기지 않는다", async () => {
    const bytes = bytesOf(8);
    const digest = await sha256Hex(bytes);
    const gate = deferred<GetOriginalResult>();
    const save = vi.fn();
    const onChanged = vi.fn();
    const { store } = fakeStore({});
    const { result, rerender } = renderHook(
      ({ userId }) =>
        useOriginalTransfers({
          userId,
          store,
          get: () => gate.promise,
          save,
          onChanged,
        }),
      { initialProps: { userId: A } },
    );
    let done!: Promise<void>;
    act(() => {
      done = result.current.download(STUDY, [
        { sopInstanceUid: "2.25.1.1", contentDigest: digest },
      ]);
    });
    rerender({ userId: B });
    gate.resolve({ status: "ok", bytes });
    await act(() => done);
    expect(save).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(result.current.states.size).toBe(0);
  });
});
