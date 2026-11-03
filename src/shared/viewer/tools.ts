/** 작업 화면 왼쪽 마우스 도구. 엔진 도구 이름과의 대응은 뷰어 어댑터가 담당한다 */
export type ViewerTool =
  | "select"
  | "pan"
  | "zoom"
  | "windowLevel"
  | "length"
  | "angle"
  | "ellipse"
  | "contour"
  | "arrow";

export const NAVIGATION_TOOLS: readonly ViewerTool[] = [
  "select",
  "pan",
  "zoom",
  "windowLevel",
];
export const ANNOTATION_TOOLS: readonly ViewerTool[] = [
  "length",
  "angle",
  "ellipse",
  "contour",
  "arrow",
];
