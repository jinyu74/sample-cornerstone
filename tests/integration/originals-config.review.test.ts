import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { SupabaseConfigError } from "@/shared/config/supabase-env";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/api/supabase/server", () => ({
  createServerSupabase: async () => {
    throw new SupabaseConfigError("invalid-auth-config");
  },
}));

const origin = "http://127.0.0.1:3100";
const sop = "2.25.998003";
const owner = "8f14e45f-ceea-4e7a-9b1c-00000000000a";

describe("Proxy를 거치지 않는 원본 API의 인증 설정 실패", () => {
  it.each(["GET", "PUT"] as const)(
    "%s도 설정 오류를 경로·상세 노출 없이 캐시 금지503으로 처리한다",
    async (method) => {
      const route =
        await import("@/app/api/originals/instances/[sopUid]/route");
      const request = new NextRequest(
        `${origin}/api/originals/instances/${sop}`,
        {
          method,
          headers: {
            origin,
            host: "127.0.0.1:3100",
            "sec-fetch-site": "same-origin",
            "content-type": "application/dicom",
            "x-expected-user-id": owner,
          },
        },
      );
      const response = await route[method](request, {
        params: Promise.resolve({ sopUid: sop }),
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({ status: "unavailable" });
    },
  );
});
