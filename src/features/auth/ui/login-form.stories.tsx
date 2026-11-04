import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import type { SignInState } from "../model/sign-in";

import { LoginForm } from "./login-form";

type Action = (state: SignInState, data: FormData) => Promise<SignInState>;

const idle: Action = async () => ({ status: "idle" });

const meta = {
  title: "features/auth/LoginForm",
  component: LoginForm,
  args: {
    action: fn<Action>(idle),
    next: "/studies/1.2.3?series=4",
  },
  decorators: [(Story) => <div className="w-full max-w-sm">{Story()}</div>],
} satisfies Meta<typeof LoginForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "로그인" })).toBeVisible();
    // 관리자가 만든 계정만 쓴다: 가입·소셜 로그인 진입점이 없다
    await expect(canvas.queryByRole("link")).toBeNull();
    await expect(canvas.queryByText(/가입|Google|sign up/i)).toBeNull();

    // 키보드만으로 입력·제출한다
    await userEvent.tab();
    await expect(canvas.getByLabelText("이메일")).toHaveFocus();
    await userEvent.keyboard("reader@example.test");
    await userEvent.tab();
    await expect(canvas.getByLabelText("비밀번호")).toHaveFocus();
    await expect(canvas.getByLabelText("비밀번호")).toHaveAttribute(
      "type",
      "password",
    );
    await userEvent.keyboard("not-a-real-password{Enter}");

    await expect(args.action).toHaveBeenCalledTimes(1);
    const data = (args.action as ReturnType<typeof fn<Action>>).mock
      .calls[0]![1];
    await expect(data.get("email")).toBe("reader@example.test");
    await expect(data.get("next")).toBe("/studies/1.2.3?series=4");
  },
};

// 응답을 기다리는 동안의 상태. 확인 후 응답을 끝내 다음 Story 의 전환에 얽히지 않게 한다.
let finishPending: (state: SignInState) => void = () => undefined;

export const Submitting: Story = {
  args: {
    action: fn<Action>(
      () =>
        new Promise<SignInState>((resolve) => {
          finishPending = resolve;
        }),
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("이메일"), "a@example.test");
    await userEvent.type(canvas.getByLabelText("비밀번호"), "pw");
    await userEvent.click(canvas.getByRole("button", { name: "로그인" }));
    const busy = await canvas.findByRole("button", { name: "로그인 중…" });
    await expect(busy).toBeDisabled();
    await expect(canvas.queryByRole("alert")).toBeNull();
    finishPending({ status: "idle" });
    await expect(
      await canvas.findByRole("button", { name: "로그인" }),
    ).toBeEnabled();
  },
};

export const InvalidCredentials: Story = {
  args: {
    action: fn<Action>(async () => ({
      status: "error",
      code: "invalid-credentials",
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    })),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("이메일"), "a@example.test");
    await userEvent.type(canvas.getByLabelText("비밀번호"), "wrong");
    await userEvent.click(canvas.getByRole("button", { name: "로그인" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "이메일 또는 비밀번호가 올바르지 않습니다.",
    );
    // 실패를 성공처럼 보이지 않고 다시 시도할 수 있다
    await expect(canvas.getByRole("button", { name: "로그인" })).toBeEnabled();
    await expect(canvas.getByLabelText("이메일")).toHaveValue("a@example.test");
  },
};

export const ServiceUnavailable: Story = {
  args: {
    action: fn<Action>(async () => ({
      status: "error",
      code: "service-unavailable",
      message: "인증 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요.",
    })),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("이메일"), "a@example.test");
    await userEvent.type(canvas.getByLabelText("비밀번호"), "pw");
    await userEvent.click(canvas.getByRole("button", { name: "로그인" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "인증 서비스에 연결할 수 없습니다",
    );
  },
};

export const SignedOut: Story = {
  args: { notice: "로그아웃했습니다." },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "로그아웃했습니다.",
    );
  },
};
