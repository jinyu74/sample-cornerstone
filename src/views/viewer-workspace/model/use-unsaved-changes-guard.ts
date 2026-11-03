import { useCallback, useEffect, useRef } from "react";

/**
 * 저장하지 않은 변경이 있으면 탭 닫기·새로고침 등 문서 이탈 전에 브라우저 확인을 띄운다.
 * 저장을 마쳤거나 사용자가 이미 확인한 이탈(로그아웃)은 release 로 확인을 끈다.
 */
export function useUnsavedChangesGuard(unsaved: boolean) {
  const released = useRef(false);

  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (released.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  const release = useCallback(() => {
    released.current = true;
  }, []);

  return { release };
}
