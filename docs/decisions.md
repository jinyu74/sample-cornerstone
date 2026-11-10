# 사용자 결정 항목

구현을 막지 않는 항목은 아래 기본값으로 진행한다. 결정이 바뀌면 영향 범위의 설계를 다시 검토한다.

| #   | 질문                                                        | 현재 기본값(권장)                                                                  | 영향                                                                                                               |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | 원본 영상과 결과를 서버에 보관할지, 로컬 전용으로 유지할지  | 로컬 전용(IndexedDB). 서버 업로드는 미구현이며 UI 에 업로드 완료를 표시하지 않는다 | 서버 보관 시 인증·전송 암호화·비식별화·보존 정책과 저장소 어댑터 구현 필요. 저장소 인터페이스는 교체 가능하게 설계 |
| 2   | 브러시·지우개·임계값 기반 픽셀/복셀 분할이 첫 출시 필수인지 | 측정·2D 윤곽 라벨링까지. mask 분할 미구현                                          | 필요 시 Cornerstone segmentation(labelmap) 상태·저장 스키마(마스크 인코딩) 추가                                    |
| 3   | MPR, 3D 표시, 슬라이스 간 보간, 3D 부피 계산                | 초기 범위 제외                                                                     | 필요 시 같은 작업 화면에 VolumeViewport 모드 추가. 재구성 가능 여부(등간격·동일 방향) 검사 필요                    |
| 4   | 사용자 계정, 공동 작업, 검수·승인 역할                      | 단일 사용자                                                                        | 계정 도입 시 서버 저장소·권한·변경 이력 필요                                                                       |
| 5   | 병원/PACS 연동과 DICOM SR·SEG 교환                          | 버전 있는 자체 JSON                                                                | 필요 시 DICOMweb 연동, SR(TID 1500)·SEG 변환기 추가                                                                |

## 구현 중 기록한 기술 결정

| 항목                | 결정                                 | 근거                                                                       |
| ------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| TypeScript 버전     | 6.0.3                                | 최신 7.0.x 는 typescript-eslint peer 범위(`<6.1`) 밖                       |
| ESLint 버전         | 9.39.5                               | eslint-config-next 의 react/import/jsx-a11y 플러그인 peer 가 ESLint 9 까지 |
| FSD pages 계층 이름 | `src/views`                          | Next.js Pages Router 와 충돌 방지(빈 pages 라우터 우회 사용 안 함)         |
| 슬라이스 정렬 기준  | 위치·방향 → InstanceNumber → SOP UID | 파일명 순서 사용 금지. 각 단계 대체 시 경고를 남겨 UI 에 표시              |

### 슬라이스 위치 정렬의 전순서 보장 (1차 검수 반영)

- 문제: 비교 함수 안에서 거리 차이가 허용 오차(1µm) 이내이면 "같음"으로 처리하면 비교 관계가 추이적이지 않다. 예를 들어 z=0, 0.00075, 0.0015 이면 인접한 쌍은 같고 양 끝은 다르다. 이 때문에 정렬 결과가 입력 순서에 따라 달라졌다(6개 순열에서 3가지 결과).
- 결정: (1) 정확한 투영 거리 → InstanceNumber → SOP UID → frame 의 사전식 전순서로 먼저 정렬한다. (2) 정렬된 목록을 앞에서부터 훑으며 그룹 첫 영상(앵커)과의 거리가 허용 오차 이내인 영상을 같은 위치 그룹으로 묶는다. (3) 그룹 안에서만 InstanceNumber → SOP UID 로 재정렬한다. (1)의 결과가 입력 순서와 무관하므로 (2)·(3)도 결정적이다.
- 대안과 기각 이유: 거리를 격자로 양자화해 키로 쓰는 방식도 전순서이지만, 격자 경계 양쪽의 매우 가까운 영상을 같은 위치로 묶지 못한다. 앵커 방식은 연쇄된 근접 위치(0 과 0.0015)를 한 그룹으로 합치지 않아 그룹 폭이 허용 오차를 넘지 않는다.
- 참조 방향: 입력 첫 영상이 아니라 SOP UID·frame 이 가장 작은 영상의 방향을 참조로 삼고, 모든 영상을 그 참조와 비교한다. 첫 영상을 참조로 삼으면 방향 오차가 연쇄될 때(행 방향 차이 0, 0.8e-4, 1.6e-4, 허용 오차 1e-4) 순열에 따라 공간 정렬 가능 여부와 법선이 달라졌다.
- 경고 우선순위: 위치 누락 → 무효 방향 → 방향 불일치 순으로 판정한다. 모든 영상에 대해 먼저 유효성을 검사하므로, 무효 방향과 불일치가 함께 있어도 원인 경고가 입력 순서에 따라 바뀌지 않는다.
- 남은 가정: 같은 SOP UID·frame 을 가진 영상이 중복으로 들어오면 비교상 같으므로 입력 순서가 유지된다. 이 중복은 가져오기 단계(S2-4)에서 제거·충돌 처리한다.

### 2단위 기술 결정

| 항목                        | 결정                                                                                  | 근거                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| WASM 코덱의 `require("fs")` | `next.config.ts` 의 `turbopack.resolveAlias` 로 브라우저 번들에서만 빈 모듈로 대체    | Emscripten 코덱의 Node 전용 분기(`ENVIRONMENT_IS_NODE`)가 Turbopack 해석 오류를 낸다. 브라우저에서는 실행되지 않는 경로다 |
| Cornerstone 로딩            | `shared/viewer` 에서 동적 import, 한 번만 초기화                                      | SSR 중 브라우저 API 실행 방지, 초기 번들 축소                                                                             |
| Worker·WASM                 | dicom-image-loader 기본 `new Worker(new URL(...))`·`new URL(wasm)` 경로를 그대로 사용 | dev·prod E2E 에서 Worker 생성과 `charlswasm_decode.wasm` 200 응답, JPEG-LS 실제 픽셀 확인                                 |
| 글꼴                        | 시스템 한국어 sans 스택(`--font-family-base`)                                         | 네트워크 글꼴 없이 오프라인 빌드, 한글 표시 일관성. Storybook·E2E 에서 computed style 회귀 검증                           |
| 강조색 대비                 | 텍스트 배경 `--primary #0f766e`, 장식 `--brand #0d9488`, destructive `#b91c1c`        | 작은 텍스트 AA 4.5:1. `docs/design/visual-spec.md` 에 허용된 컨셉 차이로 기록                                             |
| 가져오기 버튼 배치          | `ImportActions`(헤더 버튼)와 `ImportDropZone`(드롭 영역) 분리                         | 컨셉 배치 일치, 각각 Story 로 검증                                                                                        |
| 작업 상태                   | 결과 저장 전이므로 모든 검사를 "미작업"으로 표시                                      | 실제 상태만 표시. 결과 저장 단위에서 주석 유무로 계산                                                                     |

### 3단위 기술 결정

| 항목                        | 결정                                                                                                                         | 근거                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 좌표 기준                   | 결과의 기준 좌표는 이미지 픽셀 index `[열, 행]`(첫 픽셀 중심 (0,0)), world 좌표는 유효한 기하일 때 함께 저장                 | 측정은 이미지 좌표 × 해당 프레임 PixelSpacing 으로 한 번만 계산(간격 이중 적용 방지), world 는 FOR·정합성 검증용                               |
| 엔진 좌표 변환              | 기하가 유효하면 도메인 `imageToWorld`/`worldToImage`, 없으면 Cornerstone 유틸에 0.5 오프셋 보정                              | 설치 버전의 `imageToWorldCoords` 는 첫 픽셀 중심이 (0.5,0.5)이고 열 index 에 PixelSpacing[0] 을 곱해 비등방 DICOM 규약과 다름                  |
| 문서 ↔ 엔진 주석            | 작업 문서가 기준. 현재 영상의 주석만 엔진에 다시 그리고, Completed·HandlesUpdated(포인터를 뗄 때 한 번)만 문서 편집으로 반영 | StatsUpdated 등 계산 이벤트로 인한 루프·불필요한 실행 취소·저장 방지                                                                           |
| 캔버스 측정 문구            | 엔진 자체 통계 대신 문서 측정값(`getTextLines`) 표시                                                                         | 화면과 결과 목록·JSON 의 값과 보정 규칙을 하나로 유지                                                                                          |
| 화살표 메모                 | 엔진 기본 문구 "메모" 로 생성, 내용은 오른쪽 패널에서 편집                                                                   | ArrowAnnotate 는 빈 문구면 주석을 지움                                                                                                         |
| 렌더 완료 판정              | 엔진이 실제 표시 중인 영상(`getCornerstoneImage().imageId`) 기준                                                             | `setImageIdIndex` 는 로딩 전에 index 를 먼저 바꿈                                                                                              |
| 라벨 범위                   | 검사별 작업 문서가 라벨(기본 + 사용자 정의)을 가진다                                                                         | 내보낸 JSON 이 자체로 완결되고 다른 검사 결과와 섞이지 않음                                                                                    |
| 자동 저장                   | 1.5초 지연, 세션(검사)별 직렬 저장, revision 단조 증가, 저장소에서 오래된 revision 거부                                      | 오래된 비동기 쓰기·복원 전 빈 문서 덮어쓰기 방지                                                                                               |
| 가져오기                    | 검증 통과 시 현재 결과를 바꾸는 편집(`work/replace`, 실행 취소 가능), 실패 시 아무것도 바꾸지 않음                           | 부분 연결 방지                                                                                                                                 |
| 작업 상태                   | 결과 없음/주석 없음 = 미작업, 주석 있음 = 작업 중, 사용자 완료 표시 = 완료                                                   | 지시서의 세 상태를 실제 결과에서 계산                                                                                                          |
| Cornerstone Tools 빌드 정지 | `patches/@cornerstonejs__tools@5.14.0.patch` 로 compute worker 등록을 끊음(사용 시 명시적 오류)                              | compute worker 의 자기 import 순환이 Turbopack 프로덕션 빌드를 교착시킴. 진단·재발 대응은 `docs/build-hang-guide.md`. 분할 기능 도입 시 재검토 |
| Tailwind 탐색 범위          | `@import "tailwindcss" source("../..")` 로 `src` 만 탐색                                                                     | git 저장소가 아니라 `.gitignore` 가 적용되지 않아 로그·빌드 산출물까지 탐색함                                                                  |

### 이슈 #3 인증·저장 경계 기술 결정

- **서버 검증 위치**: Proxy(`src/proxy.ts`)는 토큰 갱신 쿠키 반영과 낙관적 리다이렉트만 한다(`getClaims`). 보호 페이지·레이아웃·`/auth/session` 은 서버 DAL(`requireUser`/`getCurrentUser`)이 `auth.getUser()` 로 Auth 서버에 확인한다. 쿠키의 세션 객체(`getSession`)는 신뢰하지 않는다. 레이아웃은 화면 이동마다 다시 실행되지 않으므로 페이지에서도 다시 확인한다.
- **캐시**: Proxy 의 모든 분기(통과·리다이렉트·설정 오류 503)와 인증 Route Handler 응답에 `private, no-cache, no-store` 를 붙인다.
- **로그인·로그아웃**: 로그인은 Server Action(입력 서버 검증, 잘못된 자격 증명과 서비스 오류를 구분하되 계정 존재 여부는 드러내지 않음). 로그아웃은 같은 출처(scheme·host·port) POST Route Handler + 상대 `Location` 303. 서버 내부 `request.url`(localhost)로 리다이렉트하면 출처가 바뀌어 쿠키·탭 간 알림이 끊기므로 상대 경로를 쓴다.
- **다른 탭 알림 시점**: POST 전에 BroadcastChannel 로 알리면 같은 탭의 SessionGuard 이동이 POST 를 취소할 수 있다. 서버 로그아웃 후 `/login?signed_out=1` 에 도착한 탭이 알린다.
- **계정별 저장소**: 전역 싱글턴 저장소를 없애고, 서버가 검증한 계정 ID 별 IndexedDB(`dicom-annotator:user:<uuid>`)를 `UserStorageProvider` 가 제공한다. 같은 계정 이동·StrictMode 재마운트에서는 보유 수 레지스트리로 연결을 유지하고, 계정이 바뀌면 `key={userId}` 로 하위 트리를 새로 만든다.
- **정리 순서**: 저장소 정리는 `closeWhenIdle` 로 진행 중 작업과 그 직후 이어지는 직렬 저장(flush)이 끝난 뒤 닫는다. 단순 지연 `close()` 는 첫 저장이 끝나기 전에 닫혀 두 번째 revision 저장이 실패함을 mutation 테스트로 확인했다.
- **문서 전체 이동과 저장**: 로그아웃은 문서 전체 이동이라 React 정리의 저장을 기대할 수 없다. 뷰어는 로그아웃 전에 `saveNow` 를 기다리고, 실패하면 확인 대화상자를 띄운다.
- **기존 익명 저장소**: 이전 공용 `dicom-annotator` DB 는 열거나 지우거나 계정에 옮기지 않는다(다른 사람 자료가 섞이는 것을 막음). 재가져오기·JSON 복원을 안내한다.
- **로컬 Supabase 설정**: `[auth] enable_signup = false` 로 모든 제공자의 공개 가입을 막는다. `[auth.email] enable_signup` 은 이메일 로그인 제공자 자체를 끄므로 `true` 로 둔다(끄면 `email_provider_disabled`). 공개 키만 Next 서버에 주고(`NEXT_PUBLIC_` 미사용) 서비스 비밀키는 로컬 관리 스크립트에서만 실행 중에 읽는다.
- **세션 종료 시 fail-closed(PR #4 리뷰 P1)**: 세션 무효를 감지하면 문서 이동 성공 여부와 무관하게 SessionGate 가 보호 화면(계정 저장소 포함)을 먼저 언마운트하고 로그인 안내만 렌더링한다. 미저장 확인(beforeunload)을 사용자가 취소해도 이전 계정 화면이 남지 않는다. 언마운트로 시작된 마지막 편집 저장은 계정 저장소가 진행 중·직렬 저장을 마치고 닫힐 때까지 최대 3초 기다린 뒤 이동한다(정리 실패·초과 시에도 화면은 닫힌 채 이동). 상태·이탈 순서는 `useSessionEnd`, 조립은 `ProtectedShell`(app), 렌더는 `SessionGate`(features)가 맡는다.
- **세션 쿠키 이름(PR #4 리뷰 P2)**: 기본 이름 `sb-<호스트 첫 부분>-auth-token` 은 같은 호스트의 다른 Supabase 프로젝트(다른 포트)와 겹친다(쿠키는 포트로 구분되지 않음). `cookieOptions.name = "sb-dicom-annotator-auth-token"` 으로 고정하고 로그아웃은 이 키·청크(`.N`)·`-code-verifier` 만 지운다. 서비스 오류로 signOut 이 실패해도 이 앱 쿠키는 지운다.

### 이슈 #5 검사 메타데이터·RLS·SSR 목록 기술 결정

- **저장 범위**: 서버(로컬 Supabase Postgres)에는 목록용 메타데이터만 둔다. 원본·픽셀·작업 결과는 계정별 IndexedDB 에 남는다. 투영은 `projectCatalogStudy` 의 명시 allowlist(UID·날짜·설명·Study ID·Accession·modality·시리즈 번호/설명·원본 SHA-256)이며 환자 ID 는 보내지 않는다(데이터 최소화, 감독 승인). 그 결과 서버에만 있는 행의 식별자는 Accession → Study ID → UID 이고, 원본이 있는 브라우저는 기존 규칙(환자 ID 포함)을 유지한다.
- **스키마**: `catalog_studies`·`catalog_series`·`catalog_instances` 정규화, PK 에 `owner_id` 포함(A·B 가 같은 UID 독립 소유), 계층 FK(owner, study[, series]), UID·digest·날짜·길이·제어문자 CHECK. 수는 클라이언트 aggregate 가 아니라 `catalog_study_summaries`(security_invoker view)가 센다.
- **권한**: 각 테이블 RLS + `to authenticated` SELECT/INSERT 정책(`(select auth.uid()) = owner_id`). UPDATE·DELETE 정책·GRANT 없음(소유권 변경 불가), INSERT 는 컬럼 지정(created_at 제외). anon/PUBLIC 권한 없음. `service_role` 의 SELECT·DELETE 는 합성 테스트 계정 정리 전용이며 앱은 쓰지 않는다. `user_metadata` 를 권한 근거로 쓰지 않는다.
- **원자적 반영**: RPC `sync_catalog_study(p_expected_owner, p_study)` 는 `SECURITY INVOKER`·`search_path=''`, authenticated 만 EXECUTE. 기대 계정 ≠ `auth.uid()` 이면 거부, 키·타입·개수(시리즈 200·영상 1000)를 SQL 에서도 검증, `on conflict do nothing` 후 시리즈/영상 계층·digest 충돌이면 예외로 트랜잭션 전체 취소(기존 기록 보존, 같은 요청의 새 행도 미반영). 반복·동시 요청은 멱등.
- **기대 계정**: 클라이언트가 보내는 `expectedUserId` 는 권한 근거가 아니라 계정이 바뀐 뒤 도착한 이전 화면 요청을 거부하는 용도다. Route Handler(현재 계정 비교)와 RPC(`auth.uid()` 비교)가 모두 확인한다.
- **경로**: `POST /api/catalog/sync` Route Handler(같은 출처·JSON·본문 512KiB 상한 스트림 읽기·엄격 검증, 모든 응답 no-store). Proxy 공개 경로로 두어 리다이렉트 대신 401 을 준다. 서버 DAL 은 `@/entities/dicom-study/server`(server-only) 단일 공개 진입점이며, lint 는 이 정확한 경로만 허용한다(하위 경로·다른 슬라이스 `server` 는 계속 금지).
- **SSR**: `(protected)/page.tsx` 가 `requireUser` 후 `listCatalogStudies()` 결과(최소 DTO)를 클라이언트 페이지 props 로 넘겨 행이 최초 HTML 에 들어간다. 반영 성공 뒤 `router.refresh()` 로 다시 렌더링한다. 서버 목록 장애는 빈 목록이 아니라 `unavailable` 로 알린다.
- **큰 목록**: PostgREST `max_rows`(1000)를 넘겨도 잘리지 않도록 고유 키 오름차순 keyset 페이지로 읽는다(서버 상한이 페이지 크기보다 작아도 안전). 순서 판정은 DB 정렬에 맡기고 같은 키가 다시 오면 오류로 멈춘다(무한·중복 방지). DTO 는 검사 요약 + 비교용 (SOP UID, digest) + 시리즈 UID 만 담는다.
- **표시 규칙**: 원본 일치(서버 기록 대비 complete/partial/missing/mismatch)와 이 브라우저 실제 원본 수를 분리한다. 열기·미작업 판정은 실제 로컬 원본 기준, 반영 상태 우선순위는 이번 화면의 진행 중·실패 > 내용 불일치(충돌, 새로고침 후에도 유지) > 계산값. 시리즈 수는 서버∪로컬 시리즈 UID 합집합.
- **동기화 hook**: 진행 중인 검사에 다시 요청이 오면 dirty 로 표시하고, 끝난 뒤 최신 원본을 다시 읽어 마지막으로 보낸 스냅샷과 다를 때만 다시 보낸다. 언마운트·계정 변경 뒤 끝난 응답은 상태·`router.refresh` 에 반영하지 않는다.
- **migration 관리**: `db query` 로 로컬 스키마를 반복 검토 → advisors → `supabase db diff --local -s public -f <이름>` 로 CLI 생성 → 이미 적용된 로컬 DB 는 `migration repair --status applied` 로 기록만(재실행·db reset 없음) → `db:verify-migrations` 로 새 임시 DB 재현 비교. 파일 2개(`20261104064142_study_catalog`, `20261104064659_study_catalog_rpc_input_validation`).

### 이슈 #7 비공개 DICOM 원본 보관·인증 조회 기술 결정

- **저장 방식**: 원본은 server-only `DICOM_DATA_DIR` 아래 비공개 파일(`v1/users/<Auth UUID>/instances/<SOP UID>.<SHA-256>.dcm`, 디렉터리 0700·파일 0600)로만 보관한다. DB·Storage·public 미사용, 새 테이블·권한 없음. 보관 여부는 실제 파일로만 판정한다(DB 플래그는 파일 손실·부분 실패 시 거짓 성공 위험).
- **UX**: 사용자 결정에 따라 검사별 "서버에 원본 보관" 버튼만 업로드를 시작한다(자동 업로드 없음). 새 브라우저는 "서버에서 원본 불러오기"로 받아 기존 `importDicomFiles` 경로로 계정별 IndexedDB 에 저장한다.
- **Proxy 제외**: 설치된 `next/dist/server/body-streams.js` 의 `getCloneableBody` 는 Proxy 가 실행되는 요청 본문을 메모리에 복제하고 10MB 에서 잘라 버린다. `experimental.proxyClientMaxBodySize` 로 키우면 버퍼 메모리도 커지므로, `/api/originals/` 를 matcher 에서 제외하고 Route 가 Auth(getUser)·토큰 갱신 쿠키·인증 설정 오류(503)를 직접 처리한다.
- **수신 순서**: 같은 출처·형식 → Auth·기대 계정 → 설정 → 동시성 → 스트림 수신(상한, 부분 쓰기 반복·0바이트 쓰기 실패) → 서버 파싱(상한 있는 deflate 해제기 주입, 브라우저 경로 불변) → 주소 SOP = 파일 SOP → 서버 메타데이터로 카탈로그 RPC(RLS·충돌) → `link` 로 원자적 공개(덮어쓰기 없음, `EEXIST` 는 일반 파일·내용 digest 일치일 때만 멱등 성공). 다른 프로세스와의 같은 SOP 다른 내용 경합은 카탈로그 고유 키가 막고, 프로세스 안에서는 루트·owner·SOP 별 전역 lock 으로 직렬화한다.
- **저장 루트 검증**: 문자열 비교만으로는 대소문자 별칭(`PUBLIC`=`public`, `PROJECT`=프로젝트)을 막지 못해, 금지 폴더·프로젝트 루트와 기존 상위 폴더의 장치·inode 를 비교하고 아직 없는 금지 폴더는 프로젝트 기준 첫 구성요소를 대소문자 무시로 비교한다. symlink·그룹/기타 권한은 거부하고 기존 권한을 바꾸지 않는다. Turbopack 이 프로젝트 경로 검사를 출력 추적으로 오인해 프로젝트 전체를 서버 출력에 넣지 않도록 해당 `path.join` 에 `turbopackIgnore` 를 둔다(빌드 경고 0, 원본 Route 추적 파일에 public·src 없음 확인).
- **읽기 무결성**: 다운로드 스트림은 읽는 동안 digest 를 다시 계산해 다르면 오류로 끝나고, 클라이언트도 서버 목록 digest 와 비교한 뒤에만 저장한다.
- **상한**: 파일 256MiB, 동시 업로드 기본 1(감독 결정, 메모리는 업로드당 파일 상한의 몇 배로 추정). 삭제·보존·계정별 용량 상한은 이번 범위 밖(운영자 수동 관리, 디스크 부족 507).
- **목록 DAL**: `listStoredOriginals()` 는 owner 인자를 받지 않고 현재 Auth 계정만 쓴다(감독 지적). SSR 목록은 영상별 `stored` 와 기능 상태만 담고 경로·헤더·원본을 담지 않는다.
