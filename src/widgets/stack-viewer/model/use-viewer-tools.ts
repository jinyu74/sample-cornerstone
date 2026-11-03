import { useEffect, useEffectEvent, useRef } from "react";

import { initCornerstone, type ViewerTool } from "@/shared/viewer";

import { ENGINE_TOOL_NAMES } from "../lib/annotation-mapping";

type Modules = Awaited<ReturnType<typeof initCornerstone>>;
type ToolGroup = NonNullable<
  ReturnType<Modules["tools"]["ToolGroupManager"]["createToolGroup"]>
>;

const NAVIGATION_TOOL_NAMES: Record<
  Exclude<ViewerTool, keyof typeof ENGINE_TOOL_NAMES>,
  string | null
> = {
  select: null,
  pan: "Pan",
  zoom: "Zoom",
  windowLevel: "WindowLevel",
};

const ANNOTATION_TOOL_NAMES = Object.values(ENGINE_TOOL_NAMES);

/** 엔진 주석 data 객체 → 캔버스에 표시할 문구(작업 문서 측정값). 엔진 자체 계산 대신 같은 보정 규칙의 값을 보인다 */
export const annotationTextLines = new WeakMap<object, string[]>();

const getTextLines = (data: object) => annotationTextLines.get(data) ?? [];

let groupCounter = 0;

/**
 * viewport 마다 도구 그룹을 만들고 왼쪽 마우스 도구를 바꾼다.
 * 오른쪽 버튼은 확대, 가운데 버튼은 이동으로 항상 쓸 수 있고, 주석 도구는 그리지 않을 때 passive 로 두어
 * 기존 주석의 핸들을 선택·편집할 수 있게 한다. 휠은 스택 이동에 쓰므로 도구에 연결하지 않는다.
 */
export function useViewerTools(
  engineInfo: { renderingEngineId: string; viewportId: string } | undefined,
  tool: ViewerTool,
  onError?: (message: string) => void,
) {
  const report = useEffectEvent((error: unknown) =>
    onError?.(error instanceof Error ? error.message : String(error)),
  );
  const groupRef = useRef<{ group: ToolGroup; modules: Modules } | undefined>(
    undefined,
  );
  // 그룹이 준비된 시점의 최신 도구를 적용한다(도구가 바뀌어도 그룹을 다시 만들지 않는다).
  const applyCurrentTool = useEffectEvent(
    (group: ToolGroup, modules: Modules) =>
      applyPrimaryTool(group, modules, tool),
  );

  useEffect(() => {
    if (!engineInfo) return;
    let disposed = false;
    let groupId: string | undefined;
    initCornerstone()
      .then((modules) => {
        if (disposed) return;
        const { tools } = modules;
        groupCounter += 1;
        groupId = `viewer-tools-${groupCounter}`;
        const group = tools.ToolGroupManager.createToolGroup(groupId);
        if (!group) return;
        for (const name of ["WindowLevel", "Pan", "Zoom"]) group.addTool(name);
        for (const name of ANNOTATION_TOOL_NAMES) {
          group.addTool(name, {
            getTextLines,
            ...(name === "PlanarFreehandROI"
              ? { allowOpenContours: false, calculateStats: false }
              : {}),
            ...(name === "ArrowAnnotate"
              ? {
                  // 메모 내용은 오른쪽 패널에서 입력한다. 엔진은 빈 문구면 화살표를 지우므로 기본 표시 문구를 준다.
                  getTextCallback: (done: (text: string) => void) =>
                    done("메모"),
                  changeTextCallback: (
                    annotation: { data: { label?: string } },
                    _detail: unknown,
                    done: (text: string) => void,
                  ) => done(annotation.data.label ?? ""),
                }
              : {}),
          });
        }
        group.addViewport(engineInfo.viewportId, engineInfo.renderingEngineId);
        const { MouseBindings } = tools.Enums;
        group.setToolActive("Zoom", {
          bindings: [{ mouseButton: MouseBindings.Secondary }],
        });
        group.setToolActive("Pan", {
          bindings: [{ mouseButton: MouseBindings.Auxiliary }],
        });
        groupRef.current = { group, modules };
        applyCurrentTool(group, modules);
      })
      .catch((error: unknown) => {
        if (!disposed) report(error);
      });
    return () => {
      disposed = true;
      groupRef.current = undefined;
      if (groupId) {
        initCornerstone()
          .then(({ tools }) =>
            tools.ToolGroupManager.destroyToolGroup(groupId!),
          )
          // 정리 실패는 화면에 영향을 주지 않는다(엔진 초기화 실패는 viewport 오류로 표시됨).
          .catch(() => undefined);
      }
    };
  }, [engineInfo]);

  useEffect(() => {
    const current = groupRef.current;
    if (!current) return;
    try {
      applyPrimaryTool(current.group, current.modules, tool);
    } catch (error) {
      report(error);
    }
  }, [tool]);
}

function applyPrimaryTool(
  group: ToolGroup,
  { tools }: Modules,
  tool: ViewerTool,
) {
  const primary = {
    bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
  };
  // setToolActive 는 기존 바인딩에 추가한다. 이전 왼쪽 버튼 연결을 먼저 모두 지운 뒤
  // 보조 버튼과 선택한 도구를 다시 연결해야 확대·이동이 다른 도구를 가로채지 않는다.
  for (const name of ["Pan", "Zoom", "WindowLevel", ...ANNOTATION_TOOL_NAMES])
    group.setToolPassive(name, { removeAllBindings: true });
  const name =
    tool in ENGINE_TOOL_NAMES
      ? ENGINE_TOOL_NAMES[tool as keyof typeof ENGINE_TOOL_NAMES]
      : NAVIGATION_TOOL_NAMES[tool as keyof typeof NAVIGATION_TOOL_NAMES];
  if (name === "Pan" || name === "Zoom") {
    // 왼쪽 버튼에도 이동·확대를 연결한다(오른쪽·가운데 버튼 연결은 유지).
    const other =
      name === "Pan"
        ? tools.Enums.MouseBindings.Auxiliary
        : tools.Enums.MouseBindings.Secondary;
    group.setToolActive(name, {
      bindings: [primary.bindings[0]!, { mouseButton: other }],
    });
    const reset = name === "Pan" ? "Zoom" : "Pan";
    const resetButton =
      reset === "Pan"
        ? tools.Enums.MouseBindings.Auxiliary
        : tools.Enums.MouseBindings.Secondary;
    group.setToolActive(reset, { bindings: [{ mouseButton: resetButton }] });
    return;
  }
  group.setToolActive("Pan", {
    bindings: [{ mouseButton: tools.Enums.MouseBindings.Auxiliary }],
  });
  group.setToolActive("Zoom", {
    bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }],
  });
  if (name) group.setToolActive(name, primary);
}
