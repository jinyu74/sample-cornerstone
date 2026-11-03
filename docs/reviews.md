# Codex 검수 기록

## 이슈 #3 사전 검수: Supabase 인증 전환

- 작업 브랜치 `feat/3-supabase-auth`, 기준 main `23fbac0b`. 로컬 Supabase와 관리자 생성 이메일·비밀번호 계정은 사용자 확정이다. 영상·결과의 서버 저장 전환은 후속 범위다.
- 공개 가입 API422 `signup_disabled`, 실제 Auth 로그인, 위조·폐기 세션 거부, 안전한 복귀 경로, same-origin 로그아웃, 다중탭/뒤로 가기 차단, A/B 자료 분리와 익명 DB 보존을 확인했다.
- Codex가 env 파일의 다른 설정·주석 삭제를 먼저 실패 회귀로 재현하고 수정 후 관리도구20/20을 독립 확인했다. 비밀번호 파일의 이메일 경로 이탈도 안전한 인코딩과 회귀로 수정했다.
- POST 전 로그아웃 알림으로 인한 navigation 경합과 localhost/127.0.0.1 출처 변경을 찾아 수정했다. 저장 전 로그아웃은 마지막 편집을 먼저 저장한다. Provider 해제·계정 전환 중 첫 저장 다음 revision까지 원래 계정에 기록되는 경계와 단순 close mutation 실패 근거를 확인했다.
- Red 근거: 최초 모듈4개 미구현 실패를 직접 실행했고, Opus 단위·통합88실패/8통과/오류1, Story 실패와 접근 제어 E2E 실패 로그를 확인했다. 다만 인증 E2E 일부는 구현 후 작성됐다는 절차 위반이 있었다. 이 사실을 완료 근거에서 숨기지 않고, 이후 수정은 시나리오·실패 테스트부터 진행하도록 재지시했다.
- 2026-11-04 Codex 독립 재실행(`.local/issue3/codex-final-*.log`): 단위·통합388/388, Chromium Story99/99, 타입·lint(경고0)·format, 앱·Storybook 빌드, 프로덕션 E2E47/47·개발 E2E47/47 통과. Opus의 최종 로그와도 일치한다.
- 브라우저 QA: Browser plugin not available이므로 프로젝트 Playwright 사용. `127.0.0.1:3000`에서 데스크톱1440×1000·모바일390×844의 비로그인→로그인→검사 목록→로그아웃을 직접 실행했다. 페이지 정체성·본문·상호작용 정상, framework overlay·pageerror·console error·가로 넘침 없음. 캡처 `/tmp/herdr-auth-{desktop,mobile}.png`, `/tmp/herdr-list-{desktop,mobile}.png`를 확인했다.
- 미검증: 실제 1시간 만료 경과 후 토큰 갱신, Chromium 외 브라우저, 클라우드·HTTPS 프록시, 실제 임상·대용량 환경. 쿠키 제거·위조·폐기 검증은 실제 만료 갱신 검증을 대신하지 않는다.
- 사전 검수 후 PR을 열고 별도 Codex 리뷰어가 현재 head 전체 merge diff를 검토한다. main 병합은 사용자 통제이며 이 기록은 병합 허가가 아니다.

### PR #4 첫 독립 리뷰 — 수정 필요

- PR: https://github.com/jinyu74/sample-cornerstone/pull/4, 검토 head `d56555bf1ea691c39c70f94432d4eeeec9a0f4d4`. 별도 패널 Codex가 `$review-agent`로 merge-base부터 전체96파일과 관련 호출·테스트를 읽었다.
- P1: 미저장 beforeunload 확인으로 세션 무효화 navigation을 취소하면 이전 계정 보호 화면을 계속 사용할 수 있고, `done=true`로 이후 검사도 중단된다. 이동 성공 여부와 별개로 보호 콘텐츠를 차단해야 한다.
- P2: 로그아웃이 모든 `sb-` 쿠키를 지워 같은 호스트의 다른 Supabase 프로젝트 세션까지 만료시킨다. 현재 프로젝트 키와 청크만 지워야 한다.
- 리뷰어는 실제 소스 메모리 내 검증으로 두 경로를 재현했다. 실제 브라우저 확인창 검증과 전체 검사를 리뷰어가 수행한 것은 아니다.
- 감독이 지적을 확인하고 실패 회귀부터 수정하도록 Opus에 지시했다. 결과 댓글: https://github.com/jinyu74/sample-cornerstone/pull/4#issuecomment-6612520822 . 새 head 재검토 전까지 수정 필요 상태다.

### PR #4 지적 수정·감독 재검증

- P1: `SessionGate`가 보호 subtree를 먼저 치우고 로그인 안내만 남긴다. 상태·이탈 순서는 `useSessionEnd`, 앱 조립은 `ProtectedShell`로 분리했다. 계정 저장소의 진행 중·직렬 쓰기 종료를 최대3초 기다린 뒤 이동하며, 정리 실패/상한 초과/이동 취소 후에도 보호 콘텐츠는 돌아오지 않는다.
- P2: 서버·Proxy가 앱 전용 `sb-dicom-annotator-auth-token`을 동일하게 사용하고 로그아웃은 이 키·청크·코드 검증자만 지운다. 다른 프로젝트 쿠키는 보존하며 Auth 서비스 오류 경계도 검증한다.
- 감독 독립 Red: P1 통합3실패/기존388통과(`codex-review-p1-red.log`), P2 실제 라우트3실패(`codex-review-p2-red.log`). Opus의 구 프로덕션 빌드 브라우저 Red에서 `[dialog] beforeunload → dismiss` 후 viewport1개가 남는 실패도 직접 로그로 확인했다(`red-p1-browser.log`). 새 안내 Story3개 Red도 확인했다. 정리 오류·기본3초 경계2건은 기존 구현의 특성화 테스트로 추가됐으며 Red 근거로 세지 않는다.
- 감독 독립 Green(`.local/issue3/codex-pr4-*.log`): 단위·통합417/417, Chromium Story102/102, 타입·lint(경고0)·format, 앱·Storybook 빌드, 프로덕션 전체E2E48/48 통과. Opus의 개발·프로덕션 각각48/48 로그도 직접 확인했다.
- 추가 QA: 데스크톱1440×1000·모바일390×844에서 실제 로컬 로그인 후 세션 쿠키를 제거하고 로그인 navigation을 정지시켰다. 이전 목록은 없어지고 세션 종료 안내만 남았으며 화면 캡처를 직접 확인했다(`/tmp/herdr-session-ended-{desktop,mobile}.png`). 가로 넘침·pageerror·예상 밖 console error 없음. `/auth/session`의401 및 이에 따른 브라우저 콘솔의 네트워크 오류는 의도한 세션 거부 응답이다. QA 도구의 Next route announcer 선택자 중복·진행 중 navigation 대기는 선택자 구체화와 CDP stopLoading으로 해결했으며 앱 결함으로 세지 않았다.
- 미검증 항목은 동일하다. 수정한 새 head를 PR에 반영한 뒤 별도 리뷰어가 전체 merge diff를 재검토하며, 사용자 요청 전에는 병합하지 않는다.

### PR #4 새 head 재리뷰 — 입력 중 메모 유실 수정 필요

- 검토 head `e950ac00356bc67e94c5023bb273b362a2a8bb8e`, 전체107파일. 별도 리뷰어가 이전 P1/P2 해결과 직렬 저장→연결 종료→레지스트리 해제를 확인했다.
- 신규 P2: 메모 입력에 포커스를 둔 채 세션 무효화되면 Gate가 NoteField의 blur 없이 subtree를 제거해 draft를 유실한다. 종료 저장은 이전 모델 값만 저장한다. 보호 화면 차단을 유지하면서 입력 중 메모를 원래 계정 모델에 먼저 전달해야 한다.
- 리뷰어가 실제 React/jsdom에서 정상 blur는 반영되고 세션 무효화는 미반영인 차이를 재현했다. 실제 브라우저 재현과 저장 복원은 Opus가 먼저 실패 테스트부터 추가한다. 감독은 이 경로를 코드에서 확인하고 수정 지시했다. 해결 후 전체 검증·새 head 재리뷰 전까지 수정 필요 상태다.

### 입력 draft·모바일 Portal 수정 검증

- 종료 상태를 기록하기 전에 React 트리에서 포커스를 받은 입력을 blur해 기존 편집기의 검증·commit 경로를 동기로 실행한다. 그 뒤 보호 콘텐츠 차단과 계정 저장소 종료 대기를 수행한다. Portal도 React 포커스 이벤트로 포착하며 auth가 편집 기능을 직접 참조하지 않는다.
- 감독이 `session-draft-commit.review.test.tsx`에서 실제 편집기·작업 hook·계정 저장소의 메모 유실 Red를 독립 확인했다. 첫 최소 수정안의 DOM `root.contains`는 모바일 Sheet Portal을 누락하므로 감독이 createPortal 케이스를 추가해 일반 메모·잘못된 좌표2통과/Portal 메모1실패를 재현했다(`codex-portal-draft-red.log`). 기대값은 유지했다.
- 실제 브라우저도 desktop/모바일 모두 이전 빌드에서 기대 메모 대신 빈값으로 복원되는 Red를 확인했다(`red-draft-browser.log`, `red-portal-browser.log`). 테스트 작성 중 textbox 선택자 중복과 Sheet 선택 시 닫힘 절차 오류는 검증 실패와 구분해 수정했다.
- 전체 prod 실행에서 기존 `길이` 부분 매칭이 도구·결과·숨김 버튼3개에 걸린 실패가 있었다. 감독이 해당 파일 도구 버튼9개에 `exact:true`만 추가했다. 기대값·시나리오·앱 소스는 그대로이며 이후 prod/dev 전체50/50이 통과했다.
- 최종 감독 독립 실행(`.local/issue3/codex-final-portal-*.log`): 단위·통합422/422, Chromium Story102/102, 타입·lint(경고0)·format·Storybook 빌드, 변경된 인증 프로덕션 브라우저4/4(설정 포함). Opus의 최신 앱 빌드와 전체 prod/dev 각각50/50 및 나머지 품질 검사 로그를 직접 확인했다. 이전 감독 전체prod48 결과와 최신 변경 회귀 검증을 혼동하지 않는다.
- 최종 브라우저 QA: `127.0.0.1:3000` 데스크톱1440×1000/모바일390×844에서 로그인→목록→로그아웃, 세션 제거→navigation 정지→보호 콘텐츠 제거·안내 유지 확인. 최신 캡처도 직접 읽었다(`/tmp/herdr-list-{desktop,mobile}.png`, `/tmp/herdr-session-ended-{desktop,mobile}.png`). 정상 흐름 console/page error0, 거부 흐름은 의도한 `/auth/session`401만 있고 예상 밖 오류·가로 넘침 없음. Browser plugin not available로 프로젝트 Playwright를 사용했다.
- 수정한 새 head를 다시 독립 리뷰한다. 기존 실제1시간 만료·다른 브라우저·클라우드/HTTPS 검증 공백은 유지하며 전체 서버 저장 전환 완료나 병합 허가로 표현하지 않는다.

### 런타임 head 최종 독립 리뷰와 자연 만료 갱신 확인

- head `86b4ab9ee38b0a9a08dfeceeaba2083b05e86cb5`, merge-base `23fbac0b0002d21d6541cb4f10b3d0140c1d91e0`. 별도 리뷰어가 전체108파일과 호출을 검토해 **No findings**를 보고했다. 일반/Portal 메모·유효/무효 좌표·외부 복원 메모를 오래된 draft로 덮어쓰지 않는 경계의 메모리 내 검증5건도 통과했다. 이전 지적은 모두 해결됐다. 리뷰어는 전체 빌드/E2E를 재실행하거나 파일을 변경하지 않았다.
- 감독이 한도 재설정 후 동일 세션으로 재개하면서 Git/PR head 동일·작업 트리 깨끗함·main 미병합을 확인했다. 리뷰 결과는 같은 계정의 일반 PR 댓글로 남기며 병합 허가가 아니다. 이후 이 기록 정리는 문서 변경이며 최신 PR head의 리뷰는 댓글을 기준으로 확인한다.
- 중단 전 저장된 원래 JWT의 실제 `exp`가 지난 것을 확인한 뒤 로컬 Auth에 요청했다. 세션 응답200, 새 access token 발급, 응답 쿠키 반영, 보호 목록 표시, no-store가 모두 통과했다. 비밀번호/토큰/키는 출력하지 않았다(`.local/issue3/naturally-expired-session-qa.log`). 이로써 로컬 실제 자연 만료 갱신 시나리오를 확인했다. 기존 공백 기록은 당시의 역사이며 Chromium 외·클라우드/HTTPS·실제 임상/대용량 검증은 여전히 남아 있다.

## 1차: 개발 기반과 슬라이스 정렬

- Codex가 최초 테스트 15개의 `not implemented` 실패를 직접 실행해 확인했다.
- 코드 검수에서 위치 허용 오차를 comparator에 적용한 비추이적 비교를 발견했다. 입력 순열에 따라 3가지 정렬 결과가 나오는 회귀 테스트를 먼저 추가하고 실패를 재현했다.
- Opus가 정확한 거리 정렬 후 앵커 기준 그룹화로 수정하고, 참조 방향·경고 선택의 입력 순서 의존성도 추가 테스트로 수정했다.
- Codex 독립 재실행: 단위 테스트 19/19, 타입 검사, lint(경고 0), format 검사, Next.js 프로덕션 빌드, Storybook 빌드 통과.
- Storybook은 현재 초기 설정만 검증됐다. 아직 Story가 없으므로 컴포넌트·상호작용·접근성 검증이 완료된 것은 아니다.
- 검수 결과: 첫 단위 승인. 다음 단위는 합성 DICOM fixture·가져오기·저장소와 실제 렌더링 통합이다.

## 2차 진행 중: DICOM 가져오기와 브라우저 렌더링

- Codex가 파싱·분류·저장소·가져오기 테스트 39개의 미구현 실패를 직접 확인했다.
- 파서가 멀티프레임의 첫 방향·픽셀 간격을 모든 프레임에 적용하는 문제를 발견했다. 프레임 방향이 다른 합성 DICOM의 공간 스택 오분류를 회귀 테스트로 재현했다.
- Opus가 프레임별 방향·간격 보존과 프레임 기하 조회를 구현했다. Codex가 수정 후 단위·통합 테스트 67/67 및 타입·lint·format 검사를 독립 실행해 통과를 확인했다.
- 검사 목록 모델·hook·가져오기 보조 로직을 추가한 뒤 Codex가 단위·통합 테스트 99/99 통과를 확인했다.
- 초기 화면의 파일 선택 컨트롤이 없어서 렌더링 E2E가 실패하는 Red 증거를 확인했다. 화면·Cornerstone 연결 구현과 dev/prod E2E 검수는 진행 중이다.
- 시각 컨셉의 primary 흰 글자 대비가 3.74:1인 문제를 발견했다. 텍스트 버튼은 `#0f766e`(5.47:1), 장식·선택 강조는 `#0d9488`로 분리하도록 수정 지시했다. 실제 Story 접근성 검증은 진행 중이다.

### 2차 검수 결과

- 드롭 파일 읽기의 receiver 누락과 읽기 실패의 미표시를 회귀 테스트로 수정했다.
- Storybook의 실제 화면에서 sans 글꼴 토큰 자기 참조로 Times가 적용되는 문제를 발견했다. 수정 후 Codex가 계산된 font-family와 스크린샷으로 한국어 시스템 sans 스택 적용을 확인했다.
- 비동기 파일 등록 도중 화면 이탈 시 해제가 누락되는 문제를 Codex 회귀 테스트로 재현했다. Opus가 늦은 등록·중간 실패 정리 및 viewport 요청 경합 테스트를 추가해 수정했다.
- Codex 독립 재실행: 단위·통합 112/112, 실제 Chromium Story 테스트 61/61, 프로덕션 E2E 7/7, 타입 검사·lint(경고 0)·format 검사 통과. 프로덕션 E2E는 앱 프로덕션 빌드 후 실행했다.
- Opus의 개발 서버 E2E 7/7 및 Storybook 빌드 통과 보고와 로그를 확인했다. Codex는 데스크톱·모바일 캡처를 직접 읽었다.
- 검수 결과: 가져오기·저장소·기본 렌더링 단위 승인. 측정·결과 저장, 영상 조작, 썸네일, 모바일 Sheet, 최종 README와 전체 검증은 다음 단위에 남아 있다. 전체 제품 완료 승인은 아니다.

## 3차 진행 중: 측정·결과 저장과 사용량에 따른 중단

- 비등방 보정에서 회전 타원 면적이5π로 계산되지만 정답은4π인 회귀 테스트를 먼저 작성해 실패를 확인했다. 수정 후 전체 실행에서 통과했다.
- 저장 hook의 변경 없는 수동 저장 이후 실제 저장 누락과 검사 변경 시 이전 검사 상태 노출을 각각 회귀 테스트로 재현했다. 검사별 세션 구조 수정 후 두 테스트가 통과했다.
- JSON의 좌표계 선언을 무시해 canvas좌표를 영상좌표로 가져오는 문제를 회귀 테스트로 재현했다. 좌표계 검증 수정 후 통과했다.
- 2026-11-02 19:07 KST Codex 실행: 단위·통합218/218 통과(사용량 감시 정책9개 포함). 앱 타입 검사에는 작업 화면 조립 중 StackViewerProps의index/onIndexChange 누락1건이 남았다. 전체 제품 검수는 미완료다.
- 사용자 요청에 따라 Claude사용량91%에서 감시기가 자동 중단했다. 재설정21:50 KST 후 실제 회복을 확인해 재개하도록 구성했다. 진행 메모는 `docs/agent-handoff.md`, 운영 방법은 `docs/agent-usage-monitor.md`에 있다.

### 21:50 재설정 후 검수 재개

- 감시기가 Claude 실제 사용량0% 회복을 확인하고 기존 Opus·Codex 세션을 재개했다. 이후 두 세션 사용량 조회도 계속 갱신되고 있다.
- Codex가 엔진의 기존 주석 핸들 수정 이벤트 미반영과 unmount 후 엔진 주석 잔존을 각각 실패 테스트로 재현했다. Opus 수정 후 두 검수 테스트를 독립 재실행해 통과했다.
- 새 dev E2E 전체 실행은15개 통과·3개 실패다. JSON 왕복과 CT/MR 슬라이스 밝기 검증이 실패하며, 전체 제품 검수는 계속 진행 중이다.
- 코드 검수에서 영상 좌표만 편집할 때 world 좌표가 이전 값으로 남아 내보낸 JSON이 재가져오기에서 거부되는 원인을 찾아 수정 지시했다. 가져오기 정합성 검증은 유지한다.
- 설치된 Cornerstone 소스는 로딩 완료 전에 currentImageIdIndex를 먼저 바꾼다. 주석 동기화의 중간 render가 이전 픽셀을 새 위치로 완료 처리할 가능성을 찾아 실제 표시 이미지 기준 회귀·수정을 지시했다.
- `use-series-thumbnail.review.test.tsx`: 썸네일 등록 완료 전 이탈하면 늦게 등록된 파일이 해제되지 않는 Red를 직접 확인했다. 수정 중이다.
- `annotation-editor.review.test.tsx`: 같은 주석 메모의 undo/import 이후 입력란이 이전 메모를 표시하는 Red를 직접 확인했다. 수정 중이다.

## 사용자 테스트 회귀: 확대 이후 도구 전환

- 사용자 보고: 확대 도구 사용 후 다른 도구를 선택해도 확대만 실행됨.
- Codex가 프로덕션 브라우저에서 확대→길이 전환 후 주석0개인 실패를 먼저 재현했다(`tests/e2e/tool-switching.spec.ts`).
- 설치된 Cornerstone ToolGroup의 `setToolActive`는 기존 bindings와 새 bindings를 합친다. 기존 코드가 Pan/Zoom의 왼쪽 버튼 연결을 제거하지 않은 것이 원인이다.
- `use-viewer-tools.ts`에서 모든 도구의 bindings를 명시적으로 해제한 뒤 보조 버튼과 현재 도구를 다시 연결하도록 수정했다. 확대·이동 이후 측정5종/선택/밝기대비/이동 전환 회귀10개를 개발 브라우저에서 통과했다.
- Codex 독립 실행: 단위·통합232개, Story92개, typecheck·lint(경고0)·format 검사, 프로덕션 빌드 통과. 프로덕션 전체E2E30/30 통과(기존20개+도구 전환10개), 개발 도구 전환10/10 통과. 전환 흐름의 브라우저 pageerror·console error가 없었으며 스크린샷은 `/tmp/herdr-tool-switching-fixed.png`다.
- 갱신된 미리보기는 `http://127.0.0.1:3000`, PID파일은 `.local/preview.pid`, 로그는 `.local/preview.log`다. 이전 Opus scratchpad의 preview.pid는 갱신 전 프로세스이므로 사용하지 않는다.
