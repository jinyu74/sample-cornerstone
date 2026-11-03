import { LoginForm, SignedOutNotifier, signInAction } from "@/features/auth";
import { AppHeader } from "@/shared/ui/app-header";

export interface LoginPageProps {
  /** 서버가 검증한 로그인 후 복귀 경로 */
  next: string;
  /** 서버 로그아웃 직후 도착했는지(다른 탭에 알린다) */
  signedOut?: boolean;
}

/** 로그인 화면. 이 화면에서는 계정 저장소를 열지 않는다. */
export function LoginPage({ next, signedOut = false }: LoginPageProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="flex flex-1 items-center justify-center p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-4">
          {signedOut ? <SignedOutNotifier /> : null}
          <LoginForm
            action={signInAction}
            next={next}
            notice={signedOut ? "로그아웃했습니다." : undefined}
          />
          <p className="text-center text-xs text-muted-foreground">
            영상과 작업 결과는 계정별로 이 브라우저에만 저장됩니다.
          </p>
        </div>
      </main>
    </div>
  );
}
