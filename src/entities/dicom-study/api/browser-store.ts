import { createIndexedDbDicomStore } from "./indexed-db-dicom-store";
import type { DicomStore } from "./types";

let store: DicomStore | undefined;

/** 브라우저 탭 전체에서 공유하는 기본 로컬 저장소(IndexedDB). */
export function getBrowserDicomStore(): DicomStore {
  store ??= createIndexedDbDicomStore();
  return store;
}
