/**
 * migration 재현 검증(비파괴).
 * 1) 같은 로컬 Postgres 에 실행마다 고유한 임시 DB 를 새로 만들고(시작 전 존재하던 DB 는 지우지 않음), 최소 auth 대역(auth.users·auth.uid)을 둔다.
 * 2) `supabase migration up --db-url` 로 migration 파일을 처음부터 적용한다.
 * 3) 임시 DB 와 실행 중인 로컬 DB 의 catalog 객체 정의(컬럼·제약·인덱스·RLS·정책·권한·view·함수)를 비교한다.
 * 4) 로컬 DB 의 migration history 가 파일과 일치하는지, 보안 불변식(security_invoker·SECURITY INVOKER·user_metadata 미사용)을 확인한다.
 * 5) 이번 실행이 만든 임시 DB 만 삭제한다. 로컬 DB·Auth·볼륨은 reset·삭제하지 않는다.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { assertLocalSupabaseUrl } from "../auth/local-supabase";

/** 실행마다 고유한 임시 DB 이름. 이 형식만 만들고 지운다 */
const CHECK_DB_PREFIX = "dicom_annotator_migration_check_";
const CHECK_DB_PATTERN =
  /^dicom_annotator_migration_check_[0-9a-z]+_[0-9a-f]{12}$/;

function uniqueCheckDb(): string {
  return `${CHECK_DB_PREFIX}${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}
const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** 오류 메시지에 남겨도 되는 명령 요약: 연결 문자열·SQL 은 빼고 하위 명령만 둔다 */
function describeCommand(args: readonly string[]): string {
  const words: string[] = [];
  for (const arg of args) {
    if (arg.startsWith("-")) break;
    words.push(arg);
  }
  return `supabase ${words.join(" ")}`;
}

/**
 * CLI 실행. 실패하면 원래 오류(명령 인자의 db-url 비밀번호, stdout·stderr 포함)를 붙이지 않고
 * 하위 명령과 종료 코드만 담은 새 오류를 던진다.
 */
function supabase(args: string[]): string {
  try {
    return execFileSync("supabase", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? ` (종료 코드 ${String((error as { status: unknown }).status)})`
        : "";
    throw new Error(`${describeCommand(args)} 실패${status}`);
  }
}

function localDbUrl(): URL {
  const status = JSON.parse(supabase(["status", "-o", "json"])) as {
    API_URL?: string;
    DB_URL?: string;
  };
  if (!status.API_URL || !status.DB_URL)
    throw new Error("로컬 Supabase 가 실행 중이 아닙니다");
  assertLocalSupabaseUrl(status.API_URL);
  const url = new URL(status.DB_URL);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("로컬 DB 주소가 아니므로 검증하지 않습니다");
  return url;
}

function query(dbUrl: URL | null, sql: string): Record<string, unknown>[] {
  const target = dbUrl ? ["--db-url", dbUrl.toString()] : ["--local"];
  const out = supabase(["db", "query", ...target, "-o", "json", sql]);
  // DDL 은 JSON 대신 명령 태그(CREATE DATABASE 등)만 출력한다
  const start = out.indexOf("{");
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start)) as {
    rows?: Record<string, unknown>[];
  };
  return parsed.rows ?? [];
}

const TABLES = ["catalog_studies", "catalog_series", "catalog_instances"];
const RELATIONS = [...TABLES, "catalog_study_summaries"];
const list = (names: string[]) => names.map((name) => `'${name}'`).join(", ");

/** 비교할 객체 정의를 한 JSON 으로 모은다(정렬 고정) */
const SIGNATURE_SQL = `
select jsonb_build_object(
  'columns', (select jsonb_agg(jsonb_build_array(table_name, column_name, data_type, is_nullable, column_default) order by table_name, column_name)
              from information_schema.columns where table_schema = 'public' and table_name in (${list(RELATIONS)})),
  'constraints', (select jsonb_agg(jsonb_build_array(conrelid::regclass::text, conname, pg_get_constraintdef(oid)) order by conrelid::regclass::text, conname)
                  from pg_constraint where connamespace = 'public'::regnamespace and conrelid::regclass::text in (${list(TABLES)})),
  'indexes', (select jsonb_agg(jsonb_build_array(tablename, indexname, indexdef) order by tablename, indexname)
              from pg_indexes where schemaname = 'public' and tablename in (${list(TABLES)})),
  'rls', (select jsonb_agg(jsonb_build_array(relname, relrowsecurity, relforcerowsecurity, coalesce(reloptions, '{}')) order by relname)
          from pg_class where relnamespace = 'public'::regnamespace and relname in (${list(RELATIONS)})),
  'policies', (select jsonb_agg(jsonb_build_array(tablename, policyname, permissive, roles, cmd, qual, with_check) order by tablename, policyname)
               from pg_policies where schemaname = 'public' and tablename in (${list(TABLES)})),
  'tableGrants', (select jsonb_agg(jsonb_build_array(table_name, grantee, privilege_type) order by table_name, grantee, privilege_type)
                  from information_schema.role_table_grants where table_schema = 'public' and table_name in (${list(RELATIONS)})),
  'columnGrants', (select jsonb_agg(jsonb_build_array(table_name, column_name, grantee, privilege_type) order by table_name, column_name, grantee, privilege_type)
                   from information_schema.column_privileges where table_schema = 'public' and table_name in (${list(TABLES)})
                     and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')),
  'view', (select pg_get_viewdef('public.catalog_study_summaries'::regclass, true)),
  'functions', (select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text, p.prosecdef, p.proconfig, array(select a from unnest(coalesce(p.proacl::text[], '{}')) a order by a), pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text)
                from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like '%catalog%')
) as signature`;

function signature(dbUrl: URL | null): Record<string, unknown> {
  const [row] = query(dbUrl, SIGNATURE_SQL.replace(/\s+/g, " "));
  const value = row?.signature;
  return (typeof value === "string" ? JSON.parse(value) : value) as Record<
    string,
    unknown
  >;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`검증 실패: ${message}`);
}

function checkInvariants(sig: Record<string, unknown>) {
  const text = JSON.stringify(sig);
  assert(!text.includes("user_metadata"), "정책·함수가 user_metadata 를 쓴다");
  const rls = sig.rls as [string, boolean, boolean, string[]][];
  for (const [name, enabled, , options] of rls) {
    if (name === "catalog_study_summaries")
      assert(
        options.includes("security_invoker=true"),
        "view 가 security_invoker 가 아니다",
      );
    else assert(enabled, `${name} 에 RLS 가 꺼져 있다`);
  }
  const functions = sig.functions as [string, boolean, string[], string[]][];
  assert(functions.length > 0, "동기화 함수가 없다");
  for (const [name, definer, config, acl] of functions) {
    assert(!definer, `${name} 이 SECURITY DEFINER 다`);
    assert(config?.includes('search_path=""'), `${name} search_path 고정 없음`);
    assert(
      !acl.some((entry) => /^(anon)?=.*X/.test(entry)),
      `${name} 을 anon/PUBLIC 이 실행할 수 있다`,
    );
  }
  const grants = sig.tableGrants as [string, string, string][];
  assert(
    !grants.some(([, grantee]) => grantee === "anon" || grantee === "PUBLIC"),
    "anon/PUBLIC 테이블 권한이 있다",
  );
  assert(
    !grants.some(
      ([, grantee, privilege]) =>
        grantee === "authenticated" &&
        ["UPDATE", "DELETE", "TRUNCATE"].includes(privilege),
    ),
    "authenticated 에 UPDATE/DELETE/TRUNCATE 권한이 있다",
  );
}

function checkHistory() {
  const files = readdirSync(path.join(ROOT, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.split("_")[0])
    .sort();
  const out = supabase([
    "migration",
    "list",
    "--local",
    "--output-format",
    "json",
  ]);
  const listed = (
    JSON.parse(out.slice(out.indexOf("{"))) as {
      migrations: { local?: string; remote?: string }[];
    }
  ).migrations;
  for (const version of files)
    assert(
      listed.some((item) => item.local === version && item.remote === version),
      `로컬 DB 에 적용되지 않은 migration ${version}`,
    );
}

function main() {
  const live = localDbUrl();
  const check = new URL(live);
  const checkDb = uniqueCheckDb();
  check.pathname = `/${checkDb}`;

  // 시작 전에 있던 DB 는 지우지 않는다. 같은 이름이 있으면 create 가 실패하고 정리 대상도 아니다.
  query(null, `create database ${checkDb}`);
  const created = checkDb;
  try {
    // 최소 auth 대역: migration 이 참조하는 auth.users·auth.uid() 만 둔다
    query(check, "create schema auth");
    query(check, "create table auth.users (id uuid primary key)");
    query(
      check,
      "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$",
    );
    query(
      check,
      "grant usage on schema auth to anon, authenticated, service_role",
    );
    query(
      check,
      "grant execute on function auth.uid() to anon, authenticated, service_role",
    );
    supabase([
      "migration",
      "up",
      "--db-url",
      check.toString(),
      "--include-all",
    ]);

    const fresh = signature(check);
    const current = signature(null);
    checkInvariants(fresh);
    const a = JSON.stringify(fresh);
    const b = JSON.stringify(current);
    if (a !== b) {
      const dir = path.join(ROOT, ".local", "db-verify");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, "fresh.json"),
        JSON.stringify(fresh, null, 2),
      );
      writeFileSync(
        path.join(dir, "local.json"),
        JSON.stringify(current, null, 2),
      );
      console.error(`비교 파일: ${dir}`);
      for (const key of Object.keys(fresh))
        if (JSON.stringify(fresh[key]) !== JSON.stringify(current[key]))
          console.error(`차이: ${key}`);
      throw new Error(
        "검증 실패: migration 으로 만든 스키마가 로컬 DB 와 다르다",
      );
    }
    checkHistory();
    console.log(
      "migration 재현 검증 통과: 새 DB 적용 결과가 로컬 DB 와 같고 보안 불변식을 만족한다",
    );
  } finally {
    // 이번 실행이 만든 DB 만, 이름 형식을 다시 확인한 뒤 정리한다(역할 등 클러스터 공용 객체는 건드리지 않는다)
    if (!CHECK_DB_PATTERN.test(created) || created === live.pathname.slice(1))
      throw new Error("정리 대상이 이번 검증의 임시 DB 가 아닙니다");
    query(null, `drop database ${created} with (force)`);
  }
}

main();
