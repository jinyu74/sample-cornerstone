"use server";

import { redirect } from "next/navigation";

import { createServerSupabase } from "@/shared/api/supabase/server";

import {
  classifySignInError,
  parseSignInForm,
  type SignInState,
} from "../model/sign-in";

/**
 * 이메일·비밀번호 로그인(Server Action). 입력은 서버에서 다시 검증하고,
 * 성공하면 Supabase 가 세션 쿠키를 응답에 쓴 뒤 안전한 내부 경로로 이동한다.
 * 실패·설정 누락·서비스 오류는 성공으로 표시하지 않는다. 비밀번호는 기록하지 않는다.
 */
export async function signInAction(
  _previous: SignInState,
  data: FormData,
): Promise<SignInState> {
  const parsed = parseSignInForm(data);
  if (!parsed.ok) return parsed.state;

  let error: unknown;
  try {
    const supabase = await createServerSupabase();
    ({ error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password,
    }));
  } catch (caught) {
    error = caught;
  }
  if (error) return classifySignInError(error);
  redirect(parsed.next);
}
