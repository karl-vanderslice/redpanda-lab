#!/usr/bin/env bash
set -euo pipefail

# The parent runner starts/stops the isolated lab. This script exercises only its public API.
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
urls=$("$root/labs/run" agent-chat urls --json)
app=$(jq -er '.app' <<<"$urls")
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }
get() { curl --fail-with-body --silent --show-error --max-time 15 "$app$1"; }
post() { curl --fail-with-body --silent --show-error --max-time 20 -H 'content-type: application/json' --data "$2" "$app$1"; }
new_id() { printf 'e2e-%s-%s-%s' "$(date +%s%N)" "$RANDOM" "$RANDOM"; }
wait_ready() {
  local deadline=$((SECONDS + 120))
  while ((SECONDS < deadline)); do
    if curl --fail --silent --show-error --max-time 3 "$app/health" | jq -e '.ready == true' >/dev/null; then return; fi
    sleep 1
  done
  fail 'app did not become ready in 120 seconds'
}
wait_completed() {
  local id=$1 deadline=$((SECONDS + 150)) value status
  while ((SECONDS < deadline)); do
    value=$(get "/api/jobs/$id")
    status=$(jq -r '.status' <<<"$value")
    if [[ $status == completed ]]; then printf '%s\n' "$value"; return; fi
    if [[ $status == failed || $status == cancelled ]]; then fail "job $id terminated unexpectedly: $value"; fi
    sleep 1
  done
  fail "job $id did not complete in 150 seconds"
}
wait_ready
conversation_id=$(new_id)
body=$(jq -nc --arg id "$conversation_id" '{requestId:$id,title:"E2E durable notebook"}')
conversation=$(post '/api/conversations' "$body")
jq -e --arg id "$conversation_id" '.id == $id and .messages == []' <<<"$conversation" >/dev/null || fail 'conversation creation'
post '/api/conversations' "$body" >/dev/null
all=$(get '/api/conversations')
jq -e --arg id "$conversation_id" '[.conversations[] | select(.id == $id)] | length == 1' <<<"$all" >/dev/null || fail 'duplicate conversation command was not deduplicated'
pass 'conversation created in the log; same requestId is idempotent'

immediate_id=$(new_id)
body=$(jq -nc --arg id "$immediate_id" '{requestId:$id,prompt:"Explain why the sky is blue in one short sentence."}')
post "/api/conversations/$conversation_id/prompts" "$body" >/dev/null
immediate=$(wait_completed "$immediate_id")
jq -e '.attempts == 1 and .reply != null and (.reply | length > 0) and .usage.completion_tokens > 0 and .outcomeUnknown == false' <<<"$immediate" >/dev/null || fail "real inference response missing: $immediate"
post "/api/conversations/$conversation_id/prompts" "$body" >/dev/null
history=$(get "/api/conversations/$conversation_id")
jq -e --arg id "$immediate_id" '[.messages[] | select(.jobId == $id)] | length == 2' <<<"$history" >/dev/null || fail 'immediate reply history or request deduplication'
pass "real local model reply: $(jq -r '.reply' <<<"$immediate")"

scheduled_id=$(new_id)
cancelled_id=$(new_id)
due_ms=$(( $(date +%s) * 1000 + 22000 ))
due=$(date -u --date="@$((due_ms / 1000))" '+%Y-%m-%dT%H:%M:%SZ')
cancel_due_ms=$(( $(date +%s) * 1000 + 6000 ))
cancel_due=$(date -u --date="@$((cancel_due_ms / 1000))" '+%Y-%m-%dT%H:%M:%SZ')
body=$(jq -nc --arg id "$scheduled_id" --arg due "$due" '{requestId:$id,prompt:"Name one friendly animal in a short sentence.",dueAt:$due}')
post "/api/conversations/$conversation_id/prompts" "$body" >/dev/null
body=$(jq -nc --arg id "$cancelled_id" --arg due "$cancel_due" '{requestId:$id,prompt:"This pending prompt must be cancelled before inference.",dueAt:$due}')
post "/api/conversations/$conversation_id/prompts" "$body" >/dev/null
sleep 2
scheduled=$(get "/api/jobs/$scheduled_id")
jq -e '.status == "pending" and .attempts == 0 and (.startedAt == null)' <<<"$scheduled" >/dev/null || fail 'future prompt executed early'
pass 'future prompt remains pending before its due instant'

cancel_id=$(new_id)
body=$(jq -nc --arg id "$cancel_id" '{requestId:$id}')
cancelled=$(post "/api/jobs/$cancelled_id/cancel" "$body")
jq -e '.status == "cancelled" and .attempts == 0' <<<"$cancelled" >/dev/null || fail 'pending cancellation'
pass 'pending cancellation is applied through the ordered log'

(( $(date +%s) * 1000 < due_ms )) || fail 'scheduled instant passed before restart scenario'
"$root/labs/run" agent-chat restart app
wait_ready
scheduled=$(wait_completed "$scheduled_id")
jq -e '.attempts == 1 and .reply != null and (.reply | length > 0) and .usage.completion_tokens > 0 and .startedAt >= .dueAt' <<<"$scheduled" >/dev/null || fail "restart/future execution semantics: $scheduled"
pass 'restart before due rebuilds pending work; real inference starts no earlier than due'
while (( $(date +%s) * 1000 <= cancel_due_ms + 1000 )); do sleep 1; done
cancelled=$(get "/api/jobs/$cancelled_id")
jq -e '.status == "cancelled" and .attempts == 0 and .reply == null' <<<"$cancelled" >/dev/null || fail 'cancelled job ran after due'

events=$(get '/api/events')
jq -e --arg id "$scheduled_id" '[.events[] | select(.jobId == $id and .type == "job.started")] | length == 1' <<<"$events" >/dev/null || fail 'scheduled job has multiple start events'
jq -e --arg id "$scheduled_id" '[.events[] | select(.jobId == $id and .type == "job.completed")] | length == 1' <<<"$events" >/dev/null || fail 'scheduled job has multiple completion events'
jq -e --arg id "$cancelled_id" '[.events[] | select(.jobId == $id and .type == "job.started")] | length == 0' <<<"$events" >/dev/null || fail 'cancelled job has a start event'
pass 'event log proves one scheduled attempt and no cancelled inference'

history_before=$(get "/api/conversations/$conversation_id" | jq -c '.messages')
"$root/labs/run" agent-chat restart app
wait_ready
sleep 2
history_after=$(get "/api/conversations/$conversation_id" | jq -c '.messages')
[[ $history_before == "$history_after" ]] || fail 'completed history changed or inference was duplicated after replay'
state=$(get "/api/conversations/$conversation_id")
jq -e --arg id "$scheduled_id" '.jobs[] | select(.id == $id) | .status == "completed" and .attempts == 1' <<<"$state" >/dev/null || fail 'completed scheduled status lost on restart'
pass 'second restart preserves exact conversation history and does not rerun completed jobs'

model_container="$(jq -er '.project' <<<"$urls")_model_1"
resume_model() {
  local status=$1 paused
  paused=$("$REDPANDA_LAB_PODMAN" inspect --format '{{.State.Paused}}' "$model_container") || return 1
  if [[ $paused == true ]]; then
    "$REDPANDA_LAB_PODMAN" unpause "$model_container" >/dev/null || return 1
  fi
  return "$status"
}
trap 'resume_model "$?"' EXIT
"$REDPANDA_LAB_PODMAN" pause "$model_container" >/dev/null
restart_status=0
"$root/labs/run" agent-chat restart app || restart_status=$?
resume_model 0
trap - EXIT
(( restart_status != 0 )) || fail 'restart reported success despite its paused model dependency'
wait_ready
history_after=$(get "/api/conversations/$conversation_id" | jq -c '.messages')
[[ $history_before == "$history_after" ]] || fail 'failed restart changed completed conversation history'
pass 'failed native restart returns nonzero and preserves completed history'
printf 'All agent-chat public API scenarios passed.\n'
