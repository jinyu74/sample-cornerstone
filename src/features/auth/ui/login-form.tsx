"use client";

import { useActionState, useId, useState } from "react";

import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";

import { INITIAL_SIGN_IN_STATE, type SignInState } from "../model/sign-in";

export interface LoginFormProps {
  /** 서버 액션. 성공하면 서버가 next 로 리다이렉트하므로 오류 상태만 돌려준다. */
  action: (state: SignInState, data: FormData) => Promise<SignInState>;
  /** 로그인 후 돌아갈 내부 경로(서버가 다시 검증한다) */
  next: string;
  /** 로그아웃 직후 등 안내 문구 */
  notice?: string;
}

/** 관리자가 만든 이메일·비밀번호 계정 로그인. 가입·소셜 로그인은 제공하지 않는다. */
export function LoginForm({ action, next, notice }: LoginFormProps) {
  const [state, submit, pending] = useActionState(
    action,
    INITIAL_SIGN_IN_STATE,
  );
  const ids = useId();
  // 폼 액션 후 React 가 입력을 초기화해도 실패 시 이메일은 유지한다(비밀번호는 다시 입력)
  const [email, setEmail] = useState("");
  const error = state.status === "error" ? state : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg font-semibold">로그인</h1>
        </CardTitle>
        <CardDescription>
          관리자가 발급한 이메일 계정으로 로그인하세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={submit}
          aria-describedby={error ? `${ids}-error` : undefined}
        >
          <input type="hidden" name="next" value={next} />
          <FieldGroup>
            {notice && !error ? (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}
            {error ? (
              <Alert variant="destructive" id={`${ids}-error`}>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`${ids}-email`}>이메일</FieldLabel>
              <Input
                id={`${ids}-email`}
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="username"
                required
                aria-invalid={error?.code === "invalid-input" || undefined}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-password`}>비밀번호</FieldLabel>
              <Input
                id={`${ids}-password`}
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? (
                <>
                  <Spinner aria-hidden />
                  로그인 중…
                </>
              ) : (
                "로그인"
              )}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
