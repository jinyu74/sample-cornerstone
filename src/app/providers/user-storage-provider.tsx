"use client";

import { type ReactNode, useEffect } from "react";

import {
  createIndexedDbDicomStore,
  DicomStoreProvider,
  type IndexedDbDicomStore,
} from "@/entities/dicom-study";
import {
  createIndexedDbWorkStore,
  type IndexedDbWorkStore,
  StudyWorkStoreProvider,
} from "@/entities/study-work";
import { createRetainedRegistry } from "@/shared/lib/retained-registry";
import { userDatabaseName } from "@/shared/storage";

interface UserStores {
  dicom: IndexedDbDicomStore;
  work: IndexedDbWorkStore;
}

/**
 * 계정별 저장소 묶음. 같은 계정의 화면 이동·StrictMode 재마운트에서는 같은 연결을 재사용하고,
 * 마지막 보유자가 떠나면 진행 중 저장(직렬 flush 포함)이 끝난 뒤 닫는다.
 */
const registry = createRetainedRegistry<string, UserStores>({
  create(userId) {
    const databaseName = userDatabaseName(userId);
    return {
      dicom: createIndexedDbDicomStore({ databaseName }),
      work: createIndexedDbWorkStore({ databaseName }),
    };
  },
  dispose(stores) {
    stores.dicom.closeWhenIdle();
    stores.work.closeWhenIdle();
  },
});

/**
 * 서버가 검증한 계정 ID 의 브라우저 저장소만 하위 화면에 제공한다.
 * 계정이 바뀔 때는 `key={userId}` 로 하위 트리 전체를 새로 만들어 이전 계정의 화면 상태를 남기지 않는다.
 */
export function UserStorageProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const stores = registry.get(userId);
  useEffect(() => registry.retain(userId), [userId]);
  return (
    <DicomStoreProvider store={stores.dicom}>
      <StudyWorkStoreProvider store={stores.work}>
        {children}
      </StudyWorkStoreProvider>
    </DicomStoreProvider>
  );
}
