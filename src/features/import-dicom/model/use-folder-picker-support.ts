import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const getSnapshot = () =>
  typeof HTMLInputElement !== "undefined" &&
  "webkitdirectory" in HTMLInputElement.prototype;
// 서버 렌더링에서는 지원 여부를 알 수 없으므로 미지원으로 두고 클라이언트에서 다시 계산한다.
const getServerSnapshot = () => false;

/** 브라우저가 폴더 선택(input webkitdirectory)을 지원하는지 감지한다. */
export function useFolderPickerSupport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
