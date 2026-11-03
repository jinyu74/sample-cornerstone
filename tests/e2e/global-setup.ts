import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ctStack,
  jpegLsImage,
  multiframeSpatial,
  mrStack,
  nonDicom,
  otherStudyImage,
  singleImage,
} from "../fixtures/dicom/scenarios";

export const FIXTURE_DIR = path.join(import.meta.dirname, ".fixtures");

/** E2E 에서 업로드할 합성 DICOM 파일을 디스크에 쓴다(실제 환자 데이터 아님). */
export default async function globalSetup() {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
  const groups = {
    single: [await singleImage()],
    stack: await ctStack(),
    jpegls: [await jpegLsImage()],
    multiframe: [await multiframeSpatial()],
    invalid: [nonDicom()],
    mr: await mrStack(),
    uncalibrated: [await otherStudyImage()],
  };
  for (const [group, files] of Object.entries(groups)) {
    const dir = path.join(FIXTURE_DIR, group);
    await mkdir(dir, { recursive: true });
    for (const file of files)
      await writeFile(path.join(dir, file.name), file.bytes);
  }
}
