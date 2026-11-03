# 프로젝트 작업 지침

@/Users/jinyu/.codex/RTK.md

- 런타임과 개발 도구 버전은 `mise`로 관리한다. 필요한 버전을 선택하면 프로젝트의 `mise.toml`에 명시한다.
- 패키지 설치, 의존성 관리, 스크립트 실행은 `pnpm`을 사용한다. npm, yarn, bun을 패키지 관리자로 사용하지 않는다.
- 의존성 잠금 파일은 `pnpm-lock.yaml`을 사용한다.
- 버전이나 패키지 설치는 실제 작업에 필요할 때 진행한다.

## 테스트 우선 개발

- 모든 기능 구현과 버그 수정에 앞서 사용자 시나리오, 인수 조건, 정상·경계·실패 사례를 정리하고 해당 테스트를 먼저 작성한다.
- 테스트가 의도한 이유로 실패하는 것을 확인한 뒤 최소 구현으로 통과시키고, 리팩터링 후 다시 검증한다(Red → Green → Refactor). 구현에 맞춰 기대값을 약화하거나 테스트를 삭제하지 않는다.
- 도메인 로직은 단위 테스트, 저장소·뷰어 연결은 통합 테스트, 핵심 사용자 흐름은 브라우저 E2E로 검증한다. 구현 세부 사항을 그대로 복제하는 테스트는 피한다.
- 도구 초기 설정 등 실행 기반이 필요한 경우 검증 시나리오와 명령을 먼저 정의하고, 실행 환경을 구성한 뒤 기능 구현 전에 실패 테스트를 확인한다.

## 구조와 관심사 분리

- FSD 원칙을 참고해 앱 조립, 페이지, 화면 블록, 사용자 기능, 도메인 엔티티, 공통 기반을 분리한다. 필요에 따라 `app`, `pages`, `widgets`, `features`, `entities`, `shared` 계층을 사용하되 Next.js 라우트는 App Router의 `app`에서 관리한다. FSD 페이지 계층이 Next.js Pages Router로 인식되지 않도록 배치한다.
- 상위 계층은 하위 계층에 의존하도록 하고, 순환 의존성과 같은 계층의 슬라이스 간 직접 참조를 피한다. 슬라이스는 공개 진입점으로 노출한다.
- UI, 도메인 모델·타입, 상태·비즈니스 로직, API·저장소 어댑터를 분리한다. 타입과 모델은 해당 도메인이나 기능이 소유하며 전역 타입 파일에 몰아넣지 않는다.
- 상태·이벤트·수명주기 및 재사용 가능한 React 로직은 책임별 커스텀 hook으로 분리한다. 순수 계산과 도메인 규칙은 React에 의존하지 않는 함수·모델로 유지한다.
- Cornerstone 엔진과 브라우저 저장소의 가변 상태는 React 화면 상태와 분리하고 초기화·정리 책임을 명확히 한다.

## 디자인 컴포넌트와 Storybook

- 디자인 컴포넌트는 `shadcn/ui`를 기반으로 확장한다. 공통 primitive와 제품 도메인에 특화된 조합 컴포넌트의 책임을 분리한다.
- 실제 화면에서 한 번 이상 사용되는 디자인 컴포넌트는 Storybook에 등록하고, 공통 컴포넌트 라이브러리로 사용할 수 있게 공개 API와 타입을 제공한다. 일회성 화면 조립 자체를 공통 계층으로 옮길 필요는 없다.
- Stories에는 적용 가능한 기본·변형·비활성·로딩·오류·빈 상태와 주요 상호작용을 포함한다. 접근성, 키보드 조작, 포커스 동작을 검증한다.
- 컴포넌트 테스트와 필요한 Story 시나리오를 먼저 작성한 뒤 구현한다. Stories는 실제 컴포넌트를 사용하며 도메인 테스트나 E2E를 대체하지 않는다.

## 품질 검사와 검수

- lint와 format 규칙을 프로젝트 설정으로 일관되게 적용한다. 규칙 비활성화, 광범위한 예외, 타입 검사 우회로 검사를 통과시키지 않는다.
- pnpm 스크립트로 테스트, 타입 검사, lint, format 검사, 프로덕션 빌드, Storybook 빌드를 실행할 수 있게 구성한다.
- 구현 담당 Opus 에이전트는 작업 단위별 시나리오, 실패 테스트 확인 결과, 변경 내용, 통과한 검사와 미검증 항목을 이 세션의 Codex에 보고한다.
- 이 세션의 Codex가 코드 구조·타입·hook·컴포넌트·Stories·테스트를 검토하고 필요한 검사를 직접 실행해 검수한다. 발견 사항은 구현 담당에게 수정 지시하고 재검수한다.
- 테스트, 타입 검사, lint, format 검사, 프로덕션 빌드, Storybook 빌드와 관련 브라우저 검증을 통과하고 Codex 검수가 끝나야 완료로 보고한다. 실행하지 못한 검사는 통과로 표시하지 않는다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
