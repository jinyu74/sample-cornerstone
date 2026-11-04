# 진행 기록 (중단 후 재개용)

마지막 갱신: 이슈 #3(로컬 Supabase 로그인·서버 세션·계정별 저장소) 인증 구현·품질 검사·런타임 head 독립 리뷰 통과, 사용자 PR 검토·병합 대기

## 완료·승인

- 1단위: 개발 기반, 스택 정렬(S1) — Codex 승인
- 2단위: DICOM 파싱·가져오기·IndexedDB 원본 저장, 검사 목록, StackViewport 렌더링 — Codex 승인

## 이전 3단위(측정·라벨·결과 저장·작업 화면) — 구현 이력

- 모델: 좌표 변환(image ↔ world), 측정(mm/px, 비등방·회전 타원), 라벨·대상, 작업 문서 reducer(`work/replace` 포함, 좌표 변경 시 오래된 world 좌표 제거), 실행 취소 이력, 작업 상태
- 저장: IndexedDB v2(works) 마이그레이션, stale revision 거부, 검사별 저장 세션·직렬 자동 저장·이탈 시 저장
- JSON: 버전 스키마, 좌표계 식별자 공통 상수, 참조·숫자·포인트·ID·world 정합성 검증
- 엔진: 공식 Cornerstone Tools 5종 + 이동·확대·W/L, 문서 ↔ 엔진 동기화(소유권 정리, HandlesUpdated 반영), 표시 영상 기준 렌더 완료 판정, 썸네일 수명주기
- 화면: 도구 모음·결과 패널·편집기(draft 조율)·라벨 관리·JSON 전송·viewport 조작·모바일 Sheet·숨긴 file input 접근성
- 검사 목록 작업 상태, 합성 MR 스택

## 이전 로컬 앱 검사 이력(로그: scratchpad/evidence/final-*.log)

- typecheck · lint(경고 0) · format:check 통과
- unit/integration 232 통과, Story 92 통과
- build 통과(15초, compute worker 순환 패치 후), build-storybook 통과
- E2E prod 20/20(E2E_SKIP_BUILD=1, 직전 검증 빌드 재사용), E2E dev 20/20, 테스트 밖 오류 없음
- 빌드 정지 원인·대응: docs/build-hang-guide.md
- 사용자 미리보기: http://127.0.0.1:3000 (next start), 합성 샘플: tests/e2e/.fixtures/

## 이전 단계의 검증 한계

- 현재 검수 상태와 최신 결과는 아래 이슈 #3 및 `docs/reviews.md`를 따른다
- 미검증: Chromium 외 브라우저, 실제 장비 데이터, 대용량 성능, 실제 OS 폴더 드래그

## 이슈 #3 — 로컬 Supabase 로그인·서버 세션 접근 제어 (브랜치 `feat/3-supabase-auth`)

- 범위: 로그인/로그아웃, 서버 세션 검증(Proxy 낙관적 검사 + 페이지·Route Handler 의 getUser), 안전한 복귀 경로, 열린 화면 재검증·다른 탭 로그아웃, 계정별 IndexedDB 경계, 로컬 계정 준비 스크립트. 서버 영상 저장·메타데이터/결과 DB 는 후속 이슈(이번 단계는 서버 저장 전환 완료가 아님).
- 도구: Supabase CLI 2.122.0(mise), `@supabase/supabase-js` 2.118.0, `@supabase/ssr` 0.12.7(정확 고정). 전용 로컬 스택 `dicom-annotator`(포트 553xx).
- 검사(로그 `.local/issue3/final-*.log`): typecheck·lint(경고 0)·format, unit 422, Story 102, build, build-storybook, E2E dev 50/50, E2E prod 50/50(직전 빌드), 브라우저 번들에 Supabase 키·URL 없음.
- Codex 독립 실행: 단위·통합422, Story102, 타입·lint·format·Storybook 빌드, 이전 전체 프로덕션48/48 이후 최신 인증 변경 회귀4/4, 데스크톱·모바일 QA 통과. 최신 앱 빌드와 전체 dev/prod50/50은 Opus 실행 로그를 직접 확인했다.
- 런타임 head `86b4ab9` 독립 전체108파일 리뷰: No findings. 최신 PR head·문서 보완 리뷰는 PR 댓글을 확인한다.
- 남은 항목: 사용자 PR 검토·병합 결정. 서버 영상/메타데이터·결과 저장은 후속 이슈다.
- 자연 만료 갱신: 중단 중 실제로 만료된 원래 JWT로 새 토큰·응답 쿠키·보호 페이지·no-store를 감독이 직접 확인했다.
- 미검증: Chromium 외 브라우저, 클라우드 Supabase·HTTPS 프록시, 실제 임상·대용량 환경.

## 이슈 #5 — 검사 메타데이터·RLS·SSR 목록

- 이슈 https://github.com/jinyu74/sample-cornerstone/issues/5 , 브랜치 `feat/5-study-catalog-ssr`, 기준 main `41fb4d60cce0bab0a6fe893e54233ed13d611e9e`.
- PR #4는 사용자 명시 요청으로 병합했다. 이 후속 PR의 병합 허가는 별도다.
- 계정 소유권을 유지하며 목록용 메타데이터만 로컬 Supabase에 저장하고 최초 HTML에 목록을 렌더링한다. 원본·작업 결과는 아직 계정별 IndexedDB이며 서버 파일·결과 저장·클라우드는 후속이다.
- 상세 인수 조건은 `docs/tasks/5-study-catalog-ssr.md`. 계획 `.local/issue5/plan.md`.
- 2026-11-04 Opus 구현 단계 완료(감독 최종 검수 대기): migration 2개(CLI 생성·로컬 적용 기록·재현 검증), RLS·RPC, 서버 DAL·Route Handler, 동기화 hook, SSR 목록·원본/반영 상태 UI·Stories, E2E 8건 추가.
- Opus 최종 실행: 단위 524(감독 독립 확인 524), Story 121(감독), 실제 DB 40(감독), `db:verify-migrations` 통과(동시 2회 포함), advisors 이슈 없음, typecheck·lint·format, 앱 빌드, prod E2E 58/58(기능 연결 직후 빌드), dev E2E 58/58. 마지막 prod 빌드·prod E2E·화면 QA·Storybook 빌드는 감독이 실행한다.
- 남은 제한: dev 서버 로그의 RSC stream 중단 경고(`docs/reviews.md` 이슈 #5 절), Chromium 외 브라우저·클라우드 Supabase 미검증, 결과 서버 저장·서버 영상 폴더는 후속 이슈.

- 감독 최종 사전 검수: 단위·통합525, Story121, 실제DB40, 타입·lint·format·앱/Storybook 빌드, 전체prod58/58, dev58/58(실행 Opus) 통과. 데스크톱·모바일/새 브라우저·JS 없는 SSR·영상 렌더·네트워크 메타데이터·브라우저 오류0 직접 확인. PR 독립 리뷰와 사용자 병합 결정은 별도 단계다.
