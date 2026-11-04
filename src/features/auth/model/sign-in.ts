import { safeNextPath } from "@/shared/lib/navigation";

export type SignInErrorCode =
  "invalid-input" | "invalid-credentials" | "service-unavailable";

/** 로그인 폼 상태. 성공하면 서버가 리다이렉트하므로 성공 상태는 없다. */
export type SignInState =
  | { status: "idle" }
  | { status: "error"; code: SignInErrorCode; message: string };

export const INITIAL_SIGN_IN_STATE: SignInState = { status: "idle" };

const MESSAGES: Record<SignInErrorCode, string> = {
  "invalid-input": "이메일과 비밀번호를 입력하세요.",
  "invalid-credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "service-unavailable":
    "인증 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요.",
};

function failure(code: SignInErrorCode): SignInState {
  return { status: "error", code, message: MESSAGES[code] };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedSignIn =
  | { ok: true; email: string; password: string; next: string }
  | { ok: false; state: SignInState };

/** 서버에서 폼 입력을 검증한다. 클라이언트 검증을 신뢰하지 않는다. */
export function parseSignInForm(data: FormData): ParsedSignIn {
  const email = data.get("email");
  const password = data.get("password");
  const next = data.get("next");
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    password === "" ||
    !EMAIL.test(email.trim())
  ) {
    return { ok: false, state: failure("invalid-input") };
  }
  return {
    ok: true,
    email: email.trim().toLowerCase(),
    password,
    next: safeNextPath(next),
  };
}

/**
 * Supabase Auth 오류를 화면 상태로 바꾼다. 잘못된 자격 증명은 계정 존재 여부를 드러내지 않는
 * 같은 문구로, 그 밖의 오류(네트워크·서버·요청 한도)는 서비스 오류로 알린다.
 */
export function classifySignInError(error: unknown): SignInState {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "invalid_credentials"
  ) {
    return failure("invalid-credentials");
  }
  return failure("service-unavailable");
}
