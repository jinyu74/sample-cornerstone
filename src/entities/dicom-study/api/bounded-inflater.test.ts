// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildSyntheticDicom, TS } from "@tests/fixtures/dicom/synthetic-dicom";

import { createBoundedInflater } from "./bounded-inflater";
import { parseDicomFile } from "./parse-dicom-file";

/**
 * 감독 지적(이슈 #7): dicom-parser 의 Node 경로는 deflate 데이터셋을 상한 없이 inflateRawSync 로 푼다.
 * 서버는 작은 본문이 거대하게 팽창하지 않도록 상한 있는 inflater 를 주입한다(브라우저 경로는 그대로).
 */
async function deflated(rows: number, frames = 1) {
  return buildSyntheticDicom({
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.2",
    sopInstanceUid: "2.25.3",
    transferSyntaxUid: TS.deflatedExplicitLittle,
    rows,
    columns: rows,
    frames,
    pixel: () => 0,
  });
}

describe("createBoundedInflater: 서버 deflate 해제 상한", () => {
  it("상한 안의 deflate DICOM 은 메타데이터를 그대로 읽는다", async () => {
    const bytes = await deflated(32);
    const parsed = parseDicomFile(bytes, {
      inflater: createBoundedInflater(1024 * 1024),
    });
    expect(parsed).toMatchObject({
      ok: true,
      metadata: {
        sopInstanceUid: "2.25.3",
        transferSyntaxUid: TS.deflatedExplicitLittle,
        rows: 32,
      },
    });
  });

  it("작은 본문이 상한보다 크게 팽창하면 풀지 않고 inflated-too-large 로 거부한다", async () => {
    // 512×512×8 프레임 16비트 0 = 4MiB 로 팽창하지만 압축본은 수 KB
    const bytes = await deflated(512, 8);
    expect(bytes.byteLength).toBeLessThan(64 * 1024);
    expect(
      parseDicomFile(bytes, { inflater: createBoundedInflater(1024 * 1024) }),
    ).toMatchObject({
      ok: false,
      reason: "inflated-too-large",
    });
  });

  it("손상된 deflate 데이터는 parse-error 다", async () => {
    const bytes = await deflated(32);
    const broken = bytes.slice(0, bytes.length - 20);
    broken.fill(0xff, broken.length - 40);
    expect(
      parseDicomFile(broken, { inflater: createBoundedInflater(1024 * 1024) }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("옵션 없이 부르는 기존 호출(브라우저 가져오기)은 동작이 바뀌지 않는다", async () => {
    const bytes = await buildSyntheticDicom({
      studyInstanceUid: "2.25.1",
      seriesInstanceUid: "2.25.2",
      sopInstanceUid: "2.25.4",
    });
    expect(parseDicomFile(bytes)).toMatchObject({ ok: true });
  });
});
