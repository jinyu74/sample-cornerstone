import { APP_DATABASE_NAME } from "./app-database";

/**
 * 로그인 도입 이전의 익명 공용 저장소 이름. 새 코드는 이 저장소를 열지 않고,
 * 지우거나 계정에 자동으로 옮기지도 않는다(README 의 이전 자료 안내 참고).
 */
export const LEGACY_DATABASE_NAME = APP_DATABASE_NAME;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 서버가 검증한 계정 ID 별 브라우저 저장소 이름 */
export function userDatabaseName(userId: string): string {
  if (!UUID.test(userId)) {
    throw new Error("계정 저장소 이름에는 UUID 형식의 사용자 ID 가 필요합니다");
  }
  return `${APP_DATABASE_NAME}:user:${userId.toLowerCase()}`;
}
