import type { StudyGroup, StudyListItem, WorkStatus } from "./types";

const DICOM_DATE = /^(\d{4})(\d{2})(\d{2})$/;

/** DICOM DA(YYYYMMDD)를 YYYY.MM.DD 로 표시한다. 형식이 맞지 않으면 원문을 그대로 둔다. */
export function formatDicomDate(value: string | undefined): string {
  if (!value) return "—";
  const match = DICOM_DATE.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const valid =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day);
  return valid ? `${year}.${month}.${day}` : value;
}

export function toStudyListItem(
  study: StudyGroup,
  workStatus: WorkStatus,
): StudyListItem {
  return {
    studyInstanceUid: study.studyInstanceUid,
    studyDate: study.studyDate,
    displayDate: formatDicomDate(study.studyDate),
    identifier:
      study.accessionNumber ??
      study.studyId ??
      study.patientId ??
      study.studyInstanceUid,
    description: study.studyDescription,
    modalities: study.modalities,
    seriesCount: study.series.length,
    workStatus,
  };
}
