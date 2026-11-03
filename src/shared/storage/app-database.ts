import { openDatabase } from "@/shared/lib/indexed-db";

/**
 * 브라우저 로컬 저장소 스키마. 원본 DICOM(files)과 메타데이터(instances)를 분리해 저장한다.
 * 사이트 데이터 삭제·용량 제한으로 유실될 수 있으므로 UI 와 README 에 이 특성을 알린다.
 */
export const APP_DATABASE_NAME = "dicom-annotator";
/** 1: 원본·메타데이터, 2: 작업 결과(works) 추가 */
export const APP_DATABASE_VERSION = 2;

export const STORE = {
  instances: "instances",
  files: "files",
  works: "works",
} as const;

export const INDEX = {
  instancesBySeries: "bySeries",
  instancesByStudy: "byStudy",
} as const;

export function openAppDatabase(
  factory: IDBFactory,
  name = APP_DATABASE_NAME,
): Promise<IDBDatabase> {
  return openDatabase({
    factory,
    name,
    version: APP_DATABASE_VERSION,
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const instances = database.createObjectStore(STORE.instances, {
          keyPath: "sopInstanceUid",
        });
        instances.createIndex(INDEX.instancesBySeries, [
          "studyInstanceUid",
          "seriesInstanceUid",
        ]);
        instances.createIndex(INDEX.instancesByStudy, "studyInstanceUid");
        database.createObjectStore(STORE.files, { keyPath: "sopInstanceUid" });
      }
      if (oldVersion < 2) {
        // 기존 원본·메타데이터는 그대로 두고 작업 결과 저장소만 추가한다.
        database.createObjectStore(STORE.works, {
          keyPath: "studyInstanceUid",
        });
      }
    },
  });
}
