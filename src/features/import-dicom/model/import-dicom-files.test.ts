import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createIndexedDbDicomStore,
  DicomStoreError,
  groupStudies,
  type DicomStore,
} from "@/entities/dicom-study";
import {
  conflictingSingleImage,
  ctStack,
  type FixtureFile,
  missingSeriesUid,
  multiframeSpatial,
  nonDicom,
  otherStudyImage,
  singleImage,
  UID,
  unsupportedTransferSyntax,
} from "@tests/fixtures/dicom/scenarios";

import { importDicomFiles } from "./import-dicom-files";
import type { ImportSource } from "./types";

let counter = 0;
const stores: DicomStore[] = [];

function newStore() {
  const store = createIndexedDbDicomStore({
    databaseName: `import-test-${(counter += 1)}`,
  });
  stores.push(store);
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
});

const source = ({ name, bytes }: FixtureFile): ImportSource => ({
  name,
  read: async () => bytes.slice().buffer,
});

describe("importDicomFiles (S2-1~S2-4)", () => {
  it("여러 파일을 가져와 검사·시리즈로 묶을 수 있게 저장하고 파일별 결과를 돌려준다", async () => {
    const store = newStore();
    const files = [
      ...(await ctStack()),
      await singleImage(),
      await multiframeSpatial(),
      await otherStudyImage(),
    ];

    const report = await importDicomFiles(files.map(source), { store });

    expect(report.results.map((result) => result.status)).toEqual(
      Array(files.length).fill("imported"),
    );
    expect(report.summary).toEqual({
      imported: 8,
      duplicate: 0,
      conflict: 0,
      failed: 0,
    });
    const studies = groupStudies(
      (await store.listInstances()).map((item) => item.metadata),
    );
    expect(
      studies.map((study) => [
        study.studyInstanceUid,
        study.series.map((series) => series.frameCount),
      ]),
    ).toEqual([
      [UID.studyA, [1, 5, 3]],
      [UID.studyB, [1]],
    ]);
  });

  it("같은 SOP UID·같은 바이트는 duplicate 로 건너뛴다", async () => {
    const store = newStore();
    const single = await singleImage();
    await importDicomFiles([source(single)], { store });

    const report = await importDicomFiles([source(single)], { store });

    expect(report.results).toEqual([
      expect.objectContaining({
        fileName: single.name,
        status: "duplicate",
        sopInstanceUid: "2.25.400001",
      }),
    ]);
    expect(await store.listInstances()).toHaveLength(1);
  });

  it("같은 SOP UID·다른 바이트는 conflict 로 보고하고 기존 원본을 덮어쓰지 않는다", async () => {
    const store = newStore();
    const original = await singleImage();
    await importDicomFiles([source(original)], { store });
    const before = await store.getInstance("2.25.400001");

    const report = await importDicomFiles(
      [source(await conflictingSingleImage())],
      { store },
    );

    expect(report.results[0]).toMatchObject({
      status: "conflict",
      sopInstanceUid: "2.25.400001",
    });
    expect(await store.getInstance("2.25.400001")).toEqual(before);
    expect(new Uint8Array((await store.getFile("2.25.400001"))!)).toEqual(
      original.bytes,
    );
  });

  it("한 번에 가져온 파일 사이에서도 SOP UID 충돌을 감지한다", async () => {
    const store = newStore();

    const report = await importDicomFiles(
      [
        source(await singleImage()),
        source(await conflictingSingleImage()),
        source(await singleImage()),
      ],
      { store },
    );

    expect(report.results.map((result) => result.status)).toEqual([
      "imported",
      "conflict",
      "duplicate",
    ]);
  });

  it("실패한 파일의 이유를 남기고 나머지 파일은 계속 가져온다", async () => {
    const store = newStore();
    const unreadable: ImportSource = {
      name: "locked.dcm",
      read: () => Promise.reject(new Error("NotReadableError")),
    };

    const report = await importDicomFiles(
      [
        source(nonDicom()),
        source(await unsupportedTransferSyntax()),
        source(await missingSeriesUid()),
        unreadable,
        source(await singleImage()),
      ],
      { store },
    );

    expect(
      report.results.map(({ fileName, status, reason }) => ({
        fileName,
        status,
        reason,
      })),
    ).toEqual([
      { fileName: "fake.dcm", status: "failed", reason: "not-dicom" },
      {
        fileName: "video.dcm",
        status: "failed",
        reason: "unsupported-transfer-syntax",
      },
      {
        fileName: "missing-series.dcm",
        status: "failed",
        reason: "missing-uid",
      },
      { fileName: "locked.dcm", status: "failed", reason: "read-error" },
      { fileName: "single-image", status: "imported", reason: undefined },
    ]);
    expect(report.summary).toEqual({
      imported: 1,
      duplicate: 0,
      conflict: 0,
      failed: 4,
    });
  });

  it("저장 실패는 저장 실패로 보고하고 이전에 가져온 데이터는 보존한다", async () => {
    const store = newStore();
    await importDicomFiles([source(await singleImage())], { store });
    vi.spyOn(store, "addInstance").mockRejectedValueOnce(
      new DicomStoreError("quota-exceeded", "quota"),
    );

    const report = await importDicomFiles([source(await otherStudyImage())], {
      store,
    });

    expect(report.results[0]).toMatchObject({
      status: "failed",
      reason: "storage-quota-exceeded",
    });
    expect(
      (await store.listInstances()).map((item) => item.sopInstanceUid),
    ).toEqual(["2.25.400001"]);
  });

  it("파일마다 진행 상황을 알린다", async () => {
    const store = newStore();
    const progress = vi.fn();
    const files = await ctStack();

    await importDicomFiles(files.map(source), { store, onProgress: progress });

    expect(
      progress.mock.calls.map(([event]) => [event.completed, event.total]),
    ).toEqual([
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
    expect(progress.mock.calls.at(-1)![0].latest).toMatchObject({
      status: "imported",
    });
  });
});
