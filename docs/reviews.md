# Codex 검수 기록

## 이슈 #5 진행 중: 메타데이터·RLS·SSR 목록

- PR #4는 사용자 명시 요청으로 head66d63a2를 병합했고, main41fb4d6 기준 `feat/5-study-catalog-ssr`를 생성했다. 이슈 https://github.com/jinyu74/sample-cornerstone/issues/5 . 이번 후속 PR의 병합 허가는 별도다.
- Opus 계획 `.local/issue5/plan.md`: allowlist 메타 투영, owner를 포함한 검사/시리즈/인스턴스 정규화·RLS·SECURITY INVOKER RPC/view, 실제JWT Data API 권한 검증, 최초HTML SSR, 브라우저 원본가용성·실패재시도, 합성계정 자료격리·별도임시DB migration검증. 기존 Auth/볼륨 reset 없이 진행한다.
- 감독 독립 Red: 최초 도메인2파일36개 미구현 실패(`codex-red-domain.log`), 추가 다중시리즈 상한 회귀1개 실패(`codex-red-series-limit.log`). 현재 구현·검수 완료가 아니다. 감독 회귀는 `catalog-metadata.review.test.ts`이며 각 청크가 수신 상한과 parse를 통과하고 모든SOP가 정확히1회 포함되는 조건이다.
- 도메인3파일40개를 감독이 독립 재실행해 Green을 확인했다. 실제DB25개 Green·migration재현 로그를 확인했고, 공개RPC가unknown필드/객체타입을받는 경로를 감독 `catalog-input.review.db.test.ts` 실제JWT4개 Red로재현했다. SQL검증보완후 감독4개독립Green을확인했다. 합성검수계정은 기존DB/E2E계정과분리했다.
- `verify-migrations.ts`의 시작전 고정이름DB강제삭제를 CLI대역 소유권회귀로 Red 확인했다(`codex-red-migration-ownership.log`). 실제DB를삭제하지않았고, 실행별고유임시DB·CREATE성공한소유DB만정리하도록 수정지시했다. 최종 검수완료는 아니다.

- 실제DB전체4파일40개와 migration 재현을 감독이 독립 실행해 통과했다. 검증 도구 소유권 수정 후에는 성공했으며, 명령 실패의 raw 오류에 DB URL 비밀번호가 포함되는 경계도 합성 비밀값의 CLI 대역으로 추가 Red 확인해 보완 지시했다.
- 동기화 중 같은 검사에 새 원본을 추가한 뒤 두 번째 반영 요청을 보내면 inFlight 중복 억제가 새 스냅샷까지 버리는 누락을 감독 회귀로 재현했다(`use-catalog-sync.review.test.tsx`, `codex-red-sync-during-import.log`). 단순 중복 호출 억제와 새 자료 이어 반영을 함께 유지하도록 수정 지시했다.

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

## 이슈 #5 — 검사 메타데이터·RLS·SSR 목록

로그는 `.local/issue5/`(git 제외). 감독 회귀(`*.review.test.*`)는 기대값을 유지했다.

- **도메인**: 투영·검증·원본 비교 36건 Red(`red-domain.log`, 감독 독립 확인) → 40/40. 감독 회귀 `catalog-metadata.review.test.ts`(시리즈 200개 초과 분할)를 포함해 영상·시리즈 상한을 함께 넘는 검사도 각 청크가 서버 검증·본문 상한을 통과함을 확인했다.
- **실제 DB**: 첫 단계(테이블 없음)는 cleanup 오류로 suite 가 실행되지 않았다(`red-db.log`). 테이블·제약만 있고 RLS·권한·RPC 가 없는 단계에서 25/25 실패(`red-db-stage-a.log`): anon 읽기·쓰기 노출, B 의 owner=A 삽입 미차단 등. 이때 anon RPC 테스트가 함수 없음(404)으로 통과하는 문제를 발견해, 모든 거부 테스트가 A 의 정상 쓰기 성공을 먼저 확인하고 `42501` 코드를 요구하도록 강화했다. 감독 지적에 따라 `syncOk` 가 결과를 반환하도록 정리했다.
- **감독 RPC 입력 회귀**(`catalog-input.review.db.test.ts`): Route 를 거치지 않는 직접 RPC 가 unknown 키·잘못된 타입을 받는 4건 Red → SQL 형태 검증 추가 → 29/29. 두 번째 migration 첫 생성본의 죽은 분기는 history 를 reverted 로 되돌리고 파일 삭제 후 재생성했다(파일·history 일치).
- **migration 재현 검증 도구**: 감독 회귀(`migration-database-ownership.review.test.ts`)로 ① 고정 이름 임시 DB 를 시작 시 DROP 하는 문제, ② CLI 실패 시 db-url 비밀번호가 오류에 남는 문제를 재현했다. 실행별 고유 임시 DB·생성한 DB 만 정리·이름 형식 재확인, 하위 명령·종료 코드만 담은 오류로 고쳤다. 실제 검증 동시 2회 통과, live DB history·정책·role·계정 수 불변(`live-before/after.txt`).
- **목록 조회**: 1000행 초과 검사·영상(검사 1101, 영상 2500) keyset 조회 6건 Red → Green. 같은 페이지 반복 시 멈춤은 가짜 클라이언트 단위 테스트로 검증했고, 이 테스트는 구현 뒤 작성했으므로 변형(중복 검사 제거)에서 실패함을 확인했다(`mutation-pagination.log`).
- **동기화 hook 경합**(감독 `use-catalog-sync.review.test.tsx`): 첫 전송 중 같은 검사에 원본을 추가하면 두 번째 요청이 버려져 서버에 일부만 남고 `synced` 로 표시되던 문제. dirty 재조회·스냅샷 비교로 수정, 같은 데이터 중복 호출 1회 전송 기대 유지. 브라우저 회귀(E2E "첫 반영이 진행 중일 때…")도 추가했다.
- **로컬 미반영 원본**(감독 `catalog-local-unsynced.review.test.tsx`): 서버 기록과 다른 영상만 가진 브라우저에서 열기가 숨겨지고 작업 상태가 '기록 없음'이 되던 문제. 서버 대비 일치도와 실제 로컬 원본 수를 분리했다. `Math.max` 로는 서로 다른 시리즈를 셀 수 없어 DTO 에 시리즈 UID 를 넣고 합집합으로 센다.
- **충돌 유지**(감독 `build-catalog-rows.review.test.ts`): 새로고침으로 요청 결과가 사라지면 digest 충돌이 '반영됨'으로 돌아가던 문제. E2E 에 새로고침 후 불일치·반영 실패 유지·로컬 열기·서버 보존 확인을 먼저 추가해 Red(`red-e2e-persisted-conflict.log`) → 불일치를 충돌로 유도해 Green.
- **E2E Red**: 기능 연결 전 기존 prod 빌드(`E2E_SKIP_BUILD=1`)로 새 8건이 기능 없음 때문에 실패함을 확인했다(`red-e2e-catalog.log`). 새 컨텍스트가 프로젝트 기본 로그인 상태를 물려받아 B 로그인 화면이 열리지 않은 테스트 준비 오류는 빈 storageState 명시로 고쳤다.
- **dev Cache-Control**: dev 에서 `private` 검사가 실패했다. 설치된 `next/dist/server/base-server.js` 의 `if (dev) res.setHeader("Cache-Control", "no-store")`(감독 직접 확인)로 dev 가 페이지 응답 헤더를 덮어쓰는 프레임워크 계약 차이다. 두 모드 모두 `no-store`·`public` 없음을 요구하고, `private` 는 prod 에서만 요구한다. 계정·SSR 행 검사는 그대로다.
- **콘솔 검증**: 새 spec 은 pageerror 와 콘솔 오류를 모두 실패로 본다. 일부러 abort/503 을 만드는 두 테스트에서만 그 요청의 리소스 로그 패턴을 등록한다(감독 지적으로 일괄 예외에서 범위 축소).
- **dev stream 경고(남는 제한)**: dev E2E 서버 로그에 `The destination stream errored while writing data.` 가 남는다(최종 dev 58/58 실행에서 17건, prod 0건, 이전 이슈 dev 0건). 확정한 증거(`stream-diag-evidence.log`): 새 브라우저 페이지가 동기화 뒤 `router.refresh` RSC 요청(`/`)을 보낸 뒤 완료·실패 이벤트 없이 테스트가 컨텍스트를 닫았고, 그 직후 서버 경고가 찍혔다. 닫기 전 `networkidle` 을 기다리면 같은 조합(4·5번)에서 0건이 됐다(`stream-diag.log` 반복). 남는 제한: 나머지 경고를 요청 단위로 하나씩 대응시키지는 않았다. 기존 spec 에서도 가져오기 직후 다른 화면으로 이동하는 흐름이 같은 방식으로 refresh 를 끊는 것으로 추정한다. 해당 테스트들의 브라우저 pageerror·SSR 응답 실패는 없었고, 서버 로그는 필터링하지 않았다.
- **Opus 최종 실행**: 단위 524, Story(변경 파일) 31, 실제 DB 40, typecheck·lint·format, 앱 빌드, prod E2E 58/58(`e2e-prod-1.log`, 기능 연결 직후 빌드, 그 뒤 충돌 유지 수정은 dev 로만 확인), dev E2E 58/58(`e2e-dev-final.log`). 마지막 prod 빌드·prod E2E·화면 QA·Storybook 빌드는 감독이 실행한다.

### 이슈 #5 감독 최종 사전 검수

- 직접 실행: `pnpm test` 78파일525개, `test:stories` 28파일121개, `test:db` 4파일40개, typecheck·lint(경고0)·format, 앱/Storybook build, migration 재현, local advisors(No issues), 최종 빌드의 전체 prod E2E58/58. 로그 `.local/issue5/codex-*-final.log`. dev 전체58/58은 Opus 실행 로그를 확인했다.
- Browser plugin이 없어 프로젝트 Playwright로 직접 QA했다. 데스크톱1440×1000·모바일390×844 목록, 합성 CT 가져오기·메타데이터 반영·영상 렌더, 새 브라우저의 원본 없음/작업 기록 없음/열기 차단, JS 없는 최초HTML 행과 no-store를 확인했다. 페이지/콘솔 오류0, 문서 가로 넘침0. `.local/issue5/codex-browser-qa.log`, `qa-*.png`를 시각 확인했다. 미리보기3000은 최종 빌드로 유지하고 Storybook dev는 실행하지 않았다.
- 충돌 유지 수정 후 감독 단위525개와 전체prod58개를 다시 실행했다. prod E2E와 미리보기 로그에는 destination stream 오류0건이다. dev17건의 제한은 위와 같다. README의 설명도 확인된 사실과 미확정 원인을 구분했다.
- PR 오픈 전 미해결 사전 검수 지적은 없다. PR 이후 별도 Codex가 현재 head 전체 merge diff를 리뷰해야 하며 사용자 병합 허가는 아직 없다.
