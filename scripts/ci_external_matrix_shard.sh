#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: ci_external_matrix_shard.sh <target>..." >&2
  exit 2
fi

for target in "$@"; do
  output="/tmp/proped-matrix-${target}"
  result="/tmp/external-run-${target}.json"
  moon run src/cli -- external run "$target" --output "$output" --json > "$result"
  TARGET="$target" RESULT="$result" python3 - <<'PY'
import json
import os
from pathlib import Path

target = os.environ['TARGET']
result = json.loads(Path(os.environ['RESULT']).read_text())
assert result['ok'] is True
assert result['command'] == 'external run'
assert len(result['runs']) == 1
run = result['runs'][0]
assert run['id'] == target
assert run['expectationMet'] is True
assert run['diagnostics'] == 0
for artifact in run['artifacts']:
    assert (Path(run['output']) / artifact).is_file()
PY
done
