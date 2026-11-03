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
  async dispose(stores) {
    stores.dicom.closeWhenIdle();
    stores.work.closeWhenIdle();
    await Promise.all([stores.dicom.whenClosed(), stores.work.whenClosed()]);
  },
});

/**
 * 계정 저장소가 마지막 보유자 해제 뒤 진행 중·직렬 저장을 마치고 닫힐 때까지 기다린다.
 * 세션이 끝나 보호 화면을 치운 뒤 문서를 이동하기 전에 쓴다(저장 중 이동으로 쓰기가 끊기지 않게).
 */
export function waitForUserStorageReleased(userId: string): Promise<void> {
  return registry.whenReleased(userId);
}

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
