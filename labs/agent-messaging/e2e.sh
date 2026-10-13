#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
run="$root/labs/run"
urls=$("$run" agent-messaging urls --json)
app=$(jq -er '.app' <<<"$urls")
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }
wait_health() {
  local attempt
  for attempt in {1..60}; do
    if curl --silent --show-error --fail --max-time 3 "$app/health" -o "$work/health.json" && jq -e '.ready == true' "$work/health.json" >/dev/null; then return 0; fi
    sleep 1
  done
  fail "app readiness exceeded $attempt bounded attempts"
}
wait_task() {
  local id=$1 attempt status
  for attempt in {1..240}; do
    curl --silent --show-error --fail --max-time 5 "$app/api/tasks/$id" -o "$work/task.json"
    status=$(jq -er '.status' "$work/task.json")
    if [[ $status == completed ]]; then return 0; fi
    if [[ $status == failed ]]; then cat "$work/task.json" >&2; fail 'real local fx inference failed'; fi
    sleep 1
  done
  fail "real local workflow exceeded $attempt bounded attempts"
}
wait_agent() {
  local service=$1 attempt
  for attempt in {1..60}; do
    if "$run" agent-messaging exec "$service" node -e "fetch('http://127.0.0.1:3000/health').then(async r=>{const h=await r.json();process.exit(r.ok&&h.ready?0:1)}).catch(()=>process.exit(1))"; then return 0; fi
    sleep 1
  done
  fail "$service replay readiness exceeded $attempt bounded attempts"
}
wait_health

id="messaging-e2e-$(date +%s)-$RANDOM"
payload=$(jq -cn --arg id "$id" '{id:$id,task:"Plan a small community book swap. Give three short practical steps."}')
curl --silent --show-error --fail --max-time 25 -H 'content-type: application/json' -d "$payload" "$app/api/tasks" -o "$work/submission.json"
jq -e --arg id "$id" '.id == $id and (.status == "pending" or .status == "running" or .status == "completed")' "$work/submission.json" >/dev/null
wait_task "$id"
jq -e --arg id "$id" '
  .id == $id and .status == "completed" and (.steps | length == 3) and
  ([.steps[].agentId] == ["planner","reviewer","planner"]) and
  ([.steps[].stage] == ["proposal","critique","synthesis"]) and
  all(.steps[]; .status == "completed" and (.text | length > 0 and length <= 220) and
    (.text | endswith(".") or endswith("!") or endswith("?")) and .inference.usage.output_tokens > 0) and
  (.steps[0].instanceId != .steps[1].instanceId) and
  (.steps[0].instanceId == .steps[2].instanceId)
' "$work/task.json" >/dev/null || {
  cat "$work/task.json" >&2
  fail 'completed inference results or independent agent identities missing'
}
cp "$work/task.json" "$work/completed.json"
pass 'planner proposal → separate reviewer critique → planner synthesis all use real fx local model results'

curl --silent --show-error --fail --max-time 25 -H 'content-type: application/json' -d "$payload" "$app/api/tasks" -o "$work/duplicate.json"
jq -S . "$work/completed.json" >"$work/expected.json"
jq -S . "$work/duplicate.json" >"$work/actual.json"
cmp "$work/expected.json" "$work/actual.json" || fail 'duplicate task ID changed the transcript'
pass 'same task ID returns the original transcript without another inference'

curl --silent --show-error --fail --max-time 5 "$app/api/tasks" -o "$work/snapshot.json"
duplicates=$(jq -er '.duplicates' "$work/snapshot.json")
duplicate_event=$(jq -c '{schema:1,type:"task.submitted",eventId:(.id+":submitted"),taskId:.id,task:.task,at:.submittedAt}' "$work/completed.json")
printf '%s\n' "$duplicate_event" | timeout 20 "$run" agent-messaging rpk topic produce agent-messaging.events.v1 -k "$id" --compression none
duplicate_observed=false
for attempt in {1..30}; do
  curl --silent --show-error --fail --max-time 5 "$app/api/tasks" -o "$work/snapshot.json"
  if jq -e --argjson before "$duplicates" '.duplicates > $before' "$work/snapshot.json" >/dev/null; then duplicate_observed=true; break; fi
  sleep 1
done
[[ $duplicate_observed == true ]] || fail "broker duplicate was not observed after $attempt bounded attempts"
pass 'a real duplicate broker record is consumed and ignored by stable event ID'

conflict=$(jq -cn --arg id "$id" '{id:$id,task:"Different content with the same ID"}')
status=$(curl --silent --show-error --max-time 5 -o "$work/error.json" -w '%{http_code}' -H 'content-type: application/json' -d "$conflict" "$app/api/tasks")
[[ $status == 409 ]] || fail "expected conflicting task ID 409, got $status"
status=$(curl --silent --show-error --max-time 5 -o "$work/error.json" -w '%{http_code}' -H 'content-type: application/json' -d '{"id":"short","task":""}' "$app/api/tasks")
[[ $status == 400 ]] || fail "expected invalid task 400, got $status"
status=$(curl --silent --show-error --max-time 5 -o "$work/error.json" -w '%{http_code}' -H 'content-type: application/json' -H 'Origin: https://untrusted.example' -d "$payload" "$app/api/tasks")
[[ $status == 403 ]] || fail "expected foreign-origin rejection 403, got $status"
pass 'conflicting ID, invalid task and foreign-origin mutations are rejected'

for service in planner reviewer; do
  "$run" agent-messaging restart "$service"
  wait_agent "$service"
  "$run" agent-messaging exec "$service" node -e "fetch('http://127.0.0.1:3000/metrics').then(async r=>{if(!r.ok)throw Error(r.status);process.stdout.write(await r.text())}).catch(e=>{console.error(e);process.exit(1)})" >"$work/$service.metrics"
  if ! grep -Eq '^agent_messaging_inference_completed_total\{role="(planner|reviewer)"\} 0$' "$work/$service.metrics"; then fail "$service reran inference while replaying"; fi
  pass "$service rebuilt from replay with zero new inference effects"
done
"$run" agent-messaging restart app
wait_health
curl --silent --show-error --fail --max-time 5 "$app/api/tasks/$id" -o "$work/replayed.json"
jq -S . "$work/replayed.json" >"$work/actual.json"
cmp "$work/expected.json" "$work/actual.json" || fail 'restart changed task IDs, results or agent instances'
curl --silent --show-error --fail --max-time 5 "$app/metrics" -o "$work/app.metrics"
grep -q '^agent_messaging_ready{role="app"} 1$' "$work/app.metrics" || fail 'readiness metric missing'
pass 'app replay preserves the complete transcript and IDs; health and metrics are usable'
printf 'Completed task ID: %s\n' "$id"
