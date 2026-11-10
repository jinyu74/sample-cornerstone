# DICOM 작업실 — 환경 구성·실행·테스트

브라우저에서 DICOM 영상을 열고 측정·메모·장기/병변 라벨을 작성하는 앱입니다. Next.js App Router, React, TypeScript, Cornerstone3D를 사용합니다. 관리자가 만든 계정으로 로그인해야 쓸 수 있으며(Supabase Auth, 현재 로컬 스택), 원본 영상과 작업 결과는 **계정별로 이 브라우저의 IndexedDB**에 저장됩니다. 파일 가져오기는 서버 업로드가 아닙니다.

개발 규칙은 [AGENTS.md](./AGENTS.md)를 참고하세요.
이슈·작업 브랜치·Codex/Claude 역할·PR 리뷰와 병합 절차는 [공통 개발 절차](./docs/development-workflow.md)를 따릅니다. PR 오픈 후 별도 패널의 Codex 리뷰어가 `$review-agent` 스킬로 검토합니다. 리뷰 승인과 병합 권한은 별개이며, `main` 병합은 사용자가 직접 하거나 해당 PR·커밋에 대해 명시적으로 병합을 요청한 경우에만 진행합니다.

## 1. 환경 구성

프로젝트 루트에서 실행합니다.

```bash
cd /Users/jinyu/MyProject/herdrPractice
```

먼저 `mise`가 설치되어 있어야 합니다. 설치·셸 연결 방법은 [mise 공식 안내](https://mise.jdx.dev/getting-started.html)를 참고하세요. 아래 명령은 `mise exec`를 사용하므로 셸의 Node/pnpm 버전에 의존하지 않습니다.

| 도구                                  | 프로젝트 버전    |
| ------------------------------------- | ---------------- |
| Node.js                               | 24.22.2          |
| pnpm                                  | 12.17.0          |
| Next.js                               | 16.4.3           |
| React                                 | 19.3.1           |
| TypeScript                            | 6.0.3            |
| Cornerstone core/tools/DICOM loader   | 5.14.0           |
| Supabase CLI(mise)                    | 2.122.0          |
| @supabase/supabase-js · @supabase/ssr | 2.118.0 · 0.12.7 |

런타임 버전은 `mise.toml`, 패키지의 실제 설치 버전은 `pnpm-lock.yaml`로 관리합니다.

```bash
# 처음 신뢰하는 로컬 체크아웃에서 mise가 설정 신뢰를 요구할 때 실행
mise trust

mise install
mise exec -- node --version
mise exec -- pnpm --version
mise exec -- pnpm install --frozen-lockfile

# 브라우저 테스트에 필요한 Chromium 설치(최초 1회)
mise exec -- pnpm exec playwright install chromium
```

초기 도구·패키지·브라우저·Supabase 컨테이너 이미지 설치에는 네트워크 연결이 필요합니다.

### 로컬 인증(Supabase) 준비

로그인은 Docker 위의 **로컬 전용** Supabase Auth 를 사용합니다(클라우드 프로젝트·비용 없음). Docker 엔진이 실행 중이어야 합니다. 이 프로젝트 전용 스택(`project_id = "dicom-annotator"`, 포트 553xx)만 만들고 다른 컨테이너·볼륨은 건드리지 않습니다.

```bash
# 1) 전용 스택 시작(Auth·API 게이트웨이·Postgres·PostgREST 만 실행)
mise exec -- pnpm supabase:start

# 2) Next 서버용 연결 설정을 .env.local 에 기록(SUPABASE_URL·SUPABASE_PUBLISHABLE_KEY 만 갱신, 다른 설정 보존, 권한 0600)
mise exec -- pnpm auth:local-env

# 3) 관리자 경로로 로그인 계정 만들기(공개 가입은 서버 설정으로 막혀 있음)
mise exec -- pnpm auth:create-user reader@example.test
#    비밀번호는 출력하지 않고 .local/auth/user-<인코딩된 이메일>.txt(권한 0600)에만 씁니다.
#    같은 명령을 다시 실행하면 비밀번호를 새로 정합니다.

# 비밀번호 파일 확인: 목록·권한만 확인하고 내용은 터미널에 출력하지 마세요(로그·공유 화면에 남지 않도록).
ls -l .local/auth/
#    로그인할 때는 파일을 편집기로 직접 열어 비밀번호를 복사합니다.

# 종료(데이터 볼륨은 유지)
mise exec -- pnpm supabase:stop
```

- 공개 회원가입·소셜 로그인은 없습니다. `supabase/config.toml` 의 `[auth] enable_signup = false` 로 Auth 서버에서도 가입 API 를 거부합니다(422 `signup_disabled`).
- 서비스 비밀키는 관리 스크립트가 실행 중에만 `supabase status` 에서 읽고 파일·로그·브라우저 번들에 넣지 않습니다. 관리 스크립트는 로컬 주소(127.0.0.1·localhost)가 아니면 동작하지 않습니다.
- `.env.local` 이 없거나 값이 잘못되면 앱은 인증을 우회하지 않고 503 으로 실패합니다.

### 서버 검사 목록(메타데이터) DB 준비

검사 목록은 계정별로 로컬 Supabase Postgres 에 **목록용 메타데이터만** 저장합니다(RLS 로 본인 행만 읽고 쓸 수 있음). 원본 DICOM·픽셀·작업 결과(JSON)는 서버로 보내지 않고 계정별 IndexedDB 에만 둡니다. 스키마는 `supabase/migrations/` 의 migration 파일로 관리합니다.

```bash
# 새 스택(볼륨 없음): 처음 시작할 때 migration 이 자동 적용됩니다.
mise exec -- pnpm supabase:start

# 기존 스택(이미 계정·자료가 있는 볼륨): 아직 적용하지 않은 migration 만 적용합니다(db reset 불필요, 기존 계정·자료 보존).
mise exec -- supabase migration up --local
mise exec -- supabase migration list --local   # Local·Remote 열이 모두 채워져 있으면 적용 완료
```

- `supabase db reset`·볼륨 삭제는 기존 계정과 자료를 지우므로 쓰지 않습니다.
- 앱(Next 서버)은 서비스 비밀키 없이 **로그인한 사용자 세션**으로 Data API 를 호출하고, 권한은 DB 의 RLS·최소 GRANT·`SECURITY INVOKER` 함수가 판정합니다.

`pnpm-workspace.yaml`의 `patchedDependencies`가 Cornerstone 빌드 호환 패치를 적용합니다. `patches/`와 잠금 파일을 함께 유지하고, `node_modules`를 직접 수정하지 않습니다.

## 2. 앱 실행

### 개발 모드

```bash
mise exec -- pnpm dev --hostname 127.0.0.1 --port 3000
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)에 접속하면 로그인 화면으로 이동합니다. 위에서 만든 계정으로 로그인하세요(주소는 `127.0.0.1` 로 일관되게 사용하세요. `localhost` 와는 쿠키·브라우저 저장소가 따로입니다). 실행한 터미널을 유지하고, 종료할 때 `Ctrl+C`를 누릅니다. 코드를 수정하면 개발 서버가 반영합니다.

### 프로덕션 모드

개발 서버나 이전 미리보기 서버를 종료한 다음 실행합니다.

```bash
mise exec -- pnpm build
mise exec -- pnpm start --hostname 127.0.0.1 --port 3000
```

주소는 개발 모드와 동일합니다. 프로덕션 모드에서는 소스 수정 후 다시 빌드하고 서버를 재시작해야 변경이 반영됩니다.

같은 프로젝트에서 Next 빌드와 다른 빌드·개발 서버를 동시에 실행하지 마세요. 실행 중인 프로덕션 서버의 `.next`를 재빌드로 바꾸면 미리보기에 영향을 줄 수 있습니다. 빌드 정체 진단과 적용한 패치는 [빌드 문제 안내](./docs/build-hang-guide.md)에 있습니다.

### Storybook

```bash
mise exec -- pnpm storybook
```

[http://localhost:6006](http://localhost:6006)에서 디자인 컴포넌트와 상태·상호작용 예제를 확인합니다.

## 3. 다운로드한 의료 영상으로 수동 테스트

샘플 위치는 `samples/dicom/`, 다운로드 출처는 [Saga IT DICOM samples](https://saga-it.com/dicom/samples)입니다. 현재 폴더에는 CT·MR·DX 시리즈와 각 시리즈의 `CITATION.txt`가 있습니다. 출처와 데이터별 이용 조건은 해당 파일 및 원본 배포 페이지를 함께 확인하세요.

다운로드한 DICOM 원본은 용량이 커서 Git에 포함하지 않습니다. 새로 체크아웃했다면 위 출처에서 샘플을 내려받아 `samples/dicom/`에 압축을 풀어 주세요. 각 시리즈의 `CITATION.txt`는 저장소에 포함합니다.

예시 폴더:

| 폴더                                           | 시험할 흐름                         |
| ---------------------------------------------- | ----------------------------------- |
| `samples/dicom/ct-lung-screening-nlst-series/` | 다중 CT 영상 가져오기·슬라이스 탐색 |
| `samples/dicom/ct-chest-lidc-idri-series/`     | CT 시리즈 측정·메모·복원            |
| `samples/dicom/mr-brain-upenn-gbm-series/`     | MR 시리즈 가져오기·정렬·탐색        |
| `samples/dicom/dx-chest-covid-19-ar-series/`   | DX 영상 표시·측정 도구 전환         |

1. 검사 목록의 파일 선택으로 한 시리즈 폴더의 `.dcm` 파일들을 선택합니다. 폴더 선택을 지원하는 브라우저에서는 해당 시리즈 폴더를 선택할 수도 있습니다. ZIP 파일은 먼저 압축을 해제합니다.
2. 가져오기 결과에서 성공·중복·실패 항목을 확인한 뒤 검사를 엽니다. `CITATION.txt`나 `.DS_Store`는 DICOM이 아니므로 전체 폴더를 가져올 때 실패 항목으로 표시될 수 있습니다. 영상만 시험하려면 `.dcm` 파일만 선택합니다.
3. 시리즈를 선택하고 휠·슬라이더로 이동합니다. 영상 1개인 경우 슬라이스 탐색이 표시되지 않는지 확인합니다.
4. 확대를 사용한 뒤 길이·각도·타원·윤곽·메모로 바꿔 각각 동작하는지 확인합니다. 왼쪽 마우스는 선택한 도구, 오른쪽은 확대, 가운데는 이동입니다. `선택`으로 바꾸면 새 주석을 그리지 않고 기존 주석을 선택·편집합니다.
5. 길이·각도·타원을 그립니다. 윤곽은 드래그해 시작점 가까이 돌아와 닫고, 메모는 화살표를 그린 뒤 오른쪽 편집란에 입력합니다.
6. 라벨·대상·좌표·메모를 수정하고, 숨김·삭제·실행 취소·다시 실행을 확인합니다. 유효한 PixelSpacing이 있으면 mm/mm², 없으면 px/px²로 표시됩니다.
7. `저장` 후 저장 완료를 확인하고 새로고침합니다. 결과 목록에서 주석을 선택해 원래 시리즈·영상·프레임으로 이동하는지 확인합니다.
8. 결과 JSON을 내보냅니다. 별도 브라우저 프로필에서 같은 원본 DICOM을 가져온 뒤 JSON을 가져와 복원하고, 다른 검사의 JSON은 거부되는지 확인합니다.
9. 반전·회전·밝기대비·화면 맞춤·초기화와 검사 목록의 작업 상태를 확인합니다.

브라우저 저장소는 **프로필과 origin(프로토콜·호스트·포트)** 별로 분리됩니다. `localhost:3000`과 `127.0.0.1:3000`, E2E의 3100/3200은 서로 다른 저장소입니다. 기존 작업을 계속할 때는 같은 주소와 프로필을 사용하세요.

사이트 데이터 삭제나 브라우저 용량 제한으로 자료가 유실될 수 있습니다. 원본 DICOM을 별도로 보관하고 결과 JSON도 내보내세요. 결과 JSON에는 원본 픽셀이 없으므로 복원 시 같은 UID·프레임을 가진 원본이 필요합니다.

다운로드 샘플은 수동 확인용이며 아래 자동 테스트가 `samples/dicom/`을 자동으로 읽는 것은 아닙니다. 사용자의 영상 로딩 확인과 자동 검증 통과는 별개의 검증 기록입니다. 이 앱은 임상 진단용으로 검증되지 않았습니다.

## 4. 자동 테스트와 품질 검사

기능·수정 작업은 시나리오와 실패 테스트를 먼저 작성하고, 의도한 실패를 확인한 뒤 구현합니다. 테스트를 통과시킨 다음 리팩터링하고 회귀 검증합니다.

| 명령(`mise exec --` 뒤에 실행) | 내용                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| `pnpm test`                    | Vitest 단위·통합 테스트(jsdom, fake-indexeddb)                  |
| `pnpm test:watch`              | 단위 테스트 감시 모드                                           |
| `pnpm test:stories`            | 실제 Chromium에서 Story 상호작용·접근성 검사                    |
| `pnpm typecheck`               | TypeScript 검사                                                 |
| `pnpm lint`                    | ESLint 검사, 경고도 실패 처리                                   |
| `pnpm format:check`            | Prettier 형식 검사                                              |
| `pnpm format`                  | 파일 형식 자동 수정                                             |
| `pnpm build`                   | Next.js 프로덕션 빌드                                           |
| `pnpm build-storybook`         | Storybook 정적 빌드(`storybook-static/`)                        |
| `pnpm test:e2e`                | 앱 빌드 후 프로덕션 서버에서 E2E(3100)                          |
| `pnpm test:e2e:dev`            | 개발 서버에서 E2E(3200)                                         |
| `pnpm test:db`                 | 실제 로컬 Supabase(Auth·Data API)로 RLS·제약·목록 조회 검사     |
| `pnpm db:verify-migrations`    | migration 을 새 임시 DB 에 처음부터 적용해 로컬 DB 와 정의 비교 |

전체 검사 예시입니다. E2E는 자체 서버를 시작하므로 3100·3200 포트를 비워두고 빌드·E2E를 순서대로 실행합니다. E2E 는 **실행 중인 로컬 Supabase**(`pnpm supabase:start`)에 실제로 로그인합니다. 테스트 계정 A·B 는 실행마다 관리자 경로로 만들거나 비밀번호를 새로 정하며 `.local/e2e/` 에만 기록합니다. 테스트용 인증 우회는 없습니다.

```bash
mise exec -- pnpm check
mise exec -- pnpm test:stories
mise exec -- pnpm test:e2e
mise exec -- pnpm test:e2e:dev
```

서버 목록(DB) 검사도 실행 중인 로컬 Supabase 가 필요하며 `pnpm check` 에 포함되지 않습니다.

```bash
mise exec -- pnpm test:db
mise exec -- pnpm db:verify-migrations
mise exec -- supabase db advisors --local --type all --level info --fail-on warn
```

- `test:db` 는 전용 합성 계정(`db-reader-a/b@example.test`, `db-review-input@example.test`)만 관리자 경로로 만들고 실제 비밀번호 로그인 JWT 로 Data API 에 직접 요청합니다. 비밀번호는 메모리에만 두고, 시작·종료 시 **그 합성 계정의 catalog 행만** 지웁니다. 다른 계정·Auth 세션·볼륨은 건드리지 않습니다.
- `db:verify-migrations` 는 같은 로컬 Postgres 에 실행마다 고유한 임시 DB(`dicom_annotator_migration_check_<시각>_<난수>`)를 새로 만들고, 최소 auth 대역(`auth.users`·`auth.uid()`)을 둔 뒤 `supabase migration up --db-url` 로 처음부터 적용합니다. 컬럼·제약·인덱스·RLS·정책·GRANT·view·함수 정의를 로컬 DB 와 비교하고, 보안 불변식(view `security_invoker`, 함수 `SECURITY INVOKER`·`search_path` 고정, anon/PUBLIC 권한 없음, `user_metadata` 미사용)과 migration history 일치를 확인합니다. **이번 실행이 만든 임시 DB 만** 삭제하며, 시작 전에 있던 DB·클러스터 공용 role·로컬 DB 는 바꾸지 않습니다. 동시에 여러 번 실행해도 서로 간섭하지 않습니다. CLI 오류 메시지에는 연결 비밀번호를 남기지 않습니다.
- E2E 는 테스트마다 합성 계정 A·B 의 서버 목록 행만 비우고 시작합니다(`tests/e2e/fixtures.ts`). 서버 DB 는 브라우저 컨텍스트와 달리 테스트 사이에 남기 때문입니다.

`pnpm check`에는 Story 테스트와 E2E가 포함되지 않습니다. 위처럼 별도로 실행해야 합니다. 자동 E2E는 브라우저의 별도 테스트 컨텍스트를 사용하며, 평소 접속한 3000 포트의 사용자 저장소를 사용하지 않습니다.

프로덕션 미리보기를 유지하면서 **현재 소스와 일치하는 검증된 빌드**를 재사용하려면 다음 명령을 사용합니다.

```bash
E2E_SKIP_BUILD=1 mise exec -- pnpm test:e2e
```

소스를 바꿨다면 먼저 미리보기를 종료하고 재빌드해야 합니다. `E2E_SKIP_BUILD=1`은 빌드 생략 옵션이므로 이전 코드를 검사하지 않도록 주의하세요.

### 특정 회귀만 실행하기

```bash
# 확대·이동 뒤 다른 도구로 전환하는 사용자 보고 회귀
E2E_MODE=dev mise exec -- pnpm exec playwright test tests/e2e/tool-switching.spec.ts

# 특정 모델 테스트
mise exec -- pnpm exec vitest run --project unit src/entities/study-work
```

### 테스트 데이터와 실패 분석

- 개발 서버 E2E(`test:e2e:dev`) 로그에 `The destination stream errored while writing data.` 가 남습니다. 일부는 `router.refresh()` 의 RSC 응답 중 테스트 브라우저를 닫은 직후 발생함을 확인했으며, 나머지는 요청별 원인을 확정하지 않았습니다. 최종 dev E2E 는 통과했고 프로덕션 E2E 에서는 0건이었습니다. 자세한 근거와 제한은 `docs/reviews.md` 이슈 #5 절에 있습니다. 서버 목록 E2E 는 페이지 오류·예상하지 못한 콘솔 오류를 실패로 봅니다.

- 합성 DICOM 생성 코드: `tests/fixtures/dicom/`.
- E2E 시작 시 `tests/e2e/global-setup.ts`가 `tests/e2e/.fixtures/`를 다시 생성합니다. 이 생성 폴더에 수동 샘플을 보관하지 마세요.
- 자동 검증에는 합성 단일 CT, 다중 CT/MR, 멀티프레임, JPEG-LS, 보정 없는 영상과 잘못된 파일 등이 사용됩니다.
- 실패 산출물은 `test-results/e2e-prod/` 또는 `test-results/e2e-dev/`에 저장됩니다. 실패 출력의 실제 `trace.zip` 경로로 다음 명령을 실행합니다.

```bash
mise exec -- pnpm exec playwright show-trace <실패-출력에-표시된-trace.zip-경로>
```

현재 자동 브라우저 검증은 Chromium 기준입니다. 다른 브라우저, 다운로드 샘플 전체의 호환성·대용량 성능은 별도 검증이 필요합니다. 관련 인수 조건과 검수 기록은 [시나리오](./docs/scenarios.md), [검수 기록](./docs/reviews.md)을 참고하세요.

## 구현된 기능

- **가져오기**: 여러 파일 선택·폴더 선택·드래그앤드롭(폴더 포함). 확장자가 아닌 DICOM Part 10 내용으로 판별, 검사→시리즈→영상·프레임 구성, 파일별 성공·중복·충돌·실패 이유, 같은 SOP UID 다른 내용은 덮어쓰지 않음(충돌), 미지원 transfer syntax·필수 UID 누락·NumberOfFrames 불일치 거부.
- **정렬**: ImagePositionPatient 를 슬라이스 법선에 투영해 정렬(입력 순서 무관한 전순서), 불가하면 InstanceNumber → SOP UID. 파일 이름 순서는 쓰지 않음.
- **멀티프레임**: 파일 1개·프레임 N개. Enhanced 기능 그룹(Shared/PerFrame)의 위치·방향·간격을 읽고 프레임별로 보존. 공간/시간/판단 불가를 구분.
- **검사 목록**: 날짜·식별자·modality·시리즈 수·이 브라우저 원본·서버 목록 반영·작업 상태(미작업/작업 중/완료), 검색과 상태 필터. 계정의 서버 목록은 서버에서 렌더링되어 **최초 HTML 에 행이 들어갑니다**(JS 없이도 보임).
- **서버 목록(계정별 메타데이터)**:
  - 보내는 값(명시 allowlist): 검사·시리즈·영상 UID, 검사 날짜, 검사 설명, Study ID, Accession Number, modality, 시리즈 번호·설명, 원본 파일 SHA-256 digest. **환자 ID·이름 등 인구통계, 영상 기하, 픽셀, 파일 크기, 전체 헤더, 작업 결과는 보내지 않습니다.** Route Handler 는 본문을 최대 512KiB 까지만 읽고 키·형식·길이·개수를 검증합니다. DB 도 RPC·CHECK 로 키·타입·필드 제약과 배치 개수를 검증합니다. 큰 검사는 요청당 영상 1000개·시리즈 200개 이하로 나눠 보냅니다.
  - 가져오기가 끝나면 이 브라우저에 저장된 검사의 메타데이터를 자동으로 반영합니다. 반영이 실패해도 원본은 그대로이며 "서버 반영 실패"와 이유를 보여 주고, 네트워크·서버 오류는 "다시 시도"로 멱등하게 다시 보냅니다.
  - **기존(이 기능 이전) 로컬 검사**는 숨기지 않고 "미반영 N개"로 표시하며, 행의 "서버 목록에 반영" 버튼을 눌러야 보냅니다(자동 전송 없음). 로그인 이전의 익명 저장소는 여전히 열거나 옮기지 않습니다.
  - 같은 SOP UID 의 내용(digest)이 서버 기록과 다르면 기존 서버 기록을 보존하고 "내용 불일치"·반영 실패로 알립니다(새로고침 후에도 유지).
  - 계정이 바뀐 뒤 도착한 이전 화면의 요청은 서버가 현재 계정과 요청의 기대 계정을 비교해 거부합니다(권한 근거는 Auth 서버가 확인한 현재 계정뿐).
- **다른 브라우저·새 브라우저**: 같은 계정이면 서버 검사 정보가 보이지만 원본은 이 브라우저에 없으므로 "원본 없음"과 "원본 가져오기"를 보여 주고 "열기"는 숨깁니다. 일부만 있으면 "일부 원본 n/m", 서버 기록에 없는 영상만 있으면 "서버 영상 0/m · 이 브라우저 k개"(열 수 있음)로 구분합니다. 작업 결과는 아직 기록한 브라우저에만 있으므로, 이 브라우저에 원본도 작업 기록도 없는 서버 검사는 "미작업"이 아니라 "이 브라우저 기록 없음"으로 표시합니다.
- **식별자·시리즈 수 기준**: 이 브라우저에 원본이 있는 검사는 기존과 같이 Accession → Study ID → 환자 ID → Study UID 순으로 식별자를 정합니다. 서버에만 있는 검사는 환자 ID 를 서버에 두지 않으므로 Accession → Study ID → Study UID 순입니다(같은 검사라도 Accession·Study ID 가 없으면 브라우저마다 식별자가 다를 수 있고, 환자 ID 검색은 원본이 있는 브라우저에서만 맞습니다). 시리즈 수는 서버 목록과 이 브라우저 원본 시리즈의 합집합(UID 기준)입니다.
- **영상 작업 화면**: Cornerstone3D StackViewport 로 실제 픽셀 렌더링(JPEG-LS 등 WASM 코덱은 Worker 에서 디코딩), 실제 영상 썸네일, 휠·슬라이더·버튼 이동(단일 영상은 탐색 숨김), 이동·확대·밝기대비(W/L)·반전·90° 회전·화면 맞춤·초기화.
- **측정·주석**: 공식 Cornerstone Tools 의 길이·각도·타원 ROI·닫힌 윤곽(PlanarFreehandROI)·화살표 메모. 핸들 이동, 좌표 직접 편집, 표시·숨김, 삭제, 실행 취소·다시 실행.
- **측정 단위**: 이미지 좌표 × 해당 프레임 PixelSpacing[행, 열]. 보정이 없거나 0·음수·NaN 이면 px/px² 로 표시하고 안내. 비등방 간격의 각도·회전 타원도 물리 좌표로 계산.
- **라벨·대상**: 장기/병변 기본 라벨과 사용자 정의 라벨(이름·색상·분류) 추가·수정, 같은 병변을 여러 영상에서 하나의 대상으로 묶기.
- **저장·복원**: 원본과 결과를 별도 저장, 자동 저장(직렬·최신 revision 우선)과 수동 저장, 저장 실패 표시, 저장 전 이탈 시 저장 시도·실패 확인, 새로고침 후 같은 영상(SOP UID + frame)에 복원, 결과 선택 시 해당 시리즈·프레임으로 이동.
- **JSON 내보내기·가져오기**: 버전 스키마(`schemaVersion: 1`). 다른 검사·없는 시리즈/영상·프레임 범위·FrameOfReferenceUID·world 좌표 불일치·좌표계(canvas 등)·숫자·포인트 수·중복 ID·없는 라벨/대상 참조를 검증하고 하나라도 문제가 있으면 전체 거부.

## JSON 결과 파일

- 원본 픽셀 데이터를 **포함하지 않습니다**(`containsPixelData: false`).
- 다시 연결하려면 같은 StudyInstanceUID·SeriesInstanceUID·SOPInstanceUID(멀티프레임은 frameNumber)를 가진 원본 DICOM 을 먼저 이 브라우저에 가져와야 합니다.
- 좌표: `imagePoints` 는 픽셀 index `[열, 행]`(첫 픽셀 중심 = (0,0)), `worldPoints` 는 DICOM 환자 좌표(mm, 영상 기하가 유효할 때만). 측정값(`derivedMeasurement`)은 참고값이며 가져올 때 다시 계산합니다.

## 로그인과 계정별 저장

- 목록·뷰어는 서버에서 세션을 Auth 서버로 확인(`getUser`)한 뒤에만 렌더링합니다. 쿠키의 세션 객체만으로 신뢰하지 않으며, 로그인 화면 숨김이 아니라 서버 진입점(Proxy·페이지)에서 막습니다. 인증 관련 응답은 모두 `no-store` 입니다.
- 로그인 후에는 안전한 내부 경로(`next`)로만 돌아갑니다. 외부 URL·`//host`·비정상 인코딩은 무시합니다.
- 이미 열린 화면은 60초마다·창 포커스·탭 재표시·뒤로 가기 복원 때 서버 세션을 다시 확인합니다. 만료·로그아웃·계정 변경이면 **먼저 작업 화면을 닫고**(이동이 취소돼도 이전 계정의 영상·결과는 다시 보이지 않습니다) 계정 저장소의 진행 중 저장이 끝나기를 최대 3초 기다린 뒤 로그인 화면으로 문서 전체를 이동합니다. 저장소 정리가 실패해도 화면은 닫힌 채 이동하며, 이동이 막히면 "로그인 화면으로 이동" 안내가 남습니다. 한 탭에서 로그아웃하면 같은 브라우저의 다른 탭도 같은 방식으로 닫힙니다.
- 세션이 끝날 때 입력 중인 메모는 화면을 닫기 전에 기존 검증·반영 경로를 거칩니다. 모바일 결과 Sheet(Portal) 안의 메모도 같은 계정 저장소에 저장합니다.
- 로그아웃은 이 앱의 세션 쿠키(`sb-dicom-annotator-auth-token` 과 그 조각)만 지웁니다. 같은 호스트의 다른 Supabase 프로젝트 세션은 건드리지 않습니다.
- 로그아웃은 서버 요청 후 문서 전체 이동입니다. 뷰어에서 로그아웃하면 저장하지 않은 편집을 먼저 저장하고, 저장에 실패하면 확인을 받습니다.
- 원본·결과는 **계정 ID 별 IndexedDB**(`dicom-annotator:user:<계정 ID>`)에 저장됩니다. 같은 브라우저에서 다른 계정으로 로그인하면 이전 계정의 검사·결과가 보이지 않고, 원래 계정으로 다시 로그인하면 복원됩니다. 로그아웃해도 계정 저장소를 지우지 않습니다.

### 로그인 도입 이전 자료(익명 저장소)

- 이전 버전은 모든 사용자가 공유하는 `dicom-annotator` 저장소를 썼습니다. 새 버전은 이 저장소를 **열지 않고, 지우지 않고, 로그인한 계정에 자동으로 옮기지 않습니다**(다른 사람의 자료가 섞이는 것을 막기 위해).
- 이전 자료를 계정에서 계속 쓰려면 로그인한 뒤 원본 DICOM 을 다시 가져오고, 보관해 둔 결과 JSON 을 각 검사에서 가져오세요.
- 이전 저장소는 브라우저 사이트 데이터에 남아 있습니다. 필요 없으면 사용자가 브라우저 설정에서 직접 지울 수 있습니다.

## 로컬 저장 특성

- 브라우저 사이트 데이터를 지우거나 저장 용량이 부족하면 원본과 결과가 사라지거나 저장되지 않을 수 있습니다. 저장 실패는 화면에 실패로 표시됩니다.
- 다른 브라우저·기기와 공유되지 않습니다(계정이 같아도 브라우저마다 따로 저장). 필요하면 결과 JSON 을 내보내 보관하세요.

## 검증 범위(합성 데이터)

모든 자동 검증은 **코드로 생성한 합성 DICOM fixture** 로 수행했습니다(실제 환자·임상 데이터 미사용).

- 단일 CT 영상(보정 있음), 다중 파일 CT 축상 스택(섞인 순서), 합성 MR 시상면 스택(사선 법선), Enhanced 멀티프레임(Shared/PerFrame 기하, 위치 반복 시간 프레임), JPEG-LS 무손실(WASM), 보정 없는 영상, 비DICOM, 미지원 transfer syntax(MPEG2), 필수 UID 누락.
- 브라우저: Chromium(Playwright)만 확인했습니다. 다른 브라우저, 실제 장비 데이터, 대용량 시리즈 성능, 실제 OS 폴더 드래그는 미검증입니다.

## 미구현·범위 밖

- 서버 영상 저장·전달, 메타데이터·결과 DB(RLS), 서버 결과 저장은 **다음 단계(후속 이슈)** 입니다. 이번 단계는 로그인·서버 세션 검증과 계정별 브라우저 저장소 경계까지이며, 서버 저장 전환이 끝난 것이 아닙니다.
- 클라우드 Supabase 연결·배포, 비밀번호 재설정·초대 메일, 역할·권한(관리자/검수자), 공동 작업, PACS/DICOMweb 연동, DICOM SR/SEG 내보내기.
- 브러시·지우개·임계값 기반 픽셀/복셀 분할(윤곽 주석은 분할 마스크가 아님), MPR·3D·슬라이스 보간·부피 계산.
- 위 항목의 기본값과 영향은 `docs/decisions.md` 를 참고하세요.

## 구조

FSD 계층(`src/app` 라우트, `views`, `widgets`, `features`, `entities`, `shared`)과 기술 선택은 `docs/architecture.md`, 시나리오·인수 조건은 `docs/scenarios.md` 에 있습니다.
