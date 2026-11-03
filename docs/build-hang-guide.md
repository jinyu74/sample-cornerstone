# 프로덕션 빌드가 멈출 때 (Next 16 Turbopack)

## 증상

- `pnpm build` 출력이 `Creating an optimized production build ...` 에서 더 진행되지 않는다(수 분~수십 분).
- `next-build` 프로세스와 `pool_entry-[turbopack-node]_transforms_postcss…` worker 가 **CPU 0%** 로 남아 있다.
- `pnpm dev`(개발 서버)와 E2E dev 모드는 정상 동작한다.

## 확인된 원인 (2026-11-02)

`@cornerstonejs/tools@5.14.0` 의 compute worker 가 **자기 자신을 다시 import 하는 그래프**를 만든다.

```
workers/computeWorker.js
  → utilities/segmentation/index.js → getStatistics.js
    → utilities/registerComputeWorker.js
      → new Worker(new URL('../workers/computeWorker.js', import.meta.url))   ← 다시 자기 자신
```

Turbopack 프로덕션 빌드는 `new Worker(new URL(...))` 를 worker 진입점으로 따라가 번들링하는데, 이 순환에서 부모(Rust) 와 worker 가 서로를 기다리며 멈춘다. dev 는 worker 를 요청할 때만 컴파일하므로 드러나지 않는다.

### 진단 근거

| 실험                                                           | 결과                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `sample <next-build PID>` / `sample <postcss worker PID>`      | 모든 스레드가 `__psynch_cvwait`·`kevent` 대기(작업 중 아님 → 교착)     |
| `.next` 삭제 후 재빌드                                         | 계속 멈춤 → 캐시 손상 아님                                             |
| Tailwind 탐색 범위를 `src` 로 제한                             | 계속 멈춤 → 탐색 범위 단독 원인 아님(범위 제한은 올바른 설정이라 유지) |
| `@cornerstonejs/tools` 동적 import 를 잠시 제거(A/B)           | 컴파일·라우트 생성 완료                                                |
| `registerComputeWorker` 의 worker 진입점만 끊는 pnpm 패치 적용 | 빌드 15초에 완료                                                       |

## 적용한 해결

- `patches/@cornerstonejs__tools@5.14.0.patch` (pnpm `patchedDependencies`, `pnpm-workspace.yaml`):
  `registerComputeWorker` 가 worker 를 만들지 않고, 호출되면 명시적 오류를 던지게 한다.
- 영향: segmentation 통계용 compute worker 기능만 쓸 수 없다. 이 앱은 분할(segmentation)을 구현하지 않으며 측정은 자체 계산하므로 사용 기능에는 영향이 없다. 분할 기능을 도입하면(사용자 결정 2) 이 패치를 다시 검토해야 한다.
- `@cornerstonejs/tools` 버전을 올리면 패치가 적용되지 않을 수 있다. 업그레이드 시 순환이 고쳐졌는지 확인하고 패치를 제거·갱신한다.

## 다시 멈출 때 점검 순서

1. 멈춘 위치 확인: 출력 마지막 줄이 `Creating an optimized production build` 인지, TypeScript·정적 생성 단계인지.
2. 프로세스 상태: `ps -eo pid,ppid,pcpu,etime,command | grep -E "next-build|turbopack-node"`.
   - CPU 가 높으면 실제 작업(대규모 번들·타입 검사) → 기다리거나 범위를 줄인다.
   - CPU 0% 로 오래 유지되면 교착 → 3단계.
3. 스택 확인: `sample <PID> 3 -file /tmp/next-build-sample.txt` 로 부모·worker 가 모두 대기 중인지 본다.
4. 다른 빌드·dev 가 같은 `.next` 를 쓰는지 확인(`.next/lock`, `ps`). 동시에 실행했다면 하나만 남기고 다시 빌드한다.
5. 캐시 배제: `rm -rf .next` 후 재빌드.
6. 최근 추가한 의존성을 A/B 로 확인: 의심 import 를 잠시 제거해 `pnpm exec next build --experimental-build-mode=compile` 가 끝나는지 본다(확인 후 즉시 복원).
7. worker·WASM 을 쓰는 패키지면 `new Worker(new URL(...))` 진입점이 자기 자신이나 상위 모듈을 다시 import 하는지 찾는다: `grep -rn "new Worker(" node_modules/<패키지>/dist`.
8. 원인 패키지는 `pnpm patch <패키지>@<버전>` → 수정 → `pnpm patch-commit` 으로 고치고 이 문서와 `docs/decisions.md` 에 근거를 남긴다. node_modules 파일을 직접 수정하지 않는다(pnpm 스토어 원본 손상 위험).

## 함께 지킬 운영 규칙

- Next 빌드·`next start`·E2E(prod) 는 같은 `.next` 를 쓰므로 동시에 실행하지 않는다. 사용자 미리보기(`next start`)를 띄운 상태에서 prod E2E 를 돌릴 때는 `E2E_SKIP_BUILD=1` 로 기존 빌드를 재사용한다.
- 이 프로젝트는 git 저장소가 아니므로 Tailwind 자동 탐색이 `.gitignore` 를 적용하지 못한다. `globals.css` 의 `source("../..")` 로 `src` 만 탐색한다.
