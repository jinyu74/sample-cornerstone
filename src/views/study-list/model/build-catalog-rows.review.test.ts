import { describe, expect, it } from "vitest";

import { groupStudies } from "@/entities/dicom-study";

import { buildCatalogRows } from "./build-catalog-rows";

describe("새로고침 뒤에도 유지되는 원본 충돌 안내", () => {
  it("같은 SOP의 digest가 다르면 직전 요청 상태가 없어져도 반영 성공으로 표시하지 않는다", () => {
    const study = "2.25.8801";
    const series = "2.25.8802";
    const sop = "2.25.8803";
    const remoteDigest = "1".repeat(64);
    const localDigest = "2".repeat(64);
    const [row] = buildCatalogRows({
      server: {
        status: "ready",
        studies: [
          {
            studyInstanceUid: study,
            modalities: ["CT"],
            seriesCount: 1,
            seriesInstanceUids: [series],
            instanceCount: 1,
            instances: [{ sopInstanceUid: sop, contentDigest: remoteDigest }],
          },
        ],
      },
      local: {
        status: "ready",
        studies: groupStudies([
          {
            studyInstanceUid: study,
            seriesInstanceUid: series,
            sopInstanceUid: sop,
            sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
            transferSyntaxUid: "1.2.840.10008.1.2.1",
            rows: 1,
            columns: 1,
            numberOfFrames: 1,
            frameKind: "single",
          },
        ]),
        manifest: new Map([[study, new Map([[sop, localDigest]])]]),
      },
      works: { status: "ready", statuses: new Map() },
      // 새로고침 후 메모리에만 있던 마지막 sync 응답은 없다.
      sync: new Map(),
    });
    expect(row?.originals.kind).toBe("mismatch");
    expect(row?.sync).toMatchObject({ kind: "failed", reason: "conflict" });
  });
});
