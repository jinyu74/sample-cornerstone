import { useEffect } from "react";

/** 저장하지 않은 변경이 있으면 탭 닫기·새로고침 전에 브라우저 확인을 띄운다 */
export function useUnsavedChangesGuard(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);
}
