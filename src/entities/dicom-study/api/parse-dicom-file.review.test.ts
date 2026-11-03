import { expect, it } from "vitest";

import { buildSyntheticDicom } from "../../../../tests/fixtures/dicom/synthetic-dicom";

import { parseDicomFile } from "./parse-dicom-file";

it("서로 다른 프레임 방향을 첫 프레임 방향으로 대체해 공간 스택으로 분류하지 않는다", async () => {
  const bytes = await buildSyntheticDicom({
    studyInstanceUid: "2.25.801",
    seriesInstanceUid: "2.25.802",
    sopInstanceUid: "2.25.803",
    frames: 2,
    perFrameFunctionalGroups: [
      {
        position: [0, 0, 0],
        orientation: [1, 0, 0, 0, 1, 0],
        pixelSpacing: [0.5, 0.5],
      },
      {
        position: [0, 0, 5],
        orientation: [0, 1, 0, 0, 0, 1],
        pixelSpacing: [1, 1],
      },
    ],
  });
  const result = parseDicomFile(bytes);
  if (result.ok) expect(result.metadata.frameKind).not.toBe("spatial");
  else expect(result.reason).not.toBe("parse-error");
});
