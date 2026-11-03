import { compareUid } from "./compare-uid";
import { orderStackImages } from "./order-stack";
import type {
  DicomInstanceMetadata,
  SeriesGroup,
  StackItem,
  StudyGroup,
} from "./types";

/**
 * 영상 메타데이터를 검사 → 시리즈 → 정렬된 스택으로 묶는다.
 * 시리즈는 (StudyInstanceUID, SeriesInstanceUID) 조합으로 식별해 다른 검사의 영상을 섞지 않는다.
 * 검사·시리즈 속성은 SOP UID 가 가장 작은 영상에서 가져와 입력 순서와 무관하게 결정한다.
 */
export function groupStudies(
  instances: readonly DicomInstanceMetadata[],
): StudyGroup[] {
  const byStudy = new Map<string, Map<string, DicomInstanceMetadata[]>>();
  for (const instance of [...instances].sort((a, b) =>
    compareUid(a.sopInstanceUid, b.sopInstanceUid),
  )) {
    const seriesMap =
      byStudy.get(instance.studyInstanceUid) ??
      new Map<string, DicomInstanceMetadata[]>();
    byStudy.set(instance.studyInstanceUid, seriesMap);
    const list = seriesMap.get(instance.seriesInstanceUid) ?? [];
    seriesMap.set(instance.seriesInstanceUid, list);
    list.push(instance);
  }

  const studies: StudyGroup[] = [];
  for (const [studyInstanceUid, seriesMap] of byStudy) {
    const series = [...seriesMap.values()].map(buildSeries).sort(compareSeries);
    const first = series[0]!.instances[0]!;
    studies.push({
      studyInstanceUid,
      studyDate: first.studyDate,
      studyTime: first.studyTime,
      studyDescription: first.studyDescription,
      studyId: first.studyId,
      accessionNumber: first.accessionNumber,
      patientId: first.patientId,
      modalities: [
        ...new Set(
          series.flatMap((item) => (item.modality ? [item.modality] : [])),
        ),
      ].sort(),
      series,
    });
  }
  return studies.sort(compareStudies);
}

function buildSeries(instances: DicomInstanceMetadata[]): SeriesGroup {
  const first = instances[0]!;
  const items = instances.flatMap(toStackItems);
  return {
    studyInstanceUid: first.studyInstanceUid,
    seriesInstanceUid: first.seriesInstanceUid,
    modality: first.modality,
    seriesNumber: first.seriesNumber,
    seriesDescription: first.seriesDescription,
    frameOfReferenceUid: first.frameOfReferenceUid,
    instances,
    instanceCount: instances.length,
    frameCount: items.length,
    stack: orderStackImages(items),
  };
}

/**
 * 영상을 스택 항목으로 펼친다.
 * 공간 멀티프레임만 프레임별 위치를 쓰고, 시간·미분류 멀티프레임은 위치 없이 프레임 번호 순서를 따른다.
 */
function toStackItems(instance: DicomInstanceMetadata): StackItem[] {
  const base = {
    sopInstanceUid: instance.sopInstanceUid,
    seriesInstanceUid: instance.seriesInstanceUid,
    instanceNumber: instance.instanceNumber,
    imageOrientationPatient: instance.imageOrientationPatient,
    frameKind: instance.frameKind,
  };
  if (instance.numberOfFrames <= 1) {
    return [{ ...base, imagePositionPatient: instance.imagePositionPatient }];
  }
  return Array.from({ length: instance.numberOfFrames }, (_, index) => ({
    ...base,
    frameNumber: index + 1,
    // 프레임별 방향이 있으면 그 프레임 방향을 넘겨 정렬이 방향 불일치를 판단하게 한다.
    imageOrientationPatient:
      instance.frameOrientations?.[index] ?? instance.imageOrientationPatient,
    imagePositionPatient:
      instance.frameKind === "spatial"
        ? instance.framePositions?.[index]
        : undefined,
  }));
}

function compareStudies(a: StudyGroup, b: StudyGroup): number {
  // 날짜가 있는 검사를 먼저, 최근 날짜 순. 같으면 UID 순.
  if (a.studyDate !== b.studyDate) {
    if (!a.studyDate) return 1;
    if (!b.studyDate) return -1;
    return a.studyDate < b.studyDate ? 1 : -1;
  }
  return compareUid(a.studyInstanceUid, b.studyInstanceUid);
}

function compareSeries(a: SeriesGroup, b: SeriesGroup): number {
  const left = a.seriesNumber ?? Number.POSITIVE_INFINITY;
  const right = b.seriesNumber ?? Number.POSITIVE_INFINITY;
  if (left !== right) return left < right ? -1 : 1;
  return compareUid(a.seriesInstanceUid, b.seriesInstanceUid);
}
