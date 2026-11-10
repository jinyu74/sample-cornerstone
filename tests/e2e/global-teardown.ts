import { removeOwnedOriginalsRoot } from "./originals-paths";

/** 이번 실행이 직접 만든(토큰 표식이 맞는) 서버 원본 루트만 지운다. 이전 폴더·사용자 폴더는 그대로 둔다 */
export default async function globalTeardown() {
  await removeOwnedOriginalsRoot();
}
