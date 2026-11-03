import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { groupStudies, type DicomStore } from "@/entities/dicom-study";

import { useSeriesThumbnail } from "./use-series-thumbnail";

const mocks = vi.hoisted(() => ({
  register: vi.fn<() => Promise<string>>(),
  release: vi.fn().mockResolvedValue(undefined),
  load: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/viewer", () => ({
  registerDicomFile: mocks.register,
  releaseDicomFiles: mocks.release,
  frameImageId: (id: string) => id,
  initCornerstone: async () => ({
    core: { utilities: { loadImageToCanvas: mocks.load } },
  }),
}));

it("썸네일 등록이 끝나기 전에 떠나도 늦게 등록된 파일을 해제하고 디코딩하지 않는다", async () => {
  let finish!: (id: string) => void;
  mocks.register.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const store: DicomStore = {
    addInstance: vi.fn(),
    getInstance: vi.fn(),
    getFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    listInstances: vi.fn(),
    listSeriesInstances: vi.fn(),
    close: vi.fn(),
  };
  const series = groupStudies([
    {
      sopInstanceUid: "2.25.901",
      sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
      studyInstanceUid: "2.25.902",
      seriesInstanceUid: "2.25.903",
      transferSyntaxUid: "1.2.840.10008.1.2.1",
      rows: 2,
      columns: 2,
      numberOfFrames: 1,
      frameKind: "single",
    },
  ])[0]!.series[0]!;
  const { unmount } = renderHook(() => {
    const thumbnail = useSeriesThumbnail(store, series);
    thumbnail.canvasRef.current = document.createElement("canvas");
    return thumbnail;
  });
  await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
  unmount();
  await act(async () => {
    finish("dicomfile:late-thumbnail");
  });
  expect(mocks.release).toHaveBeenCalledWith(
    ["dicomfile:late-thumbnail"],
    expect.any(Array),
  );
  expect(mocks.load).not.toHaveBeenCalled();
});
