import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type DicomInstanceMetadata,
  type DicomStore,
  groupStudies,
  type SeriesGroup,
} from "@/entities/dicom-study";

import { useStackImageIds } from "./use-stack-image-ids";

const mocks = vi.hoisted(() => ({
  register: vi.fn<(bytes: ArrayBuffer) => Promise<string>>(),
  released: [] as string[][],
}));

vi.mock("@/shared/viewer", () => ({
  registerDicomFile: mocks.register,
  frameImageId: (id: string, frame?: number) =>
    frame === undefined ? id : `${id}?frame=${frame}`,
  releaseDicomFiles: async (ids: string[]) => {
    mocks.released.push([...ids]);
  },
}));

function instance(
  sop: string,
  z: number,
  overrides: Partial<DicomInstanceMetadata> = {},
): DicomInstanceMetadata {
  return {
    sopInstanceUid: sop,
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.10",
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    rows: 2,
    columns: 2,
    numberOfFrames: 1,
    frameKind: "single",
    imagePositionPatient: [0, 0, z],
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    ...overrides,
  };
}

const seriesOf = (...instances: DicomInstanceMetadata[]): SeriesGroup =>
  groupStudies(instances)[0]!.series[0]!;

function storeWith(files: Record<string, ArrayBuffer | undefined>): DicomStore {
  return {
    addInstance: vi.fn(),
    getInstance: vi.fn(),
    getFile: vi.fn(async (sop: string) => files[sop]),
    listInstances: vi.fn(),
    listSeriesInstances: vi.fn(),
    close: vi.fn(),
  };
}

const released = () => mocks.released.flat();

beforeEach(() => {
  mocks.register.mockReset();
  mocks.released.length = 0;
});

describe("useStackImageIds 등록·해제", () => {
  it("스택 순서대로 imageId 를 만들고(멀티프레임은 frame 매개변수) 화면을 떠나면 모두 해제한다", async () => {
    let next = 0;
    mocks.register.mockImplementation(async () => `dicomfile:${next++}`);
    const series = seriesOf(instance("2.25.2", 5), instance("2.25.1", 0));
    const store = storeWith({
      "2.25.1": new ArrayBuffer(1),
      "2.25.2": new ArrayBuffer(1),
    });

    const { result, unmount } = renderHook(() =>
      useStackImageIds(store, series),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      imageIds: ["dicomfile:0", "dicomfile:1"],
    });
    expect(store.getFile).toHaveBeenNthCalledWith(1, "2.25.1");
    unmount();
    await waitFor(() =>
      expect(released().sort()).toEqual(["dicomfile:0", "dicomfile:1"]),
    );
  });

  it("멀티프레임 파일은 한 번만 등록하고 프레임별 imageId 를 만든다", async () => {
    mocks.register.mockResolvedValue("dicomfile:5");
    const series = seriesOf(
      instance("2.25.3", 0, {
        numberOfFrames: 2,
        frameKind: "temporal",
        imagePositionPatient: undefined,
      }),
    );

    const store = storeWith({ "2.25.3": new ArrayBuffer(1) });
    const { result } = renderHook(() => useStackImageIds(store, series));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({
      status: "ready",
      imageIds: ["dicomfile:5?frame=1", "dicomfile:5?frame=2"],
    });
  });

  it("중간 등록이 실패하면 오류를 보이고 이미 등록한 파일을 해제한다", async () => {
    mocks.register
      .mockResolvedValueOnce("dicomfile:0")
      .mockRejectedValueOnce(new Error("decode worker 실패"));
    const series = seriesOf(instance("2.25.1", 0), instance("2.25.2", 5));

    const store = storeWith({
      "2.25.1": new ArrayBuffer(1),
      "2.25.2": new ArrayBuffer(1),
    });
    const { result } = renderHook(() => useStackImageIds(store, series));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "decode worker 실패",
    });
    await waitFor(() => expect(released()).toEqual(["dicomfile:0"]));
  });

  it("원본 파일이 저장소에 없으면 SOP UID 와 함께 오류를 보이고 이미 등록한 파일을 해제한다", async () => {
    mocks.register.mockResolvedValue("dicomfile:0");
    const series = seriesOf(instance("2.25.1", 0), instance("2.25.2", 5));

    const store = storeWith({ "2.25.1": new ArrayBuffer(1) });
    const { result } = renderHook(() => useStackImageIds(store, series));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "원본 파일이 로컬 저장소에 없습니다: 2.25.2",
    });
    await waitFor(() => expect(released()).toEqual(["dicomfile:0"]));
  });

  it("시리즈가 바뀌면 이전 시리즈 등록을 해제하고 이전 결과를 보여 주지 않는다", async () => {
    let next = 0;
    mocks.register.mockImplementation(async () => `dicomfile:${next++}`);
    const store = storeWith({
      "2.25.1": new ArrayBuffer(1),
      "2.25.9": new ArrayBuffer(1),
    });
    const first = seriesOf(instance("2.25.1", 0));
    const second = seriesOf(
      instance("2.25.9", 0, { seriesInstanceUid: "2.25.11" }),
    );

    const { result, rerender } = renderHook(
      ({ series }) => useStackImageIds(store, series),
      {
        initialProps: { series: first },
      },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ series: second });
    expect(result.current.status).toBe("loading");
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        imageIds: ["dicomfile:1"],
      }),
    );
    expect(released()).toEqual(["dicomfile:0"]);
  });

  it("등록 대기 중 화면을 떠나면 늦게 끝난 등록도 해제하고 상태를 바꾸지 않는다", async () => {
    let complete!: (id: string) => void;
    mocks.register.mockReturnValue(
      new Promise<string>((resolve) => (complete = resolve)),
    );
    const series = seriesOf(instance("2.25.1", 0));
    const store = storeWith({ "2.25.1": new ArrayBuffer(1) });
    const { result, unmount } = renderHook(() =>
      useStackImageIds(store, series),
    );
    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => complete("dicomfile:3"));

    await waitFor(() => expect(released()).toContain("dicomfile:3"));
    expect(result.current.status).toBe("loading");
  });
});
