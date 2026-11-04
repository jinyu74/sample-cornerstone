"use client";

import { createContext, type ReactNode, use } from "react";

import type { StudyWorkStore } from "./types";

const StudyWorkStoreContext = createContext<StudyWorkStore | null>(null);

/** 현재 로그인 계정의 작업 결과 저장소를 하위 화면에 제공한다 */
export function StudyWorkStoreProvider({
  store,
  children,
}: {
  store: StudyWorkStore;
  children: ReactNode;
}) {
  return (
    <StudyWorkStoreContext value={store}>{children}</StudyWorkStoreContext>
  );
}

/** 계정 작업 결과 저장소. 전역 공용 저장소로 대체하지 않으며 Provider 가 없으면 오류를 낸다. */
export function useStudyWorkStore(): StudyWorkStore {
  const store = use(StudyWorkStoreContext);
  if (!store) {
    throw new Error(
      "계정 작업 결과 저장소가 없습니다. 보호된 화면은 UserStorageProvider 안에서 렌더링해야 합니다",
    );
  }
  return store;
}
