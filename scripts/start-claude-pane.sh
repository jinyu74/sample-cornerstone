#!/bin/sh
set -eu

if [ "${HERDR_ENV:-}" != "1" ]; then
  printf '%s\n' 'herdr 내부의 현재 프로젝트 패널에서 실행하세요.' >&2
  exit 1
fi

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

# CLI 구문은 설치된 herdr --skill과 herdr --help를 기준으로 한다.
# Claude의 로그인/신뢰/권한 질문에는 사용자 또는 승인된 handler가 응답한다.
split_result=$(herdr pane split --current --direction right --cwd "$project_dir" --no-focus)
printf '%s\n' "$split_result"
pane_id=$(printf '%s' "$split_result" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
printf 'Claude 대상 패널: %s\n' "$pane_id"
herdr agent start dicom-opus --kind claude --pane "$pane_id" -- --model claude-opus-5-5
herdr agent prompt dicom-opus 'docs/claude-dicom-task.md를 읽고 그 작업 지시서를 수행하세요. 모델이 Claude Opus 5.5인지 확인하고, 불일치하면 구현을 시작하지 말고 알려주세요. 사용자 결정이 필요한 사항은 권장안과 함께 알려주세요.'
herdr agent get dicom-opus
