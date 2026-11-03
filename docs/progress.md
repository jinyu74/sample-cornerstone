# 진행 기록 (중단 후 재개용)

마지막 갱신: 3단위 구현 완료, 최종 전체 검사 통과(Codex 최종 검수 대기)

## 완료·승인

- 1단위: 개발 기반, 스택 정렬(S1) — Codex 승인
- 2단위: DICOM 파싱·가져오기·IndexedDB 원본 저장, 검사 목록, StackViewport 렌더링 — Codex 승인

## 3단위(측정·라벨·결과 저장·작업 화면) — 구현 완료, Codex 최종 검수 대기

- 모델: 좌표 변환(image ↔ world), 측정(mm/px, 비등방·회전 타원), 라벨·대상, 작업 문서 reducer(`work/replace` 포함, 좌표 변경 시 오래된 world 좌표 제거), 실행 취소 이력, 작업 상태
- 저장: IndexedDB v2(works) 마이그레이션, stale revision 거부, 검사별 저장 세션·직렬 자동 저장·이탈 시 저장
- JSON: 버전 스키마, 좌표계 식별자 공통 상수, 참조·숫자·포인트·ID·world 정합성 검증
- 엔진: 공식 Cornerstone Tools 5종 + 이동·확대·W/L, 문서 ↔ 엔진 동기화(소유권 정리, HandlesUpdated 반영), 표시 영상 기준 렌더 완료 판정, 썸네일 수명주기
- 화면: 도구 모음·결과 패널·편집기(draft 조율)·라벨 관리·JSON 전송·viewport 조작·모바일 Sheet·숨긴 file input 접근성
- 검사 목록 작업 상태, 합성 MR 스택

## 검사 현황(최종 실행, 로그: scratchpad/evidence/final-*.log)

- typecheck · lint(경고 0) · format:check 통과
- unit/integration 232 통과, Story 92 통과
- build 통과(15초, compute worker 순환 패치 후), build-storybook 통과
- E2E prod 20/20(E2E_SKIP_BUILD=1, 직전 검증 빌드 재사용), E2E dev 20/20, 테스트 밖 오류 없음
- 빌드 정지 원인·대응: docs/build-hang-guide.md
- 사용자 미리보기: http://127.0.0.1:3000 (next start), 합성 샘플: tests/e2e/.fixtures/

## 남은 항목

- Codex 최종 검수와 지적 사항 반영
- 미검증: Chromium 외 브라우저, 실제 장비 데이터, 대용량 성능, 실제 OS 폴더 드래그
