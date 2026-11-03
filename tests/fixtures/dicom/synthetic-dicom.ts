/**
 * 테스트 전용 합성 DICOM Part 10 생성기.
 * 실제 환자 데이터를 쓰지 않기 위해 UID·식별자·픽셀을 모두 코드로 만든다.
 * Explicit VR Little Endian 메타 헤더와 데이터셋을 쓰며, 픽셀은 비압축 또는 JPEG-LS 무손실로 인코딩한다.
 */

export const TS = {
  explicitLittle: "1.2.840.10008.1.2.1",
  implicitLittle: "1.2.840.10008.1.2",
  jpegLsLossless: "1.2.840.10008.1.2.4.80",
  /** 디코더가 지원하지 않는 MPEG2 비디오 */
  mpeg2: "1.2.840.10008.1.2.4.100",
} as const;

const CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2";
const ENHANCED_CT_STORAGE = "1.2.840.10008.5.1.4.1.1.2.1";
const IMPLEMENTATION_CLASS_UID = "2.25.1000000000000000000000000000000001";

type Tag = readonly [group: number, element: number];

interface Element {
  tag: Tag;
  vr: string;
  /** 문자열 값, 이미 인코딩된 바이트, 또는 시퀀스 항목(각 항목은 Element 배열) */
  value: string | Uint8Array | Element[][];
  /** 정의되지 않은 길이(캡슐화 픽셀 데이터) */
  undefinedLength?: boolean;
}

export type Vec3 = readonly [number, number, number];

export interface SyntheticImageOptions {
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopInstanceUid: string;
  modality?: string;
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  studyId?: string;
  accessionNumber?: string;
  patientId?: string;
  seriesNumber?: number;
  seriesDescription?: string;
  instanceNumber?: number;
  frameOfReferenceUid?: string;
  imagePositionPatient?: Vec3;
  imageOrientationPatient?: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  /** [행 간격, 열 간격] mm */
  pixelSpacing?: readonly [number, number];
  rows?: number;
  columns?: number;
  /** 1보다 크면 멀티프레임 */
  frames?: number;
  /** 멀티프레임 프레임별 위치(PerFrameFunctionalGroupsSequence > PlanePositionSequence) */
  perFramePositions?: readonly Vec3[];
  /** SharedFunctionalGroupsSequence (5200,9229) 의 방향·픽셀 간격 */
  sharedFunctionalGroups?: FunctionalGroup;
  /** PerFrameFunctionalGroupsSequence (5200,9230) 의 프레임별 위치·방향·픽셀 간격(perFramePositions 보다 우선) */
  perFrameFunctionalGroups?: readonly FunctionalGroup[];
  /** 멀티프레임 시간 간격(ms). FrameTime (0018,1063) */
  frameTimeMs?: number;
  windowCenter?: number;
  windowWidth?: number;
  transferSyntaxUid?: string;
  /** 픽셀 값(0~4095). 기본값은 왼쪽 절반 0, 오른쪽 절반 4000 */
  pixel?: (frame: number, row: number, column: number) => number;
  /** 지정한 키의 요소를 생략한다(필수 UID 누락 사례) */
  omit?: readonly (
    "study" | "series" | "sop" | "pixelData" | "numberOfFrames"
  )[];
}

export interface FunctionalGroup {
  position?: Vec3;
  orientation?: readonly [number, number, number, number, number, number];
  pixelSpacing?: readonly [number, number];
}

const DEFAULT_PIXEL = (
  _frame: number,
  _row: number,
  column: number,
  columns: number,
) => (column < columns / 2 ? 0 : 4000);

export async function buildSyntheticDicom(
  options: SyntheticImageOptions,
): Promise<Uint8Array> {
  const rows = options.rows ?? 32;
  const columns = options.columns ?? 32;
  const frames = options.frames ?? 1;
  const transferSyntaxUid = options.transferSyntaxUid ?? TS.explicitLittle;
  const sopClassUid = frames > 1 ? ENHANCED_CT_STORAGE : CT_IMAGE_STORAGE;
  const omit = new Set(options.omit ?? []);

  const frameBuffers: Uint16Array[] = [];
  for (let f = 0; f < frames; f += 1) {
    const buffer = new Uint16Array(rows * columns);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        buffer[r * columns + c] = options.pixel
          ? options.pixel(f, r, c)
          : DEFAULT_PIXEL(f, r, c, columns);
      }
    }
    frameBuffers.push(buffer);
  }

  const dataset: Element[] = [
    str([0x0008, 0x0016], "UI", sopClassUid),
    ...(omit.has("sop")
      ? []
      : [str([0x0008, 0x0018], "UI", options.sopInstanceUid)]),
    str([0x0008, 0x0020], "DA", options.studyDate ?? "20260101"),
    str([0x0008, 0x0030], "TM", options.studyTime ?? "120000"),
    str([0x0008, 0x0050], "SH", options.accessionNumber ?? "SYN-ACC"),
    str([0x0008, 0x0060], "CS", options.modality ?? "CT"),
    str([0x0008, 0x1030], "LO", options.studyDescription ?? "Synthetic study"),
    str(
      [0x0008, 0x103e],
      "LO",
      options.seriesDescription ?? "Synthetic series",
    ),
    str([0x0010, 0x0010], "PN", "SYNTHETIC^PHANTOM"),
    str([0x0010, 0x0020], "LO", options.patientId ?? "SYN-0001"),
    ...(frames > 1 && options.frameTimeMs !== undefined
      ? [str([0x0018, 0x1063], "DS", ds(options.frameTimeMs))]
      : []),
    ...(omit.has("study")
      ? []
      : [str([0x0020, 0x000d], "UI", options.studyInstanceUid)]),
    ...(omit.has("series")
      ? []
      : [str([0x0020, 0x000e], "UI", options.seriesInstanceUid)]),
    str([0x0020, 0x0010], "SH", options.studyId ?? "S1"),
    str([0x0020, 0x0011], "IS", String(options.seriesNumber ?? 1)),
    ...(options.instanceNumber === undefined
      ? []
      : [str([0x0020, 0x0013], "IS", String(options.instanceNumber))]),
    ...(options.imagePositionPatient
      ? [
          str(
            [0x0020, 0x0032],
            "DS",
            options.imagePositionPatient.map(ds).join("\\"),
          ),
        ]
      : []),
    ...(options.imageOrientationPatient
      ? [
          str(
            [0x0020, 0x0037],
            "DS",
            options.imageOrientationPatient.map(ds).join("\\"),
          ),
        ]
      : []),
    ...(options.frameOfReferenceUid
      ? [str([0x0020, 0x0052], "UI", options.frameOfReferenceUid)]
      : []),
    us([0x0028, 0x0002], 1),
    str([0x0028, 0x0004], "CS", "MONOCHROME2"),
    ...(frames > 1 && !omit.has("numberOfFrames")
      ? [str([0x0028, 0x0008], "IS", String(frames))]
      : []),
    us([0x0028, 0x0010], rows),
    us([0x0028, 0x0011], columns),
    ...(options.pixelSpacing
      ? [str([0x0028, 0x0030], "DS", options.pixelSpacing.map(ds).join("\\"))]
      : []),
    us([0x0028, 0x0100], 16),
    us([0x0028, 0x0101], 12),
    us([0x0028, 0x0102], 11),
    us([0x0028, 0x0103], 0),
    str([0x0028, 0x1050], "DS", ds(options.windowCenter ?? 2000)),
    str([0x0028, 0x1051], "DS", ds(options.windowWidth ?? 4000)),
    str([0x0028, 0x1052], "DS", "0"),
    str([0x0028, 0x1053], "DS", "1"),
    ...(options.sharedFunctionalGroups
      ? [
          {
            tag: [0x5200, 0x9229] as const,
            vr: "SQ",
            value: [functionalGroupItem(options.sharedFunctionalGroups)],
          },
        ]
      : []),
    ...(perFrameGroups(options)
      ? [
          {
            tag: [0x5200, 0x9230] as const,
            vr: "SQ",
            value: perFrameGroups(options)!.map(functionalGroupItem),
          },
        ]
      : []),
  ];

  if (!omit.has("pixelData")) {
    dataset.push(
      await pixelDataElement(frameBuffers, rows, columns, transferSyntaxUid),
    );
  }

  const meta: Element[] = [
    { tag: [0x0002, 0x0001], vr: "OB", value: new Uint8Array([0, 1]) },
    str([0x0002, 0x0002], "UI", sopClassUid),
    str([0x0002, 0x0003], "UI", options.sopInstanceUid),
    str([0x0002, 0x0010], "UI", transferSyntaxUid),
    str([0x0002, 0x0012], "UI", IMPLEMENTATION_CLASS_UID),
  ];
  const metaBytes = concat(meta.map(encodeElement));
  const groupLength = encodeElement({
    tag: [0x0002, 0x0000],
    vr: "UL",
    value: u32(metaBytes.length),
  });

  const datasetBytes =
    transferSyntaxUid === TS.implicitLittle
      ? concat(dataset.map(encodeImplicitElement))
      : concat(dataset.map(encodeElement));

  return concat([
    new Uint8Array(128),
    new TextEncoder().encode("DICM"),
    groupLength,
    metaBytes,
    datasetBytes,
  ]);
}

function perFrameGroups(
  options: SyntheticImageOptions,
): readonly FunctionalGroup[] | undefined {
  return (
    options.perFrameFunctionalGroups ??
    options.perFramePositions?.map((position) => ({ position }))
  );
}

function functionalGroupItem(group: FunctionalGroup): Element[] {
  const item: Element[] = [];
  if (group.position) {
    item.push({
      tag: [0x0020, 0x9113],
      vr: "SQ",
      value: [[str([0x0020, 0x0032], "DS", group.position.map(ds).join("\\"))]],
    });
  }
  if (group.orientation) {
    item.push({
      tag: [0x0020, 0x9116],
      vr: "SQ",
      value: [
        [str([0x0020, 0x0037], "DS", group.orientation.map(ds).join("\\"))],
      ],
    });
  }
  if (group.pixelSpacing) {
    item.push({
      tag: [0x0028, 0x9110],
      vr: "SQ",
      value: [
        [str([0x0028, 0x0030], "DS", group.pixelSpacing.map(ds).join("\\"))],
      ],
    });
  }
  // DICOM 은 데이터셋 안 요소를 태그 오름차순으로 둔다.
  return item.sort((a, b) => a.tag[0] - b.tag[0] || a.tag[1] - b.tag[1]);
}

/** DICOM 이 아닌 임의 바이트(확장자와 무관하게 거부되어야 함) */
export function buildNonDicom(): Uint8Array {
  return new TextEncoder().encode(
    "this is not a dicom file, even if named .dcm\n".repeat(8),
  );
}

async function pixelDataElement(
  frames: Uint16Array[],
  rows: number,
  columns: number,
  transferSyntaxUid: string,
): Promise<Element> {
  if (
    transferSyntaxUid === TS.explicitLittle ||
    transferSyntaxUid === TS.implicitLittle
  ) {
    const bytes = concat(frames.map((frame) => new Uint8Array(frame.buffer)));
    return { tag: [0x7fe0, 0x0010], vr: "OW", value: bytes };
  }
  const fragments =
    transferSyntaxUid === TS.jpegLsLossless
      ? await Promise.all(
          frames.map((frame) => encodeJpegLs(frame, rows, columns)),
        )
      : frames.map(() => new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  return {
    tag: [0x7fe0, 0x0010],
    vr: "OB",
    value: encapsulate(fragments),
    undefinedLength: true,
  };
}

interface CharlsEncoder {
  getDecodedBuffer(info: {
    width: number;
    height: number;
    bitsPerSample: number;
    componentCount: number;
  }): Uint8Array;
  encode(): void;
  getEncodedBuffer(): Uint8Array;
  delete(): void;
}
interface CharlsModule {
  JpegLSEncoder: new () => CharlsEncoder;
}
let charls: Promise<CharlsModule> | undefined;

async function encodeJpegLs(frame: Uint16Array, rows: number, columns: number) {
  charls ??= import("@cornerstonejs/codec-charls/wasmjs").then(
    async (module) => (await module.default()) as CharlsModule,
  );
  const codec = await charls;
  const encoder = new codec.JpegLSEncoder();
  try {
    const input = encoder.getDecodedBuffer({
      width: columns,
      height: rows,
      bitsPerSample: 12,
      componentCount: 1,
    });
    // 인코더 입력 버퍼는 바이트 배열이므로 16비트 샘플을 little endian 바이트로 넣는다.
    input.set(new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength));
    encoder.encode();
    return encoder.getEncodedBuffer().slice();
  } finally {
    encoder.delete();
  }
}

/** 캡슐화 픽셀 데이터: 빈 Basic Offset Table + 프레임별 fragment + Sequence Delimiter */
function encapsulate(fragments: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [itemHeader(0xe000, 0)];
  for (const fragment of fragments) {
    const padded =
      fragment.length % 2 === 0
        ? fragment
        : concat([fragment, new Uint8Array(1)]);
    parts.push(itemHeader(0xe000, padded.length), padded);
  }
  parts.push(itemHeader(0xe0dd, 0));
  return concat(parts);
}

function itemHeader(element: number, length: number): Uint8Array {
  return concat([u16(0xfffe), u16(element), u32(length)]);
}

const LONG_VRS = new Set([
  "OB",
  "OW",
  "OF",
  "SQ",
  "UT",
  "UN",
  "UC",
  "UR",
  "OD",
  "OL",
  "OV",
  "SV",
  "UV",
]);

function encodeValue(element: Element, explicit: boolean): Uint8Array {
  const { value, vr } = element;
  if (Array.isArray(value)) {
    const items = value.map((item) => {
      const body = concat(
        item.map((child) =>
          explicit ? encodeElement(child) : encodeImplicitElement(child),
        ),
      );
      return concat([itemHeader(0xe000, body.length), body]);
    });
    return concat(items);
  }
  if (value instanceof Uint8Array) {
    return value.length % 2 === 0 ? value : concat([value, new Uint8Array(1)]);
  }
  const text = new TextEncoder().encode(value);
  if (text.length % 2 === 0) return text;
  return concat([text, new Uint8Array([vr === "UI" ? 0 : 0x20])]);
}

function encodeElement(element: Element): Uint8Array {
  const value = encodeValue(element, true);
  const header = [
    u16(element.tag[0]),
    u16(element.tag[1]),
    new TextEncoder().encode(element.vr),
  ];
  const length = element.undefinedLength ? 0xffffffff : value.length;
  if (LONG_VRS.has(element.vr)) {
    return concat([...header, new Uint8Array(2), u32(length), value]);
  }
  return concat([...header, u16(length), value]);
}

function encodeImplicitElement(element: Element): Uint8Array {
  const value = encodeValue(element, false);
  const length = element.undefinedLength ? 0xffffffff : value.length;
  return concat([u16(element.tag[0]), u16(element.tag[1]), u32(length), value]);
}

function str(tag: Tag, vr: string, value: string): Element {
  return { tag, vr, value };
}

function us(tag: Tag, value: number): Element {
  return { tag, vr: "US", value: u16(value) };
}

function ds(value: number): string {
  // DS 는 최대 16자. 테스트 값은 짧게 유지된다.
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toPrecision(10)));
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
