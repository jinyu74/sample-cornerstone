import {
  DicomStoreError,
  parseDicomFile,
  type DicomInstanceMetadata,
  type StoredInstanceRecord,
} from "@/entities/dicom-study";
import { sha256Hex } from "@/shared/lib/digest";

import type {
  ImportDependencies,
  ImportFailureReason,
  ImportFileResult,
  ImportReport,
  ImportSource,
  ImportStatus,
} from "./types";

/**
 * 파일을 순서대로 읽고 파싱해 저장한다. 실패한 파일이 있어도 나머지를 계속 처리한다.
 * 같은 SOP Instance UID 는 원본 바이트 SHA-256 으로 비교해 같으면 duplicate,
 * 다르면 conflict 로 보고하며 기존 데이터를 덮어쓰지 않는다.
 */
export async function importDicomFiles(
  sources: readonly ImportSource[],
  { store, onProgress, now = () => new Date() }: ImportDependencies,
): Promise<ImportReport> {
  const results: ImportFileResult[] = [];
  /** 이번 가져오기에서 저장한 SOP UID → digest (저장소 조회 전 일괄 내 충돌 판정) */
  const batchDigests = new Map<string, string>();

  for (const source of sources) {
    const result = await importOne(source);
    results.push(result);
    onProgress?.({
      completed: results.length,
      total: sources.length,
      latest: result,
    });
  }

  return { results, summary: summarize(results) };

  async function importOne(source: ImportSource): Promise<ImportFileResult> {
    let bytes: ArrayBuffer;
    try {
      bytes = await source.read();
    } catch (error) {
      return failed(source.name, "read-error", describe(error));
    }

    const parsed = parseDicomFile(new Uint8Array(bytes));
    if (!parsed.ok) return failed(source.name, parsed.reason, parsed.detail);
    const { metadata } = parsed;
    const identity = identify(source.name, metadata);

    let digest: string;
    try {
      digest = await sha256Hex(bytes);
    } catch (error) {
      return failed(source.name, "read-error", describe(error));
    }

    const existing = await existingDigest(metadata.sopInstanceUid);
    if (existing !== undefined)
      return compareExisting(identity, existing, digest);

    const record: StoredInstanceRecord = {
      sopInstanceUid: metadata.sopInstanceUid,
      studyInstanceUid: metadata.studyInstanceUid,
      seriesInstanceUid: metadata.seriesInstanceUid,
      contentDigest: digest,
      byteLength: bytes.byteLength,
      importedAt: now().toISOString(),
      metadata,
    };
    try {
      await store.addInstance(record, bytes);
    } catch (error) {
      if (error instanceof DicomStoreError && error.code === "already-exists") {
        // 조회와 저장 사이에 다른 탭이 저장한 경우
        const current = await existingDigest(metadata.sopInstanceUid);
        if (current !== undefined)
          return compareExisting(identity, current, digest);
      }
      return { ...identity, ...storageFailure(error) };
    }
    batchDigests.set(metadata.sopInstanceUid, digest);
    return { ...identity, status: "imported" };
  }

  async function existingDigest(
    sopInstanceUid: string,
  ): Promise<string | undefined> {
    const inBatch = batchDigests.get(sopInstanceUid);
    if (inBatch !== undefined) return inBatch;
    try {
      return (await store.getInstance(sopInstanceUid))?.contentDigest;
    } catch {
      // 조회 실패는 저장 단계에서 다시 드러난다.
      return undefined;
    }
  }
}

function identify(fileName: string, metadata: DicomInstanceMetadata) {
  return {
    fileName,
    sopInstanceUid: metadata.sopInstanceUid,
    studyInstanceUid: metadata.studyInstanceUid,
    seriesInstanceUid: metadata.seriesInstanceUid,
  };
}

function compareExisting(
  identity: ReturnType<typeof identify>,
  existing: string,
  incoming: string,
): ImportFileResult {
  return existing === incoming
    ? {
        ...identity,
        status: "duplicate",
        detail: "같은 SOP Instance UID·같은 내용이 이미 있습니다",
      }
    : {
        ...identity,
        status: "conflict",
        detail:
          "같은 SOP Instance UID 에 다른 내용이 있습니다. 기존 파일을 유지했습니다",
      };
}

function storageFailure(error: unknown): {
  status: "failed";
  reason: ImportFailureReason;
  detail: string;
} {
  const detail = describe(error);
  if (error instanceof DicomStoreError) {
    if (error.code === "quota-exceeded")
      return { status: "failed", reason: "storage-quota-exceeded", detail };
    if (error.code === "unavailable")
      return { status: "failed", reason: "storage-unavailable", detail };
  }
  return { status: "failed", reason: "storage-error", detail };
}

function failed(
  fileName: string,
  reason: ImportFailureReason,
  detail: string,
): ImportFileResult {
  return { fileName, status: "failed", reason, detail };
}

function summarize(
  results: readonly ImportFileResult[],
): Record<ImportStatus, number> {
  const summary: Record<ImportStatus, number> = {
    imported: 0,
    duplicate: 0,
    conflict: 0,
    failed: 0,
  };
  for (const result of results) summary[result.status] += 1;
  return summary;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
