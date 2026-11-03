/**
 * Cornerstone3D 엔진 접근 계층. 브라우저에서만 동적 import 로 불러와 SSR 중 브라우저 API 를 실행하지 않는다.
 * 엔진·파일 등록의 가변 상태는 이 모듈과 hook 의 ref 가 소유하며 React 상태에 넣지 않는다.
 */
import type * as CoreModule from "@cornerstonejs/core";
import type LoaderModule from "@cornerstonejs/dicom-image-loader";
import type * as ToolsModule from "@cornerstonejs/tools";

export interface CornerstoneModules {
  core: typeof CoreModule;
  loader: typeof LoaderModule;
  tools: typeof ToolsModule;
}

let initialization: Promise<CornerstoneModules> | undefined;

/** 엔진과 DICOM 로더(Worker·WASM 코덱)를 한 번만 초기화한다. 실패하면 다음 호출에서 다시 시도한다. */
export function initCornerstone(): Promise<CornerstoneModules> {
  initialization ??= (async () => {
    const [core, loaderModule, tools] = await Promise.all([
      import("@cornerstonejs/core"),
      import("@cornerstonejs/dicom-image-loader"),
      import("@cornerstonejs/tools"),
    ]);
    const loader = loaderModule.default;
    if (!core.isCornerstoneInitialized()) core.init();
    const cores =
      typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 2;
    loader.init({
      maxWebWorkers: Math.max(1, Math.min(4, Math.floor((cores || 2) / 2))),
    });
    tools.init();
    // 공식 도구만 등록한다. 도구 그룹별 활성화는 뷰어 hook 이 담당한다.
    for (const Tool of [
      tools.WindowLevelTool,
      tools.PanTool,
      tools.ZoomTool,
      tools.LengthTool,
      tools.AngleTool,
      tools.EllipticalROITool,
      tools.PlanarFreehandROITool,
      tools.ArrowAnnotateTool,
    ]) {
      tools.addTool(Tool);
    }
    return { core, loader, tools };
  })().catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

/** 원본 바이트를 로더 파일 관리자에 등록하고 imageId(dicomfile:N)를 돌려준다. */
export async function registerDicomFile(bytes: ArrayBuffer): Promise<string> {
  const { loader } = await initCornerstone();
  return loader.wadouri.fileManager.add(
    new Blob([bytes], { type: "application/dicom" }),
  );
}

/** 멀티프레임은 1부터 시작하는 frame 매개변수를 붙인다. */
export function frameImageId(
  baseImageId: string,
  frameNumber?: number,
): string {
  return frameNumber === undefined
    ? baseImageId
    : `${baseImageId}?frame=${frameNumber}`;
}

/** 등록한 파일과 캐시를 해제한다. 이미 해제된 항목은 무시한다. */
export async function releaseDicomFiles(
  baseImageIds: readonly string[],
  imageIds: readonly string[],
): Promise<void> {
  if (!initialization) return;
  let modules: CornerstoneModules;
  try {
    modules = await initialization;
  } catch {
    // 엔진이 초기화되지 않았으면 해제할 등록도 없다.
    return;
  }
  const { core, loader } = modules;
  for (const imageId of imageIds) {
    try {
      core.cache.removeImageLoadObject(imageId, { force: true });
    } catch {
      // 아직 로드되지 않은 영상
    }
  }
  for (const baseImageId of baseImageIds) {
    loader.wadouri.dataSetCacheManager.unload(
      baseImageId.slice(baseImageId.indexOf(":") + 1),
    );
    loader.wadouri.fileManager.remove(
      Number(baseImageId.slice(baseImageId.indexOf(":") + 1)),
    );
  }
}
