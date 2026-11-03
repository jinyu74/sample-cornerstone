# 구조와 기술 선택

## 도구·버전 (mise / pnpm)

| 구분          | 선택                                                   | 이유                                                                               |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Node          | 24.22.2 (`mise.toml`)                                  | LTS. Next 16(`>=20.9`), Vitest 5(`^22.12 \|\| ^24`) 요구 충족                      |
| pnpm          | 12.17.0 (`mise.toml`, `packageManager`)                | 프로젝트 정책. 잠금 파일 `pnpm-lock.yaml`                                          |
| Next.js       | 16.4.3 (App Router)                                    | 최신 안정판                                                                        |
| React         | 19.3.1                                                 | Next 16 peer                                                                       |
| TypeScript    | 6.0.3                                                  | 최신 7.0.x 는 `typescript-eslint`(peer `<6.1`)가 미지원                            |
| Cornerstone3D | core·tools·dicom-image-loader·metadata 5.14.0          | 네 패키지가 동일 버전을 peer 로 요구                                               |
| dicom-parser  | 1.8.21                                                 | dicom-image-loader 5.14.0 peer 고정값                                              |
| ESLint        | 9.39.5                                                 | `eslint-config-next` 가 사용하는 react/import/jsx-a11y 플러그인이 ESLint 10 미지원 |
| Vitest        | 5.0.5 (+ browser-playwright)                           | 단위·통합(jsdom), Storybook 브라우저 테스트                                        |
| Playwright    | 1.64.1                                                 | 프로덕션 빌드 E2E                                                                  |
| Storybook     | 10.6.5 (`@storybook/nextjs-vite`, a11y, vitest 애드온) | 컴포넌트 라이브러리·상호작용·접근성 검사                                           |
| Tailwind CSS  | 4.3.3                                                  | shadcn/ui 4 기본                                                                   |
| shadcn/ui     | CLI 4.23.0, `base-nova` 스타일(Base UI)                | 공통 primitive                                                                     |

빌드 스크립트 허용: `esbuild`(바이너리 설치) 허용, `core-js-pure`(후원 배너만 출력) 거부. `pnpm-workspace.yaml` 의 `allowBuilds` 참고.

## FSD 계층

```
src/
  app/        Next.js App Router 라우트 + FSD app 계층(전역 스타일, provider). 라우트 파일은 views 를 조립만 한다.
  views/      FSD pages 계층. Pages Router 와의 충돌을 피하려고 views 라는 이름을 쓴다.
  widgets/    화면 블록 (검사 테이블, 시리즈 패널, 뷰포트, 결과 패널, 도구 모음)
  features/   사용자 기능 (파일 가져오기, 주석 작성, 저장, 결과 내보내기/가져오기, 라벨 관리, 검사 필터)
  entities/   도메인 엔티티 (dicom-study: 검사·시리즈·영상·프레임, annotation: 주석·측정, label: 라벨·대상)
  shared/     공통 기반 (ui: shadcn primitive, lib: 기하·유틸, storage: IndexedDB 기반, viewer: Cornerstone 초기화)
```

- 의존 방향: `app → views → widgets → features → entities → shared`. ESLint `boundaries/dependencies` 로 강제한다.
- 같은 계층의 다른 슬라이스는 직접 참조하지 않는다. 슬라이스 외부에서는 `@/<layer>/<slice>` 공개 진입점(`index.ts`)만 import 한다(`no-restricted-imports`).
- 슬라이스 내부 세그먼트: `model/`(타입·순수 도메인 함수), `api/`(저장소·엔진 어댑터), `lib/`(슬라이스 전용 헬퍼), `ui/`(컴포넌트), hook 은 책임별로 `model/use-*.ts`.
- 타입은 소유 슬라이스의 `model/types.ts` 에 둔다. 전역 types 파일을 만들지 않는다.
- Cornerstone 엔진(렌더링 엔진, 도구 그룹, annotation state)과 IndexedDB 연결은 React 상태 밖의 어댑터가 소유한다. React 는 hook 을 통해 구독·명령만 하고, 마운트 해제 시 hook 이 정리 책임을 진다.

## 테스트 계층

| 대상                    | 도구                                                              | 위치                                        |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| 도메인 순수 로직        | Vitest `unit` 프로젝트                                            | `src/**/model/*.test.ts`                    |
| 저장소·파싱 어댑터 통합 | Vitest `unit` 프로젝트 + fake-indexeddb, 합성 DICOM fixture       | `src/**/api/*.test.ts`, `tests/integration` |
| 컴포넌트                | Testing Library(jsdom) + Storybook play 함수(실제 chromium, a11y) | `*.test.tsx`, `*.stories.tsx`               |
| 핵심 사용자 흐름        | Playwright, 프로덕션 빌드                                         | `tests/e2e`                                 |

## pnpm 스크립트

`typecheck`, `lint`, `format:check`, `test`(unit), `test:stories`(Storybook 브라우저), `test:e2e`, `build`, `build-storybook`, `check`(전체).
