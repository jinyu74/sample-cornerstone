# 이슈 #7 — 비공개 DICOM 원본 보관·인증 조회

- 이슈: https://github.com/jinyu74/sample-cornerstone/issues/7
- 브랜치: `feat/7-private-dicom-originals`, 기준 main `b511637f2e53921211bfb6c91ae902d282c5e375` (PR #6 사용자 명시 요청으로 병합).
- 역할: Opus 구현, 감독 Codex 사전 검수·git/PR, 별도 Codex review-agent 독립 리뷰. 이번 후속 PR 병합 허가는 아직 없다.

## 목표

사용자가 검사별로 ‘서버에 원본 보관’을 선택하면 DICOM 원본을 서버 비공개 폴더에 저장한다. 같은 계정의 새 브라우저에서 인증·소유권 검증을 거쳐 원본을 불러와 기존 뷰어를 사용할 수 있게 한다. DB에는 목록용 메타데이터만 유지한다.

## 확정된 결정

- 2026-11-10 사용자: PR #6 병합 후 다음 구현. 저장 UX는 추천안인 검사별 명시적 ‘서버에 원본 보관’ 버튼 선택. 신규/기존 원본을 자동 업로드하지 않는다.
- 관리자 생성 계정·개인 소유권을 유지한다. 인증된 소유자만 원본 API 접근. 새로운 역할·공유는 도입하지 않는다.
- 동적 Next.js Node 서버 + 영속 디스크 구조. 저장 루트는 서버 전용 환경변수로 분리하며 public·정적 배포 경로에 두지 않는다. 실제 배포 서비스 선택/배포·클라우드 연결은 제외한다.

## 인수 조건

1. 원본·픽셀·전체 헤더·작업 결과를 DB/Supabase Storage/public에 쓰지 않는다. 기존 로컬/익명 자료를 자동 이전·삭제하지 않는다.
2. 실제 서버 Auth 검증과 owner 경계로 업로드/목록/읽기를 보호한다. 비로그인401, 다른 계정의 UID/파일 추측·경로조작·오래된 기대 계정 요청을 차단하며 경로·비밀값을 응답/로그에 노출하지 않는다. 응답은 no-store.
3. 서버가 원본 DICOM을 직접 파싱하고 digest/UID/계층을 검증한다. 클라이언트의 파일명·UID·digest·owner를 권한이나 저장 경로 근거로 믿지 않는다. 본문 상한을 스트림으로 적용하고 중단·실패·디스크 오류를 처리한다.
4. 임시 파일에서 완성된 원본만 원자적으로 공개한다. 중복·동시 보관·재시도는 멱등이며 같은 SOP의 다른 원본/계층 충돌은 기존 파일·서버 메타데이터를 보존한다. 경로탈출·symlink·덮어쓰기를 방지하고 제한된 파일 권한을 적용한다.
5. 기존 메타데이터 반영과 원본 보관 상태를 분리한다. 실제 원본 없음/일부/보관됨/확인불가·진행/실패/재시도를 정직하게 표시하고 아직 원본을 보내지 않았는데 성공으로 보이지 않는다.
6. 같은 계정의 다른 브라우저에서 서버 보관 원본을 인증 API로 불러와 렌더·측정할 수 있다. 기존 로컬 원본과 결과는 보존하며 결과 서버 저장으로 오인시키지 않는다. 불일치/부분 보관/읽기 실패에서 없는 영상이 열린다고 표시하지 않는다.
7. 테스트용 서버 폴더와 합성 계정만 준비·정리한다. 실제 samples/dicom·사용자 원본·Auth/볼륨 reset 금지. 모든 시나리오는 테스트 먼저 Red→Green→Refactor로 진행한다.
8. FSD·타입/모델·책임별 hook·shadcn/Stories와 기존 회귀를 유지한다. unit·실제 FS/Route 통합·Auth/RLS·새 브라우저 E2E·Story·타입/lint/format·앱/Storybook build·전체 dev/prod E2E를 실행하고 감독이 직접 검수한다.

## 제외 범위

작업 결과 서버 DB, 공유/조직/역할, 자동 업로드/자동 삭제·보존 정책, 클라우드·실배포·유료 서비스 생성, PACS·DICOMweb 서버·MPR/3D.

## 절차

mise/pnpm과 테스트 우선 규칙을 유지한다. Opus 구현→감독 Codex 사전 검수·커밋/PR→별도 Codex `$review-agent` 전체 merge diff 리뷰→같은 계정 리뷰 댓글. 후속 PR의 main 병합은 사용자가 직접 하거나 그 PR·head에 명시적으로 요청한 경우에만 한다.

## 구현 전 설계·검수 지시

1. AGENTS/CLAUDE/공통 개발 절차와 Supabase·React·shadcn·테스트 스킬, 설치된 Next Route Handler/data-security 문서를 읽고 기존 코드·공개 API를 조사한다. 새 도구 설치/업그레이드는 실제 필요한 때만 mise/pnpm으로 한다. Supabase changelog는 `.local/issue7/supabase-changelog.md`에 감독이 최신 조회했다. 기존 로컬/고정 SDK를 이유 없이 업그레이드하지 않는다.
2. 먼저 `.local/issue7/plan.md`에 정상·경계·실패 인수조건 대응, 저장소/소유권/공개API/클라이언트 UX/실제FS·E2E격리·설정·큰파일상한·원자성/재시도 계획을 적고 보고한다. 새 sharing/역할/삭제·보존·비용·배포 결정만 즉시 감독에게 알린다. 수신 크기/동시성 상한은 명시하고 환경설정으로 조정 가능하게 한다.
3. 원본 저장 루트는 server-only 환경변수(예: DICOM_DATA_DIR)의 절대 경로로 설정하고, production은 외부 영속 볼륨을 전제한다. 개발 예시 `.local/dicom-originals`는 git/public 배포 대상에서 제외한다. 잘못된 public/.next/정적 루트·위험 경로·symlink는 fail-closed. 기존 사용자 폴더의 권한·내용을 무작정 바꾸거나 비우지 않는다. 저장 이름은 서버에서 안전하게 결정하고 업로드 파일명을 경로에 쓰지 않는다.
4. 현재 계정을 Auth getUser로 서버에서 검증하고 소유권·카탈로그 digest/계층을 확인한다. expectedUserId는 경합 거부용이지 권한 근거가 아니다. A/B 같은 UID도 파일이 격리돼야 한다. 서버 원본 확인/조회·업로드에서 `service_role` 우회나 공개URL을 쓰지 않는다. DB에 파일 manifest가 꼭 필요한지 먼저 검토하고, 없어도 실제 파일로 가용성을 판정할 수 있으면 불필요한 스키마·privileged 권한은 추가하지 않는다. 새 테이블이 필요하면 설계/권한을 먼저 보고한다.
5. 업로드 원본을 서버에서 직접 파싱·SHA-256 검증하고 allowlist 카탈로그와 정합성을 유지한다. 요청 본문은 길이 헤더를 믿지 말고 상한을 둬 스트림으로 읽는다. multipart/formData의 무제한 전체 메모리 적재를 피하고, 임시 파일·원자적 publish·고유/배타 생성·재시도와 DB/FS 부분실패를 테스트한다. 기존 원본은 덮어쓰거나 지우지 않는다. 동일 SOP의 내용/계층 충돌·동시 요청·중단·초과·디스크 실패에서 성공 오표시/부분파일 제공/다른 요청 파일 삭제가 없어야 한다.
6. 테스트 먼저 작성하고 의도한 Red 확인 후 구현한다. API는 실제 FS + 인증/권한 통합으로 정상·401/403/404·account mismatch·CSRF·invalid DICOM·사칭UID/digest/owner·path traversal·symlink·chunked 초과·동시/중복/실패정리를 검증한다. OS 권한으로 막힌 테스트와 실제 결함을 구분한다. Node API·Next request params/streaming은 설치된 문서 기준으로 확인한다.
7. UI는 metadata반영·원본서버보관·이브라우저원본·로컬결과 상태를 구분한다. 사용자가 선택한 검사별 보관 버튼만 업로드를 시작한다. 새 브라우저는 인증 API로 원본을 불러와 기존 계정별 IndexedDB/뷰어 흐름을 활용할 수 있다. 직접 파일 선택 없이 서버 원본 불러오기→실제렌더→측정의 E2E를 먼저 만든다. 읽는 중 계정전환/취소/부분실패에서 B UI나 B 저장소에 A 원본이 남지 않도록 하며, 기존 다른 로컬 원본/결과를 덮어쓰지 않는다. geometry·전체헤더·원본을 DB/SSR props에 넣지 않는다.
8. 상태/진행/재시도 책임별 hook, 순수 도메인/타입과 어댑터·server-only/client 진입점 분리. 새/변경 shadcn 기반 컴포넌트는 실제 사용하는 Stories에 기본·없음·일부·보관됨·진행·오류·비활성·키보드/a11y를 먼저 포함한다. FSD 공개경계의 필요 예외는 정확한 공개파일 한정이며 광범위 lint 예외 금지.
9. E2E/FS 통합은 새 고유 임시 루트와 합성 A/B만 사용한다. 3000 미리보기 실제원본 저장루트와 분리하고, cleanup은 해당 실행이 만든 파일/루트만 제거한다. `samples/dicom`, 사용자 실제 원본, 기존 Auth/볼륨 reset 금지. 기존 메타데이터/로그인/뷰어·tool switching 58개 회귀와 DB40개를 유지한다.
10. 최종 unit·test:stories·test:db·type/lint/format·production build·Storybook build·dev/prod 전체 E2E·브라우저/SSR/네트워크/실제FS 검증과 README(설정/크기제한/오류/영속디스크/동적배포·백업필요범위)·decisions/progress/reviews/handoff 갱신을 보고한다. 결과DB는 이번 범위가 아님을 UI에도 정확히 알린다.
11. 감독이 코드와 필요한 검사를 직접 검수한다. 각 단계 Red/Green 로그와 주체·미검증을 보고하며 완료를 과장하지 않는다. Next build/dev/prod E2E는 `.next` 공유 충돌이 있으므로 감독과 순서 조율. Storybook dev는 사용자가 직접 실행하므로 임의로 켜지 않는다.
12. git commit/push/PR/브랜치전환/merge는 감독만 한다. 작업 세션/컨텍스트 clear나 재시작 금지. 사용량 >90%면 감시기가 같은 세션을 중단하며 reset시각+실제회복 뒤 재개한다. 외부메시지·배포·유료서비스 생성·실제 samples 원본 업로드는 하지 않는다.

## 공식 참고

- https://nextjs.org/docs/app/guides/static-exports (현재 cookies·Proxy·SSR/요청 API는 정적 export에 부적합)
- https://nextjs.org/docs/app/guides/self-hosting (Node `next start` self-host)
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `/Users/jinyu/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md`
