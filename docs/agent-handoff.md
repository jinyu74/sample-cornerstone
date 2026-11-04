# 에이전트 작업 재개 메모

## 현재 활성 작업: 이슈 #5 검사 메타데이터·RLS·SSR 목록

- 사용자 요청 “머지 병합 후 다음 진행을 계속 하도록 한다.”에 따라 PR #4 head `66d63a27166b8d19470182507da577a0fb02be8e`를 병합했다. 병합 요청 기록: https://github.com/jinyu74/sample-cornerstone/pull/4#issuecomment-6624132421 . main merge commit `41fb4d60cce0bab0a6fe893e54233ed13d611e9e`.
- 새 이슈: https://github.com/jinyu74/sample-cornerstone/issues/5 . 브랜치 `feat/5-study-catalog-ssr`, 기준은 위 main. 상세 지시와 인수 조건: `docs/tasks/5-study-catalog-ssr.md`.
- 목표: 계정별 목록용 메타데이터를 로컬 Supabase DB에 저장·RLS 보호하고 최초 HTML에 서버 렌더링한다. 원본 영상·작업 결과는 아직 계정별 IndexedDB이며 DB/Storage/public에 업로드하지 않는다. 비공개 서버 폴더/API·결과 서버 저장·클라우드는 후속이다.
- 기존 관리자 생성 계정과 계정별 소유권만 확장한다. 새 공유·역할 모델은 도입하지 않는다. 메타 동기화 실패·중복·계정 변경 경합·다른 브라우저 원본 부재·실제 JWT Data API RLS·JS 없이 SSR을 먼저 테스트한다. 기존 계정 자료와 legacy DB를 임의 이전·삭제하지 않는다.
- Opus `opus-worker`/`w4:p2`/세션 `835f3cf4-4548-455b-a142-2afc555fc22f`가 구현하고 감독이 검수·git/PR을 맡는다. 별도 `codex-reviewer`/`w4:p9`는 PR #6 런타임 head의 독립 리뷰를 완료했다. 최신 head 판정은 PR 댓글을 확인한다. 새 PR의 병합 허가는 아직 없으며 사용자에게 별도 요청을 받아야 한다.
- PR #4 최종 기준: unit422·Story102, Opus 전체prod/dev50/50, 감독 변경인증4/4·품질·시각 QA·실제 자연 만료 갱신 통과. 최종 독립 No findings 댓글: https://github.com/jinyu74/sample-cornerstone/pull/4#issuecomment-6617898773 . 이 기준 회귀를 유지한다.
- 로컬 Supabase `dicom-annotator`(API55321/DB55322), CLI2.122.0(mise). 키/비밀번호/토큰 출력 금지. 기존 Auth/볼륨·다른 프로젝트를 db reset/삭제하지 않는다. 실제DB·E2E 자료는 합성계정 범위로 격리한다.
- 미리보기 http://127.0.0.1:3000 은 실행 여부를 확인하고 빌드/E2E와 조율해 종료·재기동한다. Storybook dev는 사용자가 직접 실행한다. 로그인 `reader@example.test`, 비밀번호 `.local/auth/user-reader%40example%2Etest.txt`(0600)를 사용자가 직접 확인한다.
- 사용량 감시기 상태·체크포인트를 함께 읽고 실제 회복 후 같은 세션을 재개한다. 대화를 clear하거나 전체 앱 완료로 오인하지 않는다. 코드/리뷰어를 포함한 Codex 공유 한도도 관리한다.
- 2026-11-04 감독 사전 검수 통과: 단위·통합 78파일525개, Story 28파일121개, 실제DB 4파일40개, 타입·lint·format, 앱·Storybook 빌드, 감독 전체 prod E2E58/58, Opus 전체 dev E2E58/58. 감독 브라우저 QA에서 데스크톱·모바일 목록, 원본 가져오기·반영·영상 렌더, 새 브라우저 원본/작업 부재, JS 없는 SSR·no-store·브라우저 오류0을 확인했다. 로그와 캡처는 `.local/issue5/codex-*.log`, `qa-*.png`.
- 미리보기3000은 최종 빌드로 다시 실행했다. PID는 `.local/preview.pid`, 로그 `.local/preview.log`이며 실제 포트·프로세스를 다시 확인한다. Storybook dev는 기동하지 않았다.
- PR #6: https://github.com/jinyu74/sample-cornerstone/pull/6 . 런타임 head `18f231c5b751c60db5a10edf3699ae82eaf0e828`에 대해 별도 Codex가 전체76파일 merge diff를 검토하고 No findings를 보고했다. 댓글: https://github.com/jinyu74/sample-cornerstone/pull/6#issuecomment-6629285255 . 리뷰어 unit522/525, 나머지3개는 읽기 전용 sandbox의 임시디렉터리 EPERM이며 감독은525/525 통과했다. 기록 문서 변경도 새 head 재검토를 받고 최신 판정은 PR 댓글·`.local/issue5/supervisor-status.json`에 남긴다.
- 다음 단계는 사용자 PR 확인·직접 병합 또는 현재 PR/head에 대한 명시적 병합 요청이다. PR #6 병합 허가는 아직 없다. auto-merge를 사용하지 않는다. 병합 확인 후 최신 main에서 비공개 영상 폴더/API 후속 이슈·브랜치를 시작한다.
- 남는 제한: dev 서버 RSC stream 경고17건 중 일부만 브라우저 종료와 요청 단위로 대응했다. 최종 prod 로그에는0건이며 dev/prod58개가 통과했다. Chromium 외 브라우저·클라우드 Supabase는 미검증이다. 세부 근거는 `docs/reviews.md` 이슈 #5 절에 있다.
- 전체 앱 후속 범위는 비공개 서버 영상 폴더/API와 결과 서버 저장이다. 이 PR 병합 확인 후 별도 이슈로 진행하며 전체 앱 완료로 오인하지 않는다.
- 아래 단계·사용량·PID는 역사 기록이다. 최신 상태는 이 절·현재 Git/이슈/PR·실시간 에이전트 상태가 기준이다.

## 목표와 사용자 지침

- 프로젝트: DICOM 측정·메모·장기/병변 라벨링 앱. 현재 브라우저 저장 구현에 인증을 붙였고, 이후 비공개 서버 영상 저장과 메타데이터·결과 DB로 확장한다. 기존 뷰어 범위는 `docs/claude-dicom-task.md`.
- Next.js App Router + TypeScript, Cornerstone3D StackViewport, IndexedDB. `mise`로 도구 버전을 고정하고 패키지 관리·스크립트 실행은 `pnpm`만 사용한다.
- `AGENTS.md`, `CLAUDE.md`, `/Users/jinyu/.codex/RTK.md`를 따른다. 모든 기능은 시나리오/인수 조건과 실패 테스트를 먼저 작성한 뒤 구현한다.
- FSD 기반 계층, 모델·타입 분리, 책임별 hook, shadcn/ui 확장, 사용 디자인 컴포넌트의 Storybook 등록. lint/format/typecheck/test/build/Storybook/E2E를 통과해야 한다.
- 우측 Claude Opus 5.5가 구현하고 왼쪽 Codex가 직접 코드와 테스트를 검수한다. 사용자 결정이 필요한 항목은 즉시 알린다.
- Git 저장소는 `jinyu74/sample-cornerstone`에 연결됐고 초기 커밋은 `main`에 푸시됐다. 이후 작업은 `docs/development-workflow.md`의 이슈·브랜치·사전 검수·PR·별도 Codex 리뷰 절차를 따른다. 리뷰어는 `$review-agent` 스킬을 사용하며 리뷰 승인은 병합 허가가 아니다. `main`은 사용자가 직접 병합하거나 명시적으로 병합을 요청한 경우에만 감독 Codex가 병합한다. 배포, 외부 서비스 생성, 실제 환자 파일 전송은 별도 결정 사항이다.

## 세션 연결

- Herdr 환경에서만 제어한다(`HERDR_ENV=1`). 전역 스킬 `~/.codex/skills/herdr/SKILL.md`를 읽는다.
- Codex thread: `01a19b26-bace-7013-9cc7-7fdfef64a035`, pane `w4:p1`.
- Claude: `opus-worker`, pane `w4:p2`, session `835f3cf4-4548-455b-a142-2afc555fc22f`, 모델 `claude-opus-5-5`.
- 재개 후 현재 agent/session ID를 확인한다. 다른 세션으로 바뀌었으면 자동 입력하지 않는다.
- Codex 재개 예: `codex resume 01a19b26-bace-7013-9cc7-7fdfef64a035 --sandbox danger-full-access --ask-for-approval on-request -c 'shell_environment_policy.inherit="all"'`.

## 완료한 검수

- 상세 기록: `docs/reviews.md`. 시나리오와 기술 선택: `docs/scenarios.md`, `docs/architecture.md`, `docs/decisions.md`.
- 1단위: 개발 기반, 슬라이스 정렬. 정렬 비교의 비추이성/입력 순서 의존성 회귀 수정.
- 2단위: 합성 DICOM fixture, 파싱·그룹화·멀티프레임 기하 보존·중복/UID 충돌, IndexedDB 원본 저장, 검사 목록, 실제 Cornerstone 렌더링.
- Codex 독립 확인: 단위/통합 112개, Storybook 61개, 프로덕션 E2E 7개, lint/typecheck/format, Storybook 빌드 통과. Opus의 dev E2E 7개 통과도 확인.
- 검수에서 프레임별 기하 손실, 드롭 메서드 receiver, 드롭 오류 미표시, 글꼴 자기 참조, 비동기 파일 등록 누수·렌더 경합 등을 회귀 테스트로 수정했다.
- 디자인 기준: `docs/design/visual-spec.md`, `viewer-concept.png`, `study-list-concept.png`. 이미지의 영상은 참고용이며 실제 앱은 DICOM을 렌더링한다.

## 현재 진행과 미해결 검수

- 3단위 진행 중: 측정/라벨/대상/편집 이력, 결과 스키마·검증, IndexedDB 결과 저장, 자동/수동 저장, 편집 UI·Stories, 실제 측정 도구와 영상 조작 통합.
- 2026-11-02 19:07 KST 중단 상태에서 Codex가 단위/통합 218개 통과를 확인했다(감시 정책9개 포함). 최신 통과 수와 실패는 재개 후 반드시 다시 실행해 확인한다.
- `src/entities/study-work/model/measure.review.test.ts`: 비등방 보정에서 회전 타원의 면적 오류를 재현했다. Opus가 수정했고 Codex의 전체 195개 실행에서 통과했다.
- `src/features/edit-study-work/model/use-study-work.review.test.tsx`: 변경 없는 수동 저장 후 다음 편집 저장 누락, 검사 UID 변경 시 이전 검사 결과 노출을 재현했다. Opus가 검사별 세션 구조로 수정했으며 Codex의218개 전체 테스트에서 회귀2개도 통과했다. 수정 코드 최종 재검수는 계속 필요하다.
- `src/features/transfer-results/model/study-work-json.review.test.ts`: canvas 좌표계를 선언한 JSON도 영상 좌표로 잘못 가져오는 문제를 재현했다. 좌표계 식별자 검증 수정 후 Codex의218개 전체 테스트에서 통과했다.
- 중단 직후 앱 전체 타입 검사에는 `src/views/viewer-workspace/ui/viewer-workspace-page.tsx:89`의 StackViewerProps `index`, `onIndexChange` 누락1건이 남았다. 작업 화면 조립 도중 중단된 상태이므로 재개 후 먼저 해결하고 전체 검증을 이어간다. 감시기 자체의 별도 타입 검사·lint는 통과했다.
- 새로운 편집기·라벨 관리·전송 UI Story 31개의 Red 확인 후 구현 중이다. Storybook Vite 의존성 재최적화와 Dialog 애니메이션 테스트도 정리 중이다.
- 남은 전체 범위: 실제 측정 도구/주석 오버레이, 결과 선택 시 올바른 영상·프레임 이동, 저장/새로고침 복원, JSON 왕복, 삭제·undo/redo, 저장 실패·미저장 이탈 처리, 작업 상태, 확대/이동/WL/반전/회전/맞춤, 실제 썸네일, 모바일 Sheet, 숨긴 파일 입력 중복 접근성 개선, README, 전체 최종 검수.
- CT뿐 아니라 합성 MR 스택 렌더링·정렬·결과 복원 E2E도 추가 지시했다. 합성 데이터 검증을 실제 임상 검증으로 표현하지 않는다.

## 운영과 사용량 정책

- 사용자 요청: Claude 사용량이 90%를 초과하면 일시 중단하고 재설정 후 다시 확인해 재개한다. Codex의 5시간 잔여량이 10% 미만이면 이 메모와 검수 기록을 보존하고 일시 중단한 뒤 재설정 후 재개한다.
- 2026-11-02 18:48 KST 부근 확인: Claude session 76%, weekly all models 11%, session reset 21:49 KST. Codex는 18:50 부근 primary used 9%(remaining91%), reset 23:44:15 KST, weekly used1%.
- 위 수치는 과거 관측이다. 현재 값을 다시 읽고, 재설정 시각만으로 quota가 회복됐다고 가정하지 않는다.
- Claude `/usage`는 모델 호출 없이 사용량 UI를 연다. 공식 문서상 작업 중에도 즉시 실행 가능하다. UI를 읽고 Esc로 닫으며 승인/질문 UI에는 임의 응답하지 않는다.
- Codex 사용량은 현재 rollout의 token_count.rate_limits에서 확인 가능하며, 더 최신 조회는 공식 app-server `account/rateLimits/read`를 사용한다. 인증 토큰은 출력하거나 복사하지 않는다.
- 대화 컨텍스트를 clear/reset하거나 사용량 크레딧 구매/활성화로 우회하지 않는다. 사용량 창 reset과 대화 삭제는 다르다.
- 자동 감시 스크립트: `scripts/watch-agent-budgets.ts`. 운영 방법은 `docs/agent-usage-monitor.md`, PID/상태/로그는 `.local/agent-budgets/`에 있다. 실제 실행 여부는 항상 다시 확인한다.
- 2026-11-02 19:00 KST 첫 감시에서 Claude91%를 감지해 중단했다. 최신 session reset은21:50 KST다. 자연 재설정 후 실제 회복을 다시 조회하고 Claude와 대기 중인 Codex 검수를 재개하도록 구성했다.
- 19:07 KST 부근 감시 확인: PID77729 실행 중, Claude91%·중단 상태, Codex primary28%사용(72%남음)·weekly4%사용. 조회 오류는 없었다. 재설정 시각은 Claude21:50, Codex23:44:15 KST다. PID는 재실행되면 바뀌므로 PID파일과 로그를 기준으로 한다.

## 검수 명령과 로그

- 사용자 테스트에서 발견한 확대 후 도구 전환 오류는 Codex가 프로덕션 실패 E2E를 먼저 확인한 뒤 수정했다. Cornerstone `setToolActive`의 누적 바인딩을 전환 전에 `setToolPassive(..., { removeAllBindings: true })`로 정리한다.
- 최신 Codex 검증: 단위232·Story92·프로덕션E2E30/30·개발 전환회귀10/10, 타입·lint·format·프로덕션 빌드 통과. 회귀는 `tests/e2e/tool-switching.spec.ts`.
- 현재 사용자 미리보기는 `http://127.0.0.1:3000`, PID `.local/preview.pid`, 로그 `.local/preview.log`. Opus scratchpad preview.pid는 이전 프로세스를 가리키므로 사용하지 않는다.

- `mise exec -- pnpm test`, `test:stories`, `typecheck`, `lint`, `format:check`, `build`, `build-storybook`, `test:e2e`, `test:e2e:dev`.
- root의 Storybook dev server는 `127.0.0.1:6006`(실행 당시 session42001). 새 서버를 중복 실행하지 말고 상태를 확인한다.
- Next 빌드/E2E를 Opus와 동시에 실행하면 빌드 잠금 충돌이 난다. 실행을 조율하고 테스트 실패와 구분한다.
- Opus 로그: `/private/tmp/claude-501/-Users-jinyu-MyProject-herdrPractice/835f3cf4-4548-455b-a142-2afc555fc22f/scratchpad/evidence/`. 화면 캡처는 인접 `qa/`.
- root 캡처 예: `/tmp/herdr-study-table-story-fixed.png`. 새 최종 화면은 새로 캡처·검수한다.

- 2026-11-04 20:19 KST 감시기가 Codex 실제 사용량0%를 확인해 같은 세션을 재개했다. 재개 시 Opus에는 사용량 UI가 열려 있어 조작하지 않았다. 원본·결과 서버 저장까지 전체 앱 목표는 계속 남아 있다.
