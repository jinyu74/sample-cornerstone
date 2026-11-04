import {
  type CatalogStudySummary,
  compareCatalogStudy,
  compareUid,
  formatDicomDate,
  type ListWorkStatus,
  type OriginalsView,
  type StudyGroup,
  toStudyListItem,
  type WorkStatus,
} from "@/entities/dicom-study";
import type { CatalogSyncState } from "@/features/sync-catalog";
import type { StudyTableRow, SyncView } from "@/widgets/study-table";

export interface LocalCatalog {
  status: "loading" | "ready" | "error";
  studies: readonly StudyGroup[];
  /** 검사 UID → (SOP UID → digest) */
  manifest: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

export interface BuildCatalogRowsInput {
  server:
    | { status: "ready"; studies: readonly CatalogStudySummary[] }
    | { status: "unavailable" };
  local: LocalCatalog;
  works: {
    status: "loading" | "ready" | "error";
    statuses: ReadonlyMap<string, WorkStatus>;
  };
  sync: ReadonlyMap<string, CatalogSyncState>;
}

const EMPTY = new Map<string, string>();

/**
 * 서버 목록(계정 메타데이터)과 이 브라우저 원본·작업 기록·이번 화면의 반영 상태를 한 목록으로 합친다.
 * - 이 브라우저를 확인하기 전(최초 HTML)에는 서버 행만, 원본·작업·반영을 "확인 중"으로 둔다.
 * - 작업 결과는 이 브라우저에만 있으므로, 원본도 기록도 없는 서버 검사는 미작업이라 단정하지 않는다.
 * - 반영 상태 우선순위: 이번 화면의 진행 중·실패 > 서버 기록과 내용 불일치(충돌) > 서버/로컬 비교 계산값.
 * - 시리즈 수는 서버 목록과 이 브라우저 원본의 시리즈 합집합(UID 기준)이다.
 * - 이 브라우저 원본이 있으면 기존 목록과 같은 식별자 규칙(patientId 포함)을 쓴다. 서버만 있는 검사는
 *   patientId 를 서버에 두지 않으므로 accession → study ID → UID 순이다.
 */
export function buildCatalogRows({
  server,
  local,
  works,
  sync,
}: BuildCatalogRowsInput): StudyTableRow[] {
  const serverStudies =
    server.status === "ready"
      ? new Map(server.studies.map((study) => [study.studyInstanceUid, study]))
      : new Map<string, CatalogStudySummary>();
  const localStudies = new Map(
    local.status === "ready"
      ? local.studies.map((study) => [study.studyInstanceUid, study])
      : [],
  );
  const uids = new Set([...serverStudies.keys(), ...localStudies.keys()]);

  const rows: StudyTableRow[] = [];
  for (const uid of uids) {
    const remote = serverStudies.get(uid);
    const own = localStudies.get(uid);
    const checking = local.status === "loading";

    let originals: OriginalsView;
    let unsynced = 0;
    if (checking) originals = { kind: "checking" };
    else if (local.status === "error") originals = { kind: "unreadable" };
    else {
      const comparison = compareCatalogStudy(
        remote?.instances ?? [],
        local.manifest.get(uid) ?? EMPTY,
      );
      originals = comparison.originals;
      unsynced = comparison.unsynced;
    }

    // 열기·미작업 판정은 서버 기록과의 일치가 아니라 이 브라우저에 실제 원본이 있는지로 한다
    const localOriginals = checking ? 0 : (local.manifest.get(uid)?.size ?? 0);
    const hasOriginals = localOriginals > 0;
    const recorded = works.statuses.get(uid);
    const workStatus: ListWorkStatus =
      checking || works.status === "loading"
        ? "checking"
        : (recorded ??
          (hasOriginals && works.status === "ready" ? "untouched" : "unknown"));

    const attempt = sync.get(uid);
    let syncView: SyncView;
    if (attempt && attempt.kind !== "synced") syncView = attempt;
    else if (checking) syncView = { kind: "checking" };
    else if (server.status !== "ready") syncView = { kind: "unknown" };
    // 같은 SOP UID 의 내용이 서버 기록과 다르면 반영할 수 없다. 이번 화면의 요청 결과가 없어져도(새로고침) 유지한다
    else if (originals.kind === "mismatch")
      syncView = { kind: "failed", reason: "conflict", conflict: "instance" };
    else if (unsynced > 0) syncView = { kind: "unsynced", count: unsynced };
    else syncView = { kind: "synced" };

    const base = own
      ? toStudyListItem(own, "untouched")
      : {
          studyInstanceUid: uid,
          studyDate: remote!.studyDate,
          displayDate: formatDicomDate(remote!.studyDate),
          identifier: remote!.accessionNumber ?? remote!.studyId ?? uid,
          description: remote!.studyDescription,
          modalities: remote!.modalities,
          seriesCount: remote!.seriesCount,
        };
    rows.push({
      ...base,
      seriesCount: seriesUnion(remote, own),
      localOriginals,
      workStatus,
      originals,
      sync: syncView,
    });
  }
  return rows
    .map((row) => {
      // 값이 없는 선택 필드는 키를 두지 않는다(직렬화·비교 안정)
      const clean = { ...row };
      if (clean.description === undefined) delete clean.description;
      if (clean.studyDate === undefined) delete clean.studyDate;
      return clean;
    })
    .sort(compareRows);
}

/** 서버 목록과 이 브라우저 원본의 시리즈 합집합(UID 기준) 수 */
function seriesUnion(
  remote: CatalogStudySummary | undefined,
  own: StudyGroup | undefined,
): number {
  const uids = new Set(remote?.seriesInstanceUids ?? []);
  for (const series of own?.series ?? []) uids.add(series.seriesInstanceUid);
  return uids.size;
}

function compareRows(a: StudyTableRow, b: StudyTableRow): number {
  if (a.studyDate !== b.studyDate) {
    if (!a.studyDate) return 1;
    if (!b.studyDate) return -1;
    return a.studyDate < b.studyDate ? 1 : -1;
  }
  return compareUid(a.studyInstanceUid, b.studyInstanceUid);
}
