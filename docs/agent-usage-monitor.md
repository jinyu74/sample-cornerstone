# 로컬 에이전트 사용량 감시

## 동작

- `scripts/watch-agent-budgets.ts`가 모델 생성 요청 없이 30초마다 사용량을 확인한다.
- Codex는 공식 app-server `account/rateLimits/read`, Claude는 현재 Herdr 에이전트의 `/usage` UI를 사용한다. 인증 토큰을 읽거나 로그에 남기지 않는다.
- 사용량이 **90% 초과**(잔여량 10% 미만)일 때 공개 진행 메시지와 상태를 체크포인트에 보존하고 해당 에이전트를 중단한다. 정확히 90%일 때는 중단하지 않는다.
- 재설정 시각이 지난 후 실제 새 조회에서도 사용량이 회복된 경우에만 같은 세션에 재개 지시를 보낸다. 재설정 시각을 알 수 없으면 추측해서 자동 재개하지 않는다.
- Claude를 재개할 때 Codex가 대기 중이고 사용량에도 여유가 있으면 Codex 검수 세션도 깨운다. Codex도 quota 때문에 중단됐다면 자신의 재설정과 회복을 기다린다.
- 승인·질문 UI, 세션 ID 변경, 사용자가 입력 중인 초안에는 자동 응답하지 않는다. 대화 clear, 크레딧 구매, 모델 변경은 하지 않는다.

## 범위와 조건

- 이 프로젝트의 Codex thread와 `opus-worker` 세션에만 연결한다. 연결 ID는 스크립트와 `docs/agent-handoff.md`에 기록돼 있다.
- 컴퓨터가 켜져 있고 Herdr 및 두 CLI가 계속 실행 중이어야 한다. 컴퓨터/CLI를 다시 시작하면 감시기도 다시 실행하고 세션 ID를 확인해야 한다.
- 조회 오류나 입력 초안 때문에 조작을 보류한 경우 `state.json`의 error와 로그를 확인한다. 자동 재개는 이 조건들이 해소돼야 가능하다.
- 재개 메모: `docs/agent-handoff.md`. 동적 체크포인트와 감시 상태는 `.local/agent-budgets/`에 보존하며 git에서 제외한다.

## 실행과 확인

```bash
# 사용량 조회만 한다(중단·재개 없음).
mise exec -- pnpm exec tsx scripts/watch-agent-budgets.ts --once

# 계속 감시한다. 중복 실행은 PID 검사로 거부한다.
mise exec -- pnpm exec tsx scripts/watch-agent-budgets.ts --watch

# 현재 감시기 PID·상태·이벤트 로그
cat .local/agent-budgets/monitor.pid
cat .local/agent-budgets/state.json
tail -20 .local/agent-budgets/monitor.log
```

중단하려면 PID가 실제 `watch-agent-budgets.ts` 프로세스인지 확인한 뒤 그 PID에 SIGTERM을 보낸다. 에이전트나 Herdr 서버 자체를 종료하지 않는다.

## 검증

- 순수 정책 테스트: `tests/integration/agent-budget-policy.test.ts`. 구현 전 Red를 확인했으며 한도 경계값, 한국시간 재설정 파싱, reset 전 재개 금지, 회복 확인, 알 수 없는 시각, 검수자 깨우기 조건을 검증한다.
- 양쪽 실제 조회와 백그라운드 실행을 확인했다. 첫 실제 감시에서 Claude 91%를 감지해 중단하고 체크포인트를 저장했다.
- 자연 재설정 후 재개는 아직 시각이 도래하지 않았으므로 실제 재개 완료로 보고하지 않는다. 감시기가 재조회 후 재개하고 이벤트 로그에 기록한다.
