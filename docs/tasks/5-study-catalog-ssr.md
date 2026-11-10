# 이슈 #5 — 검사 메타데이터·계정별 RLS 및 SSR 목록

- 이슈: https://github.com/jinyu74/sample-cornerstone/issues/5
- 브랜치: `feat/5-study-catalog-ssr`, 기준 main `41fb4d60cce0bab0a6fe893e54233ed13d611e9e`(사용자 요청으로 PR #4 병합 완료)
- 역할: Opus 구현, 감독 Codex 사전 검수·git·PR, 별도 Codex `$review-agent` 리뷰. 이번 후속 PR의 병합 허가는 아직 없다.

## 목표

로컬 Supabase에 계정별 DICOM 검사 메타데이터를 저장하고 Next.js 서버 렌더링 목록으로 보여준다. 병합한 PR #4의 인증·계정별 브라우저 저장 경계를 확장한다.

## 범위

- 검사·시리즈·인스턴스의 목록용 메타데이터 모델/스키마, 로컬 migration, 계정별 RLS와 최소 권한
- 인증된 서버 저장·조회 경로, 메타데이터 동기화·실패 재시도, 실제 SSR 검사 목록
- 서버 목록과 이 브라우저 원본/작업 상태의 차이를 표시하고 기존 계정 자료를 보존
- 테스트 우선, mise/pnpm, FSD·타입/모델·책임별 hook, shadcn UI/Stories, 감독 검수·별도 PR 리뷰

원본 DICOM·픽셀·파일 Blob/base64·작업 결과 JSON을 DB 또는 Supabase Storage에 보내지 않는다. 서버 영상 폴더/API·결과 서버 저장·클라우드·공유 권한은 후속 범위다.

## 인수 조건과 검증 시나리오

1. 가져온 원본은 계정별 IndexedDB에 보존하고 허용된 메타데이터만 서버로 보낸다. 서버 입력도 엄격히 검증하며 파일/픽셀·과도한 payload를 거부한다.
2. 기존 계정 단위 소유권을 유지한다. 실제 Auth와 Data API로 anon·B의 A 자료 조회/쓰기·소유권 변경을 차단한다. 사용자 A/B는 같은 UID를 독립 소유할 수 있다. 앱은 service secret 없이 사용자 세션과 RLS를 사용한다.
3. 늦게 끝난 A의 요청이 B 로그인 뒤 B 자료로 귀속되지 않는다. 서버는 요청의 의도한 계정과 현재 인증 계정을 비교하고 불일치 시 거부한다. 클라이언트 소유권 값만 믿지 않는다.
4. 중복·재시도·동시 동기화에도 검사/시리즈/영상 수가 중복 증가하지 않고 UID 계층과 digest 충돌을 검증한다. 실패 시 기존 서버 레코드를 잘못 덮어쓰지 않는다.
5. 인증된 최초 HTML에 해당 계정 목록 행이 존재한다. JS 비활성/서버 HTTP 응답으로 SSR을 검증하고 다른 계정 자료·공유 캐시 누출을 검사한다.
6. 같은 계정의 새 브라우저에는 서버 검사 정보가 보이나 로컬 원본이 없다는 안내가 보인다. 일부 원본·불일치 원본도 구분하고 없는 영상이 열린다고 표시하지 않는다.
7. 결과는 아직 로컬이다. 다른 브라우저의 작업 상태를 임의로 '미작업'이라 단정하지 않는다. 기존 필터·측정·저장·JSON·도구 전환 동작은 유지한다.
8. 메타데이터 저장 실패는 로컬 원본 손실이나 성공 오표시를 일으키지 않는다. 실패·미동기화·재시도 상태를 제공하고 재시도는 멱등적이다. 기존 계정 로컬 검사를 숨기거나 익명 DB를 자동 귀속하지 않는다.
9. 로컬 migration을 재현 가능하게 관리한다. 기존 Auth 계정·볼륨/다른 프로젝트를 reset·삭제하지 않고 합성 테스트 계정의 자료만 정리한다. 실제 DB RLS 검증과 migration 검증을 테스트 스크립트로 제공한다.
10. 정상·경계·실패 테스트를 먼저 작성하고 의도한 Red를 확인한 뒤 구현한다. 단위/실제DB 통합/Stories/SSR·브라우저 E2E와 기존 회귀를 유지한다.

## 필수 검사

`pnpm typecheck`, `lint`, `format:check`, `test`, `test:stories`, `build`, `build-storybook`, `test:e2e`, `test:e2e:dev` 및 실제 로컬 RLS/migration 검사. 실행하지 못한 항목은 명시한다.

## 협업·병합

감독 Codex가 브랜치/지시/검수/커밋/PR을 담당하고 Opus는 실패 테스트→구현→검사 결과를 보고한다. PR 이후 별도 Codex가 `$review-agent`로 검토하고 같은 계정 댓글로 기록한다. 이 후속 PR은 별도의 사용자 명시적 요청 없이는 main에 병합하지 않는다.

## 설계·검수 경계

- 기존 계정별 소유권과 관리자 생성 계정 정책을 확장한다. 공유·조직·관리자 역할을 새로 도입하지 않는다. 서버는 현재 Auth 계정만 승인하며 클라이언트 expected account 값은 계정 변경 경합 거부용이지 권한 근거가 아니다.
- 목록용으로 필요한 기존 메타데이터(UID·날짜·설명·기존 식별자·modality·시리즈/인스턴스 요약·정합성용 digest)를 명시적 allowlist로 투영한다. 새 환자 인구통계 필드나 전체 원본 헤더를 무차별 JSON으로 전송하지 않는다. 숫자/문자열/배치/요청 크기를 제한하고 unknown 필드·픽셀·파일 값을 거부한다.
- 검사/시리즈/인스턴스 정규화와 owner를 포함한 키·계층 FK·RLS·인덱스를 검토한다. 클라이언트가 보낸 aggregate count만 덮어쓰는 구조는 중복·재시도·동시 요청에 취약하다. 같은 owner의 SOP UID digest/계층 충돌은 기존 자료를 보존하면서 실패로 보고한다. 테이블/컬럼/RPC 이름은 담당자가 모델·테스트로 결정한다.
- RLS는 실제 사용자 JWT로 Data API에 직접 요청해 확인한다. SELECT/INSERT/UPDATE(WITH CHECK)/허용한 DELETE 및 RPC·view 경계를 모두 검사한다. 필요 없는 권한은 부여하지 않는다. user_metadata를 권한 근거로 쓰지 않는다. app에 service key를 넣거나 SECURITY DEFINER로 RLS를 우회하지 않는다. view가 필요하면 security_invoker 등 권한을 확인한다.
- 서버 전용 DAL은 기존 `getCurrentUser`/`requireUser`와 요청별 Supabase 클라이언트를 사용하고 최소 DTO만 client에 전달한다. 사용자별 목록·mutation 응답은 캐시를 공유하지 않는다. 서버에서 가져온 목록을 클라이언트 props로 넘겨 행 자체가 SSR되게 하며, 단순히 hydration 후 fetch한 것을 SSR이라 부르지 않는다.
- 목록의 서버 메타데이터와 이 브라우저 원본 유무는 별개다. 확인 중/전체 있음/일부 없음/없음·digest 불일치를 정직하게 표시한다. 원본이 없으면 재가져오기 경로를 제공하고, 아직 로컬인 작업 상태를 다른 기기에서 미작업/완료라고 추측하지 않는다. 기존 브라우저 작업 상태·필터는 유지한다.
- 기존 계정 IndexedDB 자료는 보존한다. 서버에 미동기화된 기존 로컬 검사를 숨기지 않고, 명시적인 메타데이터 동기화/재시도 흐름을 제공한다. 익명 legacy DB는 열거나 자동 귀속·삭제하지 않는다.
- 동기화 실패 시 로컬 가져오기 성공과 서버 목록 반영 실패를 구분한다. 재시도는 같은 사용자 범위에서 멱등적이어야 하며, A 작업의 늦은 응답·재시도가 B 로그인 뒤 B 자료로 쓰이거나 B UI에 반영되지 않아야 한다.
- 실제 DB 통합·E2E의 자료 격리를 먼저 설계한다. 기존 E2E는 새 browser=context마다 빈 IndexedDB였지만 서버 DB는 지속되므로 테스트 간 데이터가 섞이지 않게 한다. 합성 test account의 해당 자료만 준비/정리하고 사용자 계정·Auth 세션·다른 프로젝트/볼륨을 reset하지 않는다. 기존 로컬 Supabase `db reset`·볼륨 삭제 금지. migration 재현 검증도 비파괴적인 별도 테스트 경계로 설계한다.
- UI/도메인 DTO·타입/저장소/동기화 hook/라우트 조립을 FSD 원칙으로 분리한다. server-only 공개 진입점과 client-safe 진입점도 구분한다. 실제 쓰는 변경·신규 디자인 컴포넌트에 상태·키보드·a11y Stories를 먼저 작성한다.

## 시작 순서와 보고

1. AGENTS/CLAUDE/공통 절차와 Supabase·Postgres·React·shadcn 스킬, 설치된 Next 문서를 읽는다. 버전을 추측하지 않고 필요한 경우에만 mise/pnpm으로 고정한다.
2. 전체 시나리오·인수 조건 대응, 최소 스키마/경로/DTO 설계, 테스트 데이터 격리·migration 검증 계획을 보고한다. 이미 확정된 로컬/계정 소유권 범위의 일상 구현은 보고 후 진행한다. 새 권한 모델·원본 보관/전송/삭제·클라우드/비용 등 결정만 감독에게 즉시 알린다.
3. 단위와 실제 DB 경계의 실패 테스트를 먼저 작성해 의도한 Red를 확인한다. SQL/서버/UI/Stories/SSR E2E 모두 구현보다 행동 테스트가 먼저다. 지난 인증 단계의 E2E 구현 선행을 반복하지 않는다. 환경 준비가 필요한 항목은 시나리오·실패 기준을 먼저 정하고 준비 후 기능 구현 전에 Red를 확인한다.
4. 스키마/서버·동기화/SSR UI를 작은 단위로 구현하고 각 단계 Red→Green·로그·미검증을 감독에게 보고한다. 감독 지적을 회귀로 재현해 수정한다. 최종 전체검사 전에는 완료로 부르지 않는다.
5. 최종 단위/실제 DB RLS·migration/Story/type/lint/format/앱·Storybook build/dev·prod E2E와 합성 DICOM 회귀(현재50개)를 유지·실행한다. SSR HTML, 다른 브라우저 원본 없음, 네트워크에 픽셀 없음, 계정 변경 경합을 실제 브라우저·요청으로 검증한다.
6. Next 빌드/E2E는 감독과 조율한다. 현재 미리보기3000과 로컬 Supabase가 실행 중이다. Storybook dev는 사용자가 직접 실행하므로 임의 기동하지 않는다. headless Story 테스트/빌드는 허용한다.

## 공식 참고·도구

- Supabase 스킬: `/Users/jinyu/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md`
- Postgres 스킬: 같은 skills 루트의 `supabase-postgres-best-practices/SKILL.md`
- 감독이 changelog.md와 공식 RLS 문서·설치된 Next data-security/fetching-data를 확인했다. 담당자도 실제 구현 주제의 최신 문서와 CLI `--help`를 확인한다.
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
- 로컬 SQL 변경은 스킬에 따라 query로 검토·advisors·migration 재현을 수행한다. migration 파일은 CLI가 생성하게 하고 이름을 임의로 만들지 않는다. 클라우드 MCP execute/apply는 사용하지 않는다. SQL/advisors/test CLI의 현재 지원 옵션을 help로 검증한다.
