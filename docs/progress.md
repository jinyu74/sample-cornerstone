# 진행 기록 (중단 후 재개용)

마지막 갱신: 이슈 #3(로컬 Supabase 로그인·서버 세션·계정별 저장소) 구현·Codex 독립 전체 검사 통과, PR 이후 독립 리뷰 대기

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
- 남은 항목: PR 이후 리뷰어 검토, 사용자 병합 결정.
- 미검증: 실제 만료 시간 경과에 따른 토큰 갱신(로컬 jwt_expiry 3600초, 쿠키 제거·위조·폐기 경계는 별도 확인), Chromium 외 브라우저, 클라우드 Supabase·HTTPS 프록시 환경.
