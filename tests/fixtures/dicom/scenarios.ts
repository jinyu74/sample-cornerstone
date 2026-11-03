/**
 * 테스트·E2E 공용 합성 fixture 시나리오. 모든 UID 는 2.25 루트의 합성 값이다.
 */
import { buildNonDicom, buildSyntheticDicom, TS } from "./synthetic-dicom";

export const UID = {
  studyA: "2.25.100001",
  studyB: "2.25.100002",
  seriesSingle: "2.25.200001",
  seriesStack: "2.25.200002",
  seriesMultiSpatial: "2.25.200003",
  seriesMultiTemporal: "2.25.200004",
  seriesJpegLs: "2.25.200005",
  seriesStudyB: "2.25.200006",
  forA: "2.25.300001",
  studyMr: "2.25.100003",
  seriesMrStack: "2.25.200010",
  forMr: "2.25.300002",
} as const;

export interface FixtureFile {
  name: string;
  bytes: Uint8Array;
}

const AXIAL = [1, 0, 0, 0, 1, 0] as const;

/** 단일 영상(보정 정보 있음) */
export async function singleImage(): Promise<FixtureFile> {
  return {
    name: "single-image",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: UID.seriesSingle,
      sopInstanceUid: "2.25.400001",
      seriesNumber: 1,
      seriesDescription: "Single image",
      instanceNumber: 1,
      frameOfReferenceUid: UID.forA,
      imagePositionPatient: [0, 0, 0],
      imageOrientationPatient: AXIAL,
      pixelSpacing: [0.5, 0.5],
    }),
  };
}

/**
 * CT 스택 5장. 파일 이름 순서·InstanceNumber 가 위치 순서와 다르다.
 * 슬라이스 k(위치 z=k*2.5)의 왼쪽 위 8x8 블록 값은 k*800 이어서 화면에서 슬라이스를 구분할 수 있다.
 */
export async function ctStack(): Promise<FixtureFile[]> {
  const zOrder = [3, 0, 4, 1, 2];
  return Promise.all(
    zOrder.map(async (k, fileIndex) => ({
      name: `stack-${String(fileIndex).padStart(2, "0")}.dcm`,
      bytes: await buildSyntheticDicom({
        studyInstanceUid: UID.studyA,
        seriesInstanceUid: UID.seriesStack,
        sopInstanceUid: `2.25.41000${k}`,
        seriesNumber: 2,
        seriesDescription: "Axial stack",
        instanceNumber: 5 - k,
        frameOfReferenceUid: UID.forA,
        imagePositionPatient: [-16, -16, k * 2.5],
        imageOrientationPatient: AXIAL,
        pixelSpacing: [0.7, 0.7],
        pixel: (_f, r, c) => (r < 8 && c < 8 ? k * 800 : c < 16 ? 0 : 4000),
      }),
    })),
  );
}

/**
 * 공간 슬라이스 Enhanced 멀티프레임. 최상위 IOP·PixelSpacing 이 없고
 * 방향·픽셀 간격은 SharedFunctionalGroupsSequence, 위치는 PerFrameFunctionalGroupsSequence 에만 있다.
 */
export async function multiframeSpatial(): Promise<FixtureFile> {
  return {
    name: "multiframe-spatial.bin",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: UID.seriesMultiSpatial,
      sopInstanceUid: "2.25.420001",
      seriesNumber: 3,
      seriesDescription: "Enhanced multiframe",
      instanceNumber: 1,
      frameOfReferenceUid: UID.forA,
      frames: 3,
      sharedFunctionalGroups: { orientation: AXIAL, pixelSpacing: [0.8, 0.9] },
      perFrameFunctionalGroups: [
        { position: [0, 0, 10] },
        { position: [0, 0, 0] },
        { position: [0, 0, 5] },
      ],
      pixel: (f, _r, c) => (c < 16 ? f * 1000 : 4000),
    }),
  };
}

/** 방향·픽셀 간격까지 프레임별 기능 그룹에만 있는 Enhanced 멀티프레임 */
export async function multiframePerFrameGeometry(): Promise<FixtureFile> {
  return {
    name: "multiframe-per-frame-geometry",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: "2.25.200007",
      sopInstanceUid: "2.25.420002",
      seriesNumber: 6,
      instanceNumber: 1,
      frames: 2,
      perFrameFunctionalGroups: [
        { position: [0, 0, 0], orientation: AXIAL, pixelSpacing: [0.6, 0.6] },
        { position: [0, 0, 3], orientation: AXIAL, pixelSpacing: [0.6, 0.6] },
      ],
    }),
  };
}

/** 프레임별 위치가 모두 같은 시간 프레임(위치 반복 + FrameTime) */
export async function multiframeTemporalRepeatedPosition(): Promise<FixtureFile> {
  return {
    name: "cine-repeated-position",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: "2.25.200008",
      sopInstanceUid: "2.25.430002",
      modality: "MR",
      seriesNumber: 7,
      instanceNumber: 1,
      frames: 3,
      frameTimeMs: 40,
      sharedFunctionalGroups: { orientation: AXIAL, pixelSpacing: [1, 1] },
      perFramePositions: [
        [0, 0, 7],
        [0, 0, 7],
        [0, 0, 7],
      ],
    }),
  };
}

/** NumberOfFrames 가 없는데 프레임별 기능 그룹이 3개인 멀티프레임(프레임 수 불일치) */
export async function multiframeMissingNumberOfFrames(): Promise<FixtureFile> {
  return {
    name: "multiframe-missing-count.dcm",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: "2.25.200009",
      sopInstanceUid: "2.25.420003",
      frames: 3,
      omit: ["numberOfFrames"],
      perFramePositions: [
        [0, 0, 0],
        [0, 0, 1],
        [0, 0, 2],
      ],
    }),
  };
}

/** 시간 프레임 멀티프레임(위치 없음, FrameTime 있음) */
export async function multiframeTemporal(): Promise<FixtureFile> {
  return {
    name: "cine",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: UID.seriesMultiTemporal,
      sopInstanceUid: "2.25.430001",
      modality: "XA",
      seriesNumber: 4,
      seriesDescription: "Cine",
      instanceNumber: 1,
      frames: 4,
      frameTimeMs: 33.3,
    }),
  };
}

/** JPEG-LS 무손실 압축(WASM 코덱 디코딩 검증용) */
export async function jpegLsImage(): Promise<FixtureFile> {
  return {
    name: "jpegls.dcm",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: UID.seriesJpegLs,
      sopInstanceUid: "2.25.440001",
      seriesNumber: 5,
      seriesDescription: "JPEG-LS",
      instanceNumber: 1,
      imagePositionPatient: [0, 0, 0],
      imageOrientationPatient: AXIAL,
      transferSyntaxUid: TS.jpegLsLossless,
    }),
  };
}

/** 다른 검사(검사·시리즈 분리 확인) */
export async function otherStudyImage(): Promise<FixtureFile> {
  return {
    name: "other-study.dcm",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyB,
      seriesInstanceUid: UID.seriesStudyB,
      sopInstanceUid: "2.25.450001",
      modality: "MR",
      studyDate: "20251231",
      studyDescription: "Other synthetic study",
      accessionNumber: "SYN-ACC-B",
      seriesNumber: 1,
      instanceNumber: 1,
    }),
  };
}

export function nonDicom(): FixtureFile {
  return { name: "fake.dcm", bytes: buildNonDicom() };
}

export async function unsupportedTransferSyntax(): Promise<FixtureFile> {
  return {
    name: "video.dcm",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: "2.25.200099",
      sopInstanceUid: "2.25.490001",
      transferSyntaxUid: TS.mpeg2,
    }),
  };
}

export async function missingSeriesUid(): Promise<FixtureFile> {
  return {
    name: "missing-series.dcm",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: "unused",
      sopInstanceUid: "2.25.490002",
      omit: ["series"],
    }),
  };
}

/** 단일 영상과 SOP UID 는 같지만 내용이 다른 파일(충돌) */
export async function conflictingSingleImage(): Promise<FixtureFile> {
  return {
    name: "single-image-modified.dcm",
    bytes: await buildSyntheticDicom({
      studyInstanceUid: UID.studyA,
      seriesInstanceUid: UID.seriesSingle,
      sopInstanceUid: "2.25.400001",
      seriesNumber: 1,
      instanceNumber: 1,
      pixel: () => 1234,
    }),
  };
}

/**
 * 합성 MR 스택 4장(시상면: 행 방향 +y, 열 방향 -z). 위치는 x 축을 따라 바뀌며 파일 순서·InstanceNumber 와 다르다.
 * 슬라이스 법선은 (-1,0,0) 이므로 x 가 큰 슬라이스가 먼저 온다. 표식 블록 값 = 표시 순서 × 800.
 */
export async function mrStack(): Promise<FixtureFile[]> {
  const xs = [9, 0, 6, 3];
  return Promise.all(
    xs.map(async (x, fileIndex) => {
      const order = (9 - x) / 3;
      return {
        name: `mr-${fileIndex}`,
        bytes: await buildSyntheticDicom({
          studyInstanceUid: UID.studyMr,
          seriesInstanceUid: UID.seriesMrStack,
          sopInstanceUid: `2.25.46000${fileIndex}`,
          modality: "MR",
          studyDate: "20261020",
          studyDescription: "Synthetic MR",
          accessionNumber: "SYN-MR",
          seriesNumber: 1,
          seriesDescription: "Sagittal stack",
          instanceNumber: fileIndex + 1,
          frameOfReferenceUid: UID.forMr,
          imagePositionPatient: [x, -16, 16],
          imageOrientationPatient: [0, 1, 0, 0, 0, -1],
          pixelSpacing: [1, 1],
          pixel: (_f, r, c) =>
            r < 8 && c < 8 ? order * 800 : c < 16 ? 0 : 4000,
        }),
      };
    }),
  );
}
