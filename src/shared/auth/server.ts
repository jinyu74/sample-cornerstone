// 서버 전용 진입점: 클라이언트 번들에서 import 하면 server-only 가 빌드를 막는다.
export {
  AuthServiceError,
  getCurrentUser,
  loginPath,
  requireUser,
} from "./current-user";
