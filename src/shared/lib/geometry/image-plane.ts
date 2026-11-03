import { cross, dot, normalize, type Vec3 } from "./vec3";

/** 이미지 좌표: 픽셀 index 단위 [열, 행], 첫 픽셀 중심 = (0, 0) (DICOM·Cornerstone 규약) */
export type ImagePoint = readonly [column: number, row: number];

export interface ImagePlane {
  imagePositionPatient: Vec3;
  /** 행 방향 코사인(열 index 증가 방향) 3개 + 열 방향 코사인(행 index 증가 방향) 3개 */
  imageOrientationPatient: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  /** [행 간격, 열 간격] mm (DICOM PixelSpacing 순서) */
  pixelSpacing: readonly [number, number];
}

const ORTHOGONALITY_TOLERANCE = 1e-3;

interface Axes {
  origin: Vec3;
  row: Vec3;
  column: Vec3;
  rowSpacing: number;
  columnSpacing: number;
}

function axes(plane: ImagePlane): Axes | null {
  const {
    imagePositionPatient: origin,
    imageOrientationPatient: o,
    pixelSpacing,
  } = plane;
  if (!origin.every(Number.isFinite)) return null;
  const [rowSpacing, columnSpacing] = pixelSpacing;
  if (!(
    rowSpacing > 0 &&
    columnSpacing > 0 &&
    Number.isFinite(rowSpacing) &&
    Number.isFinite(columnSpacing)
  )) {
    return null;
  }
  const row = normalize([o[0], o[1], o[2]]);
  const column = normalize([o[3], o[4], o[5]]);
  if (!row || !column || Math.abs(dot(row, column)) > ORTHOGONALITY_TOLERANCE)
    return null;
  if (!normalize(cross(row, column))) return null;
  return { origin, row, column, rowSpacing, columnSpacing };
}

export function isValidImagePlane(plane: ImagePlane): boolean {
  return axes(plane) !== null;
}

function requireAxes(plane: ImagePlane): Axes {
  const result = axes(plane);
  if (!result)
    throw new RangeError(
      "영상 평면 기하(위치·방향·픽셀 간격)가 유효하지 않습니다",
    );
  return result;
}

/** 이미지 좌표 → 환자(world) 좌표 mm. 열 이동 × 열 간격 × 행 방향, 행 이동 × 행 간격 × 열 방향 */
export function imageToWorld(
  plane: ImagePlane,
  [column, rowIndex]: ImagePoint,
): Vec3 {
  const {
    origin,
    row,
    column: col,
    rowSpacing,
    columnSpacing,
  } = requireAxes(plane);
  const along = column * columnSpacing;
  const down = rowIndex * rowSpacing;
  return [
    origin[0] + row[0] * along + col[0] * down,
    origin[1] + row[1] * along + col[1] * down,
    origin[2] + row[2] * along + col[2] * down,
  ];
}

/** 환자(world) 좌표 → 이미지 좌표. 평면 밖 점은 평면에 수직 투영한다 */
export function worldToImage(plane: ImagePlane, world: Vec3): [number, number] {
  const { origin, row, column, rowSpacing, columnSpacing } = requireAxes(plane);
  const offset: Vec3 = [
    world[0] - origin[0],
    world[1] - origin[1],
    world[2] - origin[2],
  ];
  return [dot(offset, row) / columnSpacing, dot(offset, column) / rowSpacing];
}
