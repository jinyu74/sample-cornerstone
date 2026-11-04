import { readdirSync } from "node:fs";
import path from "node:path";
import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

/** CLI 역할 대역: 생성하지 않은 기존 DB 삭제는 허용하지 않는다(실제 DB 명령은 실행하지 않음). */
const cli = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: cli.exec }));

const signature = {
  rls: [
    ["catalog_studies", true, false, []],
    ["catalog_series", true, false, []],
    ["catalog_instances", true, false, []],
    ["catalog_study_summaries", false, false, ["security_invoker=true"]],
  ],
  functions: [
    [
      "sync_catalog_study(uuid,jsonb)",
      false,
      ['search_path=""'],
      ["authenticated=X/postgres"],
    ],
  ],
  tableGrants: [],
};

describe("migration 재현 검증의 임시 DB 소유권", () => {
  it("실행 전에 존재하던 DB는 삭제하지 않고 자신이 만든 DB만 정리한다", async () => {
    const created = new Set<string>();
    const removed: string[] = [];
    const versions = readdirSync(path.resolve("supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.split("_")[0]);
    cli.exec.mockImplementation((_binary: string, args: string[]) => {
      if (args[0] === "status")
        return JSON.stringify({
          API_URL: "http://127.0.0.1:55321",
          DB_URL: "postgresql://postgres:synthetic@127.0.0.1:55322/postgres",
        });
      if (args[0] === "migration" && args[1] === "list")
        return JSON.stringify({
          migrations: versions.map((v) => ({ local: v, remote: v })),
        });
      if (args[0] === "migration") return "applied";
      const sql = args.at(-1) ?? "";
      const create = /^create database ([a-z0-9_]+)/i.exec(sql);
      if (create) {
        created.add(create[1]!);
        return "CREATE DATABASE";
      }
      const drop = /^drop database(?: if exists)? ([a-z0-9_]+)/i.exec(sql);
      if (drop) {
        if (!created.has(drop[1]!))
          throw new Error("검증이 만들지 않은 기존 DB 삭제 시도");
        removed.push(drop[1]!);
        return "DROP DATABASE";
      }
      if (sql.includes("jsonb_build_object"))
        return JSON.stringify({ rows: [{ signature }] });
      return "OK";
    });

    await expect(
      import("../../scripts/db/verify-migrations"),
    ).resolves.toBeDefined();
    expect(created.size).toBe(1);
    expect(removed).toEqual([...created]);
  });
  it("명령이 실패해도 연결 비밀번호를 오류·cause에 노출하지 않는다", async () => {
    vi.resetModules();
    const secret = "synthetic-db-password-for-red";
    cli.exec.mockImplementation((_binary: string, args: string[]) => {
      if (args[0] === "status")
        return JSON.stringify({
          API_URL: "http://127.0.0.1:55321",
          DB_URL: `postgresql://postgres:${secret}@127.0.0.1:55322/postgres`,
        });
      if (args[0] === "migration" && args[1] === "up")
        throw new Error(`Command failed: supabase ${args.join(" ")}`);
      return "OK";
    });
    let failure: unknown;
    try {
      await import("../../scripts/db/verify-migrations");
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(inspect(failure, { depth: 8 })).not.toContain(secret);
  });
});
