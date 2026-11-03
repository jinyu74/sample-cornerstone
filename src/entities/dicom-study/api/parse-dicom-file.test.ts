import { describe, expect, it } from "vitest";

import {
  ctStack,
  jpegLsImage,
  missingSeriesUid,
  multiframeMissingNumberOfFrames,
  multiframePerFrameGeometry,
  multiframeSpatial,
  multiframeTemporal,
  multiframeTemporalRepeatedPosition,
  nonDicom,
  singleImage,
  UID,
  unsupportedTransferSyntax,
} from "@tests/fixtures/dicom/scenarios";
import { buildSyntheticDicom } from "@tests/fixtures/dicom/synthetic-dicom";

import { parseDicomFile } from "./parse-dicom-file";

describe("parseDicomFile (S2-1, S2-3, S2-5)", () => {
  it("단일 영상의 UID·기하·보정 정보를 정규화한다", async () => {
    const { bytes } = await singleImage();

    const result = parseDicomFile(bytes);

    expect(result).toEqual({
      ok: true,
      metadata: expect.objectContaining({
        studyInstanceUid: UID.studyA,
        seriesInstanceUid: UID.seriesSingle,
        sopInstanceUid: "2.25.400001",
        sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
        transferSyntaxUid: "1.2.840.10008.1.2.1",
        modality: "CT",
        studyDate: "20260101",
        accessionNumber: "SYN-ACC",
        patientId: "SYN-0001",
        seriesNumber: 1,
        instanceNumber: 1,
        frameOfReferenceUid: UID.forA,
        rows: 32,
        columns: 32,
        numberOfFrames: 1,
        imagePositionPatient: [0, 0, 0],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        pixelSpacing: [0.5, 0.5],
        frameKind: "single",
      }),
    });
  });

  it("확장자가 아닌 내용으로 판단한다: 확장자 없는 DICOM 은 성공, .dcm 이름의 비DICOM 은 실패", async () => {
    const cine = await multiframeTemporal();
    const fake = nonDicom();
    expect(cine.name).not.toContain(".");
    expect(fake.name.endsWith(".dcm")).toBe(true);

    expect(parseDicomFile(cine.bytes).ok).toBe(true);
    expect(parseDicomFile(fake.bytes)).toEqual({
      ok: false,
      reason: "not-dicom",
      detail: expect.any(String),
    });
  });

  it("Enhanced 멀티프레임: 방향·픽셀 간격은 Shared 기능 그룹, 위치는 PerFrame 기능 그룹에서 읽는다", async () => {
    const { bytes } = await multiframeSpatial();

    const result = parseDicomFile(bytes);

    expect(result.ok && result.metadata).toMatchObject({
      numberOfFrames: 3,
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [0.8, 0.9],
      framePositions: [
        [0, 0, 10],
        [0, 0, 0],
        [0, 0, 5],
      ],
      frameKind: "spatial",
    });
    expect(result.ok && result.metadata.imagePositionPatient).toBeUndefined();
  });

  it("방향·픽셀 간격이 PerFrame 기능 그룹에만 있어도 읽는다", async () => {
    const { bytes } = await multiframePerFrameGeometry();

    const result = parseDicomFile(bytes);

    expect(result.ok && result.metadata).toMatchObject({
      numberOfFrames: 2,
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [0.6, 0.6],
      frameKind: "spatial",
    });
  });

  it("PerFrame 방향이 프레임마다 다르면 대표 방향을 정하지 않고 공간 스택으로 분류하지 않는다", async () => {
    const bytes = await buildSyntheticDicom({
      studyInstanceUid: "2.25.1",
      seriesInstanceUid: "2.25.2",
      sopInstanceUid: "2.25.3",
      frames: 2,
      perFrameFunctionalGroups: [
        { position: [0, 0, 0], orientation: [1, 0, 0, 0, 1, 0] },
        { position: [0, 0, 5], orientation: [0, 1, 0, 0, 0, 1] },
      ],
    });

    const result = parseDicomFile(bytes);

    expect(result.ok).toBe(true);
    expect(
      result.ok && result.metadata.imageOrientationPatient,
    ).toBeUndefined();
    expect(result.ok && result.metadata.frameOrientations).toEqual([
      [1, 0, 0, 0, 1, 0],
      [0, 1, 0, 0, 0, 1],
    ]);
    expect(result.ok && result.metadata.frameKind).toBe("unknown");
  });

  it("PerFrame 픽셀 간격이 프레임마다 다르면 1번 프레임 값으로 대체하지 않는다", async () => {
    const bytes = await buildSyntheticDicom({
      studyInstanceUid: "2.25.1",
      seriesInstanceUid: "2.25.2",
      sopInstanceUid: "2.25.3",
      frames: 2,
      perFrameFunctionalGroups: [
        {
          position: [0, 0, 0],
          orientation: [1, 0, 0, 0, 1, 0],
          pixelSpacing: [0.5, 0.5],
        },
        {
          position: [0, 0, 5],
          orientation: [1, 0, 0, 0, 1, 0],
          pixelSpacing: [1, 1],
        },
      ],
    });

    const result = parseDicomFile(bytes);

    expect(result.ok && result.metadata.pixelSpacing).toBeUndefined();
    expect(result.ok && result.metadata.framePixelSpacings).toEqual([
      [0.5, 0.5],
      [1, 1],
    ]);
    expect(result.ok && result.metadata.frameKind).toBe("spatial");
  });

  it("위치가 반복되는 시간 프레임은 temporal 로 분류한다", async () => {
    const { bytes } = await multiframeTemporalRepeatedPosition();

    const result = parseDicomFile(bytes);

    expect(result.ok && result.metadata.frameKind).toBe("temporal");
    expect(result.ok && result.metadata.numberOfFrames).toBe(3);
  });

  it("단일 프레임에서 NumberOfFrames 가 없으면 1 프레임", async () => {
    const [first] = await ctStack();

    const result = parseDicomFile(first!.bytes);

    expect(result.ok && result.metadata.numberOfFrames).toBe(1);
  });

  it("NumberOfFrames 가 없는데 프레임별 기능 그룹이 여러 개면 프레임 수 불일치로 실패한다", async () => {
    const { bytes } = await multiframeMissingNumberOfFrames();

    expect(parseDicomFile(bytes)).toEqual({
      ok: false,
      reason: "invalid-frame-count",
      detail: expect.stringContaining("3"),
    });
  });

  it("NumberOfFrames 가 숫자가 아니거나 1 미만이면 실패한다", async () => {
    const bytes = await buildSyntheticDicom({
      studyInstanceUid: "2.25.1",
      seriesInstanceUid: "2.25.2",
      sopInstanceUid: "2.25.3",
      frames: 2,
    });
    // NumberOfFrames 값 "2 " 를 "0 " 으로 바꾼다.
    const text = new TextDecoder("latin1").decode(bytes);
    const index = text.indexOf("(\u0000\u0008\u0000IS");
    expect(index).toBeGreaterThan(0);
    const broken = bytes.slice();
    broken[index + 8] = "0".charCodeAt(0);

    expect(parseDicomFile(broken)).toMatchObject({
      ok: false,
      reason: "invalid-frame-count",
    });
  });

  it("JPEG-LS 압축 영상은 지원 transfer syntax 로 받아들인다", async () => {
    const { bytes } = await jpegLsImage();

    const result = parseDicomFile(bytes);

    expect(result.ok && result.metadata.transferSyntaxUid).toBe(
      "1.2.840.10008.1.2.4.80",
    );
  });

  it("디코더가 지원하지 않는 transfer syntax 는 실패 이유와 UID 를 알린다", async () => {
    const { bytes } = await unsupportedTransferSyntax();

    expect(parseDicomFile(bytes)).toEqual({
      ok: false,
      reason: "unsupported-transfer-syntax",
      detail: "1.2.840.10008.1.2.4.100",
    });
  });

  it("필수 UID 가 없으면 어떤 UID 가 없는지 알린다", async () => {
    const { bytes } = await missingSeriesUid();

    expect(parseDicomFile(bytes)).toEqual({
      ok: false,
      reason: "missing-uid",
      detail: "SeriesInstanceUID",
    });
  });

  it("픽셀 데이터가 없으면 실패한다", async () => {
    const bytes = await buildSyntheticDicom({
      studyInstanceUid: "2.25.1",
      seriesInstanceUid: "2.25.2",
      sopInstanceUid: "2.25.3",
      omit: ["pixelData"],
    });

    expect(parseDicomFile(bytes)).toMatchObject({
      ok: false,
      reason: "no-pixel-data",
    });
  });

  it("잘린 파일은 parse-error 로 실패하고 예외를 던지지 않는다", async () => {
    const { bytes } = await singleImage();

    const result = parseDicomFile(bytes.slice(0, 300));

    expect(result).toMatchObject({ ok: false, reason: "parse-error" });
  });
});
