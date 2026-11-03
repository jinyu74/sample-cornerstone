import type { Annotation, AnnotationTool } from "@/entities/study-work";
import type { ImagePoint, Vec3 } from "@/shared/lib/geometry";

/** 작업 문서 도구 → 공식 Cornerstone Tools 도구 이름 */
export const ENGINE_TOOL_NAMES: Record<AnnotationTool, string> = {
  length: "Length",
  angle: "Angle",
  ellipse: "EllipticalROI",
  contour: "PlanarFreehandROI",
  arrow: "ArrowAnnotate",
};

const TOOL_BY_ENGINE_NAME = new Map(
  Object.entries(ENGINE_TOOL_NAMES).map(([tool, name]) => [
    name,
    tool as AnnotationTool,
  ]),
);

export interface EngineAnnotationLike {
  annotationUID?: string;
  metadata: { toolName: string };
  data: {
    handles?: { points?: readonly (readonly number[])[] };
    contour?: { polyline?: readonly (readonly number[])[] };
  };
}

export interface EngineAnnotationSpec {
  toolName: string;
  base: {
    annotationUID: string;
    highlighted: boolean;
    isSelected: boolean;
    metadata: {
      toolName: string;
      referencedImageId: string;
      FrameOfReferenceUID?: string;
    };
    data: {
      handles: { points: Vec3[]; activeHandleIndex: null };
      label: string;
      cachedStats: Record<string, never>;
      contour?: { polyline: Vec3[]; closed: true };
    };
  };
}

/** EllipticalROI 는 끝점을 [아래, 위, 왼쪽, 오른쪽] 순서로 다룬다. 문서는 [위, 아래, 왼쪽, 오른쪽] */
const swapTopBottom = <T>(points: readonly T[]): T[] => [
  points[1]!,
  points[0]!,
  points[2]!,
  points[3]!,
];

/**
 * 작업 문서 주석을 엔진 주석 생성 정보로 바꾼다. 좌표 변환은 엔진(imageToWorldCoords)이 하도록 toWorld 로 받는다.
 * 엔진 표시용일 뿐이며 측정값은 작업 문서의 이미지 좌표·보정 정보로 계산한다.
 */
export function toEngineAnnotation(
  annotation: Annotation,
  options: {
    imageId: string;
    frameOfReferenceUid?: string;
    selected: boolean;
    toWorld: (point: ImagePoint) => Vec3;
  },
): EngineAnnotationSpec {
  const toolName = ENGINE_TOOL_NAMES[annotation.tool];
  const world = annotation.imagePoints.map(
    (point) => [...options.toWorld(point)] as unknown as Vec3,
  );
  const metadata = {
    toolName,
    referencedImageId: options.imageId,
    ...(options.frameOfReferenceUid
      ? { FrameOfReferenceUID: options.frameOfReferenceUid }
      : {}),
  };
  const data: EngineAnnotationSpec["base"]["data"] =
    annotation.tool === "contour"
      ? {
          handles: { points: [], activeHandleIndex: null },
          label: "",
          cachedStats: {},
          contour: { polyline: world, closed: true },
        }
      : {
          handles: {
            points:
              annotation.tool === "ellipse" ? swapTopBottom(world) : world,
            activeHandleIndex: null,
          },
          label: annotation.tool === "arrow" ? annotation.note || "메모" : "",
          cachedStats: {},
        };
  return {
    toolName,
    base: {
      annotationUID: annotation.id,
      highlighted: options.selected,
      isSelected: options.selected,
      metadata,
      data,
    },
  };
}

/** 사용자가 그리거나 핸들을 옮긴 엔진 주석에서 도구와 이미지 좌표를 꺼낸다. 지원하지 않는 도구는 null */
export function fromEngineAnnotation(
  engine: EngineAnnotationLike,
  toImage: (world: readonly number[]) => [number, number],
): { id: string; tool: AnnotationTool; imagePoints: ImagePoint[] } | null {
  const tool = TOOL_BY_ENGINE_NAME.get(engine.metadata.toolName);
  if (!tool || !engine.annotationUID) return null;
  const world =
    tool === "contour"
      ? engine.data.contour?.polyline
      : engine.data.handles?.points;
  if (!world || world.length === 0) return null;
  const imagePoints = world.map((point) => toImage(point) as ImagePoint);
  return {
    id: engine.annotationUID,
    tool,
    imagePoints: tool === "ellipse" ? swapTopBottom(imagePoints) : imagePoints,
  };
}
