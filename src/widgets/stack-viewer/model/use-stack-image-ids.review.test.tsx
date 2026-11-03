import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { groupStudies, type DicomStore } from "@/entities/dicom-study";

import { useStackImageIds } from "./use-stack-image-ids";

const mocks = vi.hoisted(() => ({
  register: vi.fn<() => Promise<string>>(),
  released: [] as string[][],
}));

vi.mock("@/shared/viewer", () => ({
  registerDicomFile: mocks.register,
  frameImageId: (id: string) => id,
  releaseDicomFiles: async (ids: string[]) => {
    mocks.released.push([...ids]);
  },
}));

it("등록 완료 전 화면을 떠나도 늦게 등록된 원본 파일을 해제한다", async () => {
  let complete!: (id: string) => void;
  mocks.register.mockReturnValue(
    new Promise<string>((resolve) => {
      complete = resolve;
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
  const { unmount } = renderHook(() => useStackImageIds(store, series));
  await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
  unmount();
  await act(async () => {
    complete("dicomfile:7");
  });
  expect(mocks.released.flat()).toContain("dicomfile:7");
});
