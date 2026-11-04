/** 화면에 전달하는 최소 사용자 정보(DTO). 토큰·세션은 포함하지 않는다. */
export interface SessionUser {
  id: string;
  email: string | null;
}
