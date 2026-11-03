import { type DataSet, parseDicom } from "dicom-parser";

import type { Vec3 } from "@/shared/lib/geometry";

import { classifyFrames } from "../model/classify-frames";
import type { DicomInstanceMetadata, Orientation } from "../model/types";

import type { DicomParseResult } from "./types";

/**
 * @cornerstonejs/dicom-image-loader 5.14.0 의 decodeImageFrameWorker 가 디코딩하는 transfer syntax.
 * 설치 버전의 decodeImageFrame switch 문에서 확인했다.
 */
export const SUPPORTED_TRANSFER_SYNTAXES: ReadonlySet<string> = new Set([
  "1.2.840.10008.1.2", // Implicit VR Little Endian
  "1.2.840.10008.1.2.1", // Explicit VR Little Endian
  "1.2.840.10008.1.2.2", // Explicit VR Big Endian (retired)
  "1.2.840.10008.1.2.1.99", // Deflated Explicit VR Little Endian
  "1.2.840.10008.1.2.1.98", // Encapsulated Uncompressed Explicit VR Little Endian
  "1.2.840.10008.1.2.8.1", // Deflated Image Frame Compression
  "1.2.840.10008.1.2.5", // RLE Lossless
  "1.2.840.10008.1.2.4.50", // JPEG Baseline
  "1.2.840.10008.1.2.4.51", // JPEG Extended
  "1.2.840.10008.1.2.4.53",
  "1.2.840.10008.1.2.4.55",
  "1.2.840.10008.1.2.4.57", // JPEG Lossless
  "1.2.840.10008.1.2.4.70", // JPEG Lossless SV1
  "1.2.840.10008.1.2.4.80", // JPEG-LS Lossless
  "1.2.840.10008.1.2.4.81", // JPEG-LS Near-lossless
  "1.2.840.10008.1.2.4.90", // JPEG 2000 Lossless
  "1.2.840.10008.1.2.4.91", // JPEG 2000
  "1.2.840.10008.1.2.4.201", // HTJ2K Lossless
  "1.2.840.10008.1.2.4.202", // HTJ2K Lossless RPCL
  "1.2.840.10008.1.2.4.203", // HTJ2K
  "1.2.840.10008.1.2.4.110", // JPEG XL Lossless
  "1.2.840.10008.1.2.4.111", // JPEG XL JPEG Recompression
  "1.2.840.10008.1.2.4.112", // JPEG XL
]);

const TAG = {
  transferSyntaxUid: "x00020010",
  sopClassUid: "x00080016",
  sopInstanceUid: "x00080018",
  studyDate: "x00080020",
  studyTime: "x00080030",
  accessionNumber: "x00080050",
  modality: "x00080060",
  studyDescription: "x00081030",
  seriesDescription: "x0008103e",
  patientId: "x00100020",
  frameTime: "x00181063",
  frameTimeVector: "x00181065",
  studyInstanceUid: "x0020000d",
  seriesInstanceUid: "x0020000e",
  studyId: "x00200010",
  seriesNumber: "x00200011",
  instanceNumber: "x00200013",
  imagePositionPatient: "x00200032",
  imageOrientationPatient: "x00200037",
  frameOfReferenceUid: "x00200052",
  planePositionSequence: "x00209113",
  planeOrientationSequence: "x00209116",
  numberOfFrames: "x00280008",
  rows: "x00280010",
  columns: "x00280011",
  pixelSpacing: "x00280030",
  pixelMeasuresSequence: "x00289110",
  sharedFunctionalGroups: "x52009229",
  perFrameFunctionalGroups: "x52009230",
  pixelData: "x7fe00010",
  floatPixelData: "x7fe00008",
  doubleFloatPixelData: "x7fe00009",
} as const;

const REQUIRED_UIDS = [
  ["StudyInstanceUID", TAG.studyInstanceUid],
  ["SeriesInstanceUID", TAG.seriesInstanceUid],
  ["SOPInstanceUID", TAG.sopInstanceUid],
] as const;

/** DICOM Part 10 바이트를 파싱해 정규화된 메타데이터를 만든다. 파일 이름·확장자는 쓰지 않는다. */
export function parseDicomFile(bytes: Uint8Array): DicomParseResult {
  if (!hasPart10Preamble(bytes)) {
    return {
      ok: false,
      reason: "not-dicom",
      detail: "DICOM Part 10 'DICM' 식별자가 없습니다",
    };
  }

  let dataSet: DataSet;
  try {
    dataSet = parseDicom(bytes);
  } catch (error) {
    return { ok: false, reason: "parse-error", detail: describeError(error) };
  }

  try {
    return readMetadata(dataSet);
  } catch (error) {
    return { ok: false, reason: "parse-error", detail: describeError(error) };
  }
}

function readMetadata(dataSet: DataSet): DicomParseResult {
  for (const [name, tag] of REQUIRED_UIDS) {
    if (!text(dataSet, tag))
      return { ok: false, reason: "missing-uid", detail: name };
  }

  const transferSyntaxUid = text(dataSet, TAG.transferSyntaxUid);
  if (
    !transferSyntaxUid ||
    !SUPPORTED_TRANSFER_SYNTAXES.has(transferSyntaxUid)
  ) {
    return {
      ok: false,
      reason: "unsupported-transfer-syntax",
      detail: transferSyntaxUid ?? "없음",
    };
  }

  if (
    !dataSet.elements[TAG.pixelData] &&
    !dataSet.elements[TAG.floatPixelData] &&
    !dataSet.elements[TAG.doubleFloatPixelData]
  ) {
    return {
      ok: false,
      reason: "no-pixel-data",
      detail: "Pixel Data (7FE0,0010) 없음",
    };
  }

  const shared = firstItem(dataSet, TAG.sharedFunctionalGroups);
  const perFrame = items(dataSet, TAG.perFrameFunctionalGroups);

  const frameCount = readFrameCount(dataSet, perFrame.length);
  if (!frameCount.ok)
    return {
      ok: false,
      reason: "invalid-frame-count",
      detail: frameCount.detail,
    };
  const numberOfFrames = frameCount.value;

  const rows = dataSet.uint16(TAG.rows);
  const columns = dataSet.uint16(TAG.columns);
  if (!rows || !columns) {
    return { ok: false, reason: "parse-error", detail: "Rows/Columns 없음" };
  }

  // Enhanced 멀티프레임: 최상위 → Shared 기능 그룹 → PerFrame 기능 그룹 순으로 찾는다.
  // PerFrame 값은 프레임별로 보존하고, 모든 프레임이 같을 때만 대표값을 둔다(1번 프레임 값으로 대체하지 않음).
  const frameOrientations = perFrameValues(perFrame, numberOfFrames, (frame) =>
    orientation(
      nestedNumbers(
        frame,
        TAG.planeOrientationSequence,
        TAG.imageOrientationPatient,
      ),
    ),
  );
  const framePixelSpacings = perFrameValues(perFrame, numberOfFrames, (frame) =>
    pair(nestedNumbers(frame, TAG.pixelMeasuresSequence, TAG.pixelSpacing)),
  );
  const commonOrientation =
    orientation(numbers(dataSet, TAG.imageOrientationPatient)) ??
    orientation(
      nestedNumbers(
        shared,
        TAG.planeOrientationSequence,
        TAG.imageOrientationPatient,
      ),
    );
  const commonPixelSpacing =
    pair(numbers(dataSet, TAG.pixelSpacing)) ??
    pair(nestedNumbers(shared, TAG.pixelMeasuresSequence, TAG.pixelSpacing));
  const imageOrientationPatient =
    commonOrientation ??
    (frameOrientations && allEqual(frameOrientations, sameOrientationValues)
      ? frameOrientations[0]
      : undefined);
  const pixelSpacing =
    commonPixelSpacing ??
    (framePixelSpacings && allEqual(framePixelSpacings, sameNumbers)
      ? framePixelSpacings[0]
      : undefined);
  const imagePositionPatient = vec3(numbers(dataSet, TAG.imagePositionPatient));
  const framePositions = readFramePositions(perFrame, numberOfFrames);
  const frameTimeMs = dataSet.floatString(TAG.frameTime);
  const frameTimeVector = numbers(dataSet, TAG.frameTimeVector);

  const metadata: DicomInstanceMetadata = {
    sopInstanceUid: text(dataSet, TAG.sopInstanceUid)!,
    sopClassUid: text(dataSet, TAG.sopClassUid) ?? "",
    studyInstanceUid: text(dataSet, TAG.studyInstanceUid)!,
    seriesInstanceUid: text(dataSet, TAG.seriesInstanceUid)!,
    transferSyntaxUid,
    modality: text(dataSet, TAG.modality),
    studyDate: text(dataSet, TAG.studyDate),
    studyTime: text(dataSet, TAG.studyTime),
    studyDescription: text(dataSet, TAG.studyDescription),
    studyId: text(dataSet, TAG.studyId),
    accessionNumber: text(dataSet, TAG.accessionNumber),
    patientId: text(dataSet, TAG.patientId),
    seriesNumber: integer(dataSet, TAG.seriesNumber),
    seriesDescription: text(dataSet, TAG.seriesDescription),
    instanceNumber: integer(dataSet, TAG.instanceNumber),
    frameOfReferenceUid: text(dataSet, TAG.frameOfReferenceUid),
    rows,
    columns,
    numberOfFrames,
    imagePositionPatient,
    imageOrientationPatient,
    pixelSpacing,
    framePositions,
    frameOrientations: commonOrientation ? undefined : frameOrientations,
    framePixelSpacings: commonPixelSpacing ? undefined : framePixelSpacings,
    frameKind: classifyFrames({
      numberOfFrames,
      framePositions,
      imageOrientationPatient,
      frameOrientations: commonOrientation ? undefined : frameOrientations,
      frameTimeMs,
      frameTimeVector,
    }),
  };
  return { ok: true, metadata: dropUndefined(metadata) };
}

function hasPart10Preamble(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 132 &&
    bytes[128] === 0x44 && // D
    bytes[129] === 0x49 && // I
    bytes[130] === 0x43 && // C
    bytes[131] === 0x4d // M
  );
}

/**
 * NumberOfFrames 가 없으면 DICOM 기본값 1 이지만, 프레임별 기능 그룹 수와 어긋나면 거부한다.
 * 값이 정수가 아니거나 1 미만이어도 거부한다.
 */
function readFrameCount(
  dataSet: DataSet,
  perFrameCount: number,
): { ok: true; value: number } | { ok: false; detail: string } {
  const element = dataSet.elements[TAG.numberOfFrames];
  if (!element) {
    if (perFrameCount > 1) {
      return {
        ok: false,
        detail: `NumberOfFrames 없음, PerFrameFunctionalGroupsSequence 항목 ${perFrameCount}개`,
      };
    }
    return { ok: true, value: 1 };
  }
  const raw = text(dataSet, TAG.numberOfFrames) ?? "";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return { ok: false, detail: `NumberOfFrames 값이 유효하지 않음: "${raw}"` };
  }
  if (perFrameCount > 0 && perFrameCount !== value) {
    return {
      ok: false,
      detail: `NumberOfFrames ${value}, PerFrameFunctionalGroupsSequence 항목 ${perFrameCount}개`,
    };
  }
  return { ok: true, value };
}

function readFramePositions(
  perFrame: readonly DataSet[],
  numberOfFrames: number,
): Vec3[] | undefined {
  if (numberOfFrames <= 1 || perFrame.length !== numberOfFrames)
    return undefined;
  const positions = perFrame.map((frame) =>
    vec3(
      nestedNumbers(frame, TAG.planePositionSequence, TAG.imagePositionPatient),
    ),
  );
  return positions.every((position): position is Vec3 => position !== undefined)
    ? positions
    : undefined;
}

/** 모든 프레임에 값이 있을 때만 프레임 순서대로 돌려준다 */
function perFrameValues<T>(
  perFrame: readonly DataSet[],
  numberOfFrames: number,
  read: (frame: DataSet) => T | undefined,
): T[] | undefined {
  if (perFrame.length === 0 || perFrame.length !== numberOfFrames)
    return undefined;
  const values = perFrame.map(read);
  return values.every((value): value is T => value !== undefined)
    ? values
    : undefined;
}

function allEqual<T>(
  values: readonly T[],
  equal: (a: T, b: T) => boolean,
): boolean {
  return values.every((value) => equal(value, values[0]!));
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return (
    a.length === b.length &&
    a.every((value, i) => Math.abs(value - b[i]!) <= 1e-6)
  );
}

/** 방향 대표값 판정: DS 반올림 범위(1e-4) 안에서 같은 값 */
function sameOrientationValues(a: Orientation, b: Orientation): boolean {
  return a.every((value, i) => Math.abs(value - b[i]!) <= 1e-4);
}

function text(dataSet: DataSet, tag: string): string | undefined {
  const value = dataSet.string(tag)?.replace(/\0+$/, "").trim();
  return value ? value : undefined;
}

function integer(dataSet: DataSet, tag: string): number | undefined {
  const value = dataSet.intString(tag);
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

/** 다중 값 DS/IS 를 숫자 배열로 읽는다. 하나라도 숫자가 아니면 undefined */
function numbers(
  dataSet: DataSet | undefined,
  tag: string,
): number[] | undefined {
  const raw = dataSet ? text(dataSet, tag) : undefined;
  if (!raw) return undefined;
  const values = raw.split("\\").map((part) => Number(part.trim()));
  return values.every(Number.isFinite) ? values : undefined;
}

function items(dataSet: DataSet | undefined, tag: string): DataSet[] {
  return (dataSet?.elements[tag]?.items ?? []).flatMap((item) =>
    item.dataSet ? [item.dataSet] : [],
  );
}

function firstItem(
  dataSet: DataSet | undefined,
  tag: string,
): DataSet | undefined {
  return items(dataSet, tag)[0];
}

function nestedNumbers(
  dataSet: DataSet | undefined,
  sequenceTag: string,
  tag: string,
): number[] | undefined {
  return numbers(firstItem(dataSet, sequenceTag), tag);
}

function vec3(values: number[] | undefined): Vec3 | undefined {
  return values?.length === 3
    ? [values[0]!, values[1]!, values[2]!]
    : undefined;
}

function orientation(values: number[] | undefined): Orientation | undefined {
  return values?.length === 6
    ? [values[0]!, values[1]!, values[2]!, values[3]!, values[4]!, values[5]!]
    : undefined;
}

function pair(
  values: number[] | undefined,
): readonly [number, number] | undefined {
  return values?.length === 2 && values[0]! > 0 && values[1]! > 0
    ? [values[0]!, values[1]!]
    : undefined;
}

function dropUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "exception" in error)
    return String(error.exception);
  return "알 수 없는 파싱 오류";
}
