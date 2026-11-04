"use client";

import { createContext, type ReactNode, use } from "react";

import type { DicomStore } from "./types";

const DicomStoreContext = createContext<DicomStore | null>(null);

/** 현재 로그인 계정의 원본 DICOM 저장소를 하위 화면에 제공한다 */
export function DicomStoreProvider({
  store,
  children,
}: {
  store: DicomStore;
  children: ReactNode;
}) {
  return <DicomStoreContext value={store}>{children}</DicomStoreContext>;
}

/** 계정 저장소. 전역 공용 저장소로 대체하지 않으며 Provider 가 없으면 오류를 낸다. */
export function useDicomStore(): DicomStore {
  const store = use(DicomStoreContext);
  if (!store) {
    throw new Error(
      "계정 저장소가 없습니다. 보호된 화면은 UserStorageProvider 안에서 렌더링해야 합니다",
    );
  }
  return store;
}
