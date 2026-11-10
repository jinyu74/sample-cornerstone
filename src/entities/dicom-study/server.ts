// 서버 전용 공개 진입점: 클라이언트 번들에서 import 하면 server-only 가 빌드를 막는다.
import "server-only";

export { listCatalogStudies, syncCatalogStudy } from "./api/server-catalog";
export {
  listStoredOriginals,
  readOriginal,
  storeOriginal,
} from "./api/server-originals";
export type {
  OriginalFailure,
  ReadOriginalOutcome,
  StoreOriginalOutcome,
} from "./api/server-originals";
// Route Handler 가 클라이언트 hook 이 섞인 공개 진입점을 거치지 않도록 순수 검증도 여기서 내보낸다
export {
  CATALOG_LIMITS,
  parseCatalogSyncRequest,
} from "./model/catalog-metadata";
export type { CatalogListResult } from "./model/catalog-summary";
