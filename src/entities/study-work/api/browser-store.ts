import { createIndexedDbWorkStore } from "./indexed-db-work-store";
import type { StudyWorkStore } from "./types";

let store: StudyWorkStore | undefined;

/** 브라우저 탭에서 공유하는 기본 작업 결과 저장소(IndexedDB) */
export function getBrowserWorkStore(): StudyWorkStore {
  store ??= createIndexedDbWorkStore();
  return store;
}
