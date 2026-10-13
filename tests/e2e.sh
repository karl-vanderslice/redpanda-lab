#!/usr/bin/env bash
# End-to-end check: real produce/key routing/pause/lag/resume/failover, telemetry, Console, down, no leftovers.
# Writes a replayable report outside the checkout. Destroys this lab's data (not other Podman objects).
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
if [[ ${REDPANDA_LAB_SHELL:-0} != 1 ]]; then
  exec nix develop "path:$root" --no-update-lock-file -c env REDPANDA_LAB_SHELL=1 bash "$root/tests/e2e.sh" "$@"
fi
run_id="$(date +%Y%m%dT%H%M%S)-$$"
report_dir="${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/e2e/$run_id"
mkdir -p "$report_dir"
report="$report_dir/report.md"
log="$report_dir/lab.log"
results=()
pass() { results+=("PASS $1"); echo "PASS $1"; }
fail() { results+=("FAIL $1"); echo "FAIL $1" >&2; finish 1; }
finish() {
  local status=$1
  {
    echo "# Redpanda lab E2E $run_id"
    echo; echo "- Source: $root (git $(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo 'no commit')$(git -C "$root" diff --quiet HEAD 2>/dev/null || echo ', with uncommitted changes'))"
    echo "- Tools: $(podman --version), $(podman-compose version 2>/dev/null | grep -i podman-compose | head -n1), node $(node --version)"
    echo "- Source snapshot hashes:"
    sha256sum "$root/flake.lock" "$root/app/package.json" "$root/app/package-lock.json" "$root/app/server.js" "$root/app/Containerfile" "$root/lab" "$root/tests/e2e.sh"
    echo "- Replay: tests/e2e.sh (runs ./lab up, HTTP workflow checks, ./lab down)"
    echo "- Exit status: $status"
    echo; echo "## Results"; printf -- '- %s\n' "${results[@]}"
    echo; echo "Lab output: lab.log"
  } > "$report"
  if (( status != 0 )); then
    "$root/lab" logs app >> "$log" 2>&1 || true
    "$root/lab" down >> "$log" 2>&1 || true
  fi
  echo "Report: $report"
  exit "$status"
}
api() { curl -fsS --max-time 15 "$@"; }
post() { curl -sS --max-time 45 -o "$report_dir/body.json" -w '%{http_code}' -H 'content-type: application/json' -d "$2" "$base_url$1"; }
stats() { api "$base_url/api/stats"; }
wait_for() { # description, seconds, jq expression on stats
  local deadline=$((SECONDS + $2))
  until stats | jq -e "$3" >/dev/null; do
    (( SECONDS < deadline )) || fail "$1 (last: $(stats | jq -c '{produced,consumed,lag,paused,lastError}'))"
    sleep 1
  done
  pass "$1"
}

"$root/lab" up > "$log" 2>&1 || fail './lab up reached readiness'
pass './lab up reached readiness'
base_url='' prom_url='' console_url='' grafana_url=''
while IFS= read -r line; do
  case "$line" in
    'Stream app:'*) base_url=${line##* } ;;
    'Prometheus:'*) prom_url=${line##* } ;;
    'Redpanda Console:'*) console_url=${line##* } ;;
    'Grafana:'*) grafana_url=${line##* } ;;
  esac
done < <("$root/lab" urls)
[[ -n $base_url && -n $prom_url && -n $console_url && -n $grafana_url ]] || fail 'all service URLs were discovered'
identity=$(printf '%s' "$root" | sha256sum)
project="rp-lab-${identity:0:10}"

"$root/lab" rpk cluster health | grep -q 'Healthy: *true' && pass 'rpk reports 3-node cluster healthy' || fail 'rpk reports 3-node cluster healthy'
"$root/lab" rpk topic describe lab.events -p | awk 'NR>1 && $4=="[0" && $6=="2]"{n++} END{exit n!=6}' && pass 'lab.events has 6 partitions replicated on brokers 0,1,2' || fail 'lab.events has 6 partitions replicated on brokers 0,1,2'

[[ $(post /api/produce '{"key":"k","kind":"order.created","payload":[1]}') == 400 ]] && pass 'non-object payload rejected with 400' || fail 'non-object payload rejected with 400'
[[ $(post /api/generator '{"rate":101,"duration":5}') == 400 ]] && pass 'generator rate above 100 rejected' || fail 'generator rate above 100 rejected'
before=$(stats | jq .produced)
[[ $(post /api/produce '{"key":"order-1","kind":"order.created","payload":{"total":12.5}}') == 201 ]] || fail 'manual produce acknowledged'
id=$(jq -r .id "$report_dir/body.json")
pass "manual produce acknowledged ($(jq -c . "$report_dir/body.json"))"
wait_for 'manual event consumed by shared consumer' 20 ".recent | any(.id == \"$id\")"
partition=$(jq -r .partition "$report_dir/body.json")
[[ $(post /api/produce '{"key":"order-1","kind":"order.created","payload":{"total":25}}') == 201 ]] || fail 'second same-key produce acknowledged'
[[ $(jq -r .partition "$report_dir/body.json") == "$partition" ]] && pass 'same key maps to the same partition' || fail 'same key maps to the same partition'
second_id=$(jq -r .id "$report_dir/body.json")
wait_for 'second same-key record consumed independently' 20 ".recent | any(.id == \"$second_id\")"

[[ $(post /api/consumer '{"paused":true}') == 200 ]] && pass 'consumer paused' || fail 'consumer paused'
[[ $(post /api/generator '{"rate":50,"duration":4}') == 202 ]] && pass 'generator started 50/s for 4s' || fail 'generator started'
[[ $(post /api/generator '{"rate":5,"duration":5}') == 409 ]] && pass 'second concurrent generator rejected with 409' || fail 'second concurrent generator rejected with 409'
wait_for 'generator finished on its own' 15 '.generator.running == false'
wait_for 'committed lag grows while paused' 15 ".lag > 100 and .paused and .produced >= ($before + 150)"
consumed_paused=$(stats | jq .consumed); sleep 3
[[ $(stats | jq .consumed) == "$consumed_paused" ]] && pass 'no consumption while paused' || fail 'no consumption while paused'
[[ $(post /api/consumer '{"paused":false}') == 200 ]] && pass 'consumer resumed' || fail 'consumer resumed'
wait_for 'backlog drained and committed (lag 0, consumed == produced)' 30 '.lag == 0 and .consumed == .produced and .lastError == null'

sleep 6 # one Prometheus scrape interval plus margin
for q in 'sum(up{job="redpanda"}) == 3' 'up{job="lab-app"} == 1' 'sum(lab_produced_total) > 150' 'lab_delivery_seconds_count > 0' 'sum(rate(redpanda_kafka_request_bytes_total{redpanda_topic="lab.events",redpanda_request="produce"}[1m])) > 0'; do
  api "$prom_url/api/v1/query" --data-urlencode "query=$q" | jq -e '.data.result | length > 0' >/dev/null && pass "Prometheus: $q" || fail "Prometheus: $q"
done
api "$prom_url/api/v1/rules" | jq -e '[.data.groups[].rules[] | select(.health == "ok")] | length == 3' >/dev/null && pass 'Prometheus loaded 3 healthy alert rules' || fail 'Prometheus loaded 3 healthy alert rules'
api "${grafana_url%/d/*}/api/dashboards/uid/redpanda-lab" | jq -e '.dashboard.panels | length > 10' >/dev/null && pass 'Grafana provisioned dashboard redpanda-lab' || fail 'Grafana provisioned dashboard redpanda-lab'
api "$console_url/api/consumer-groups" | jq -e '.consumerGroups | any(.groupId == "lab-explorer")' >/dev/null && pass 'Console sees consumer group lab-explorer' || fail 'Console sees consumer group lab-explorer'
[[ $(post /api/consumer '{"paused":true}') == 200 ]] || fail 'consumer paused before broker failure'
wait_for 'pre-failover offsets committed' 15 '.lag == 0'
consumed_paused=$(stats | jq .consumed)
podman kill "${project}_redpanda-1_1" >> "$log" 2>&1 || fail 'broker 1 stopped for failover'
before_failover=$(stats | jq .produced)
for n in {1..24}; do
  [[ $(post /api/produce "{\"key\":\"failover-$n\",\"kind\":\"sensor.reading\",\"payload\":{\"sensor\":\"failover\",\"celsius\":20}}") == 201 ]] || fail "all-replica production with broker down (key $n)"
done
pass '24 distinct keys acknowledged with one broker down'
wait_for 'broker-stored lag accumulates while paused through failover' 30 ".lag >= 24 and .paused and .produced == ($before_failover + 24)"
[[ $(stats | jq .consumed) == "$consumed_paused" ]] && pass 'consumer stays paused through broker failover' || fail 'consumer stays paused through broker failover'
[[ $(post /api/consumer '{"paused":false}') == 200 ]] || fail 'consumer resumed after broker failover'
wait_for 'consumer drains and commits after broker failover' 60 '.lag == 0 and .consumed >= .produced and .lastError == null'
podman start "${project}_redpanda-1_1" >> "$log" 2>&1 || fail 'failed broker restarted'
health_deadline=$((SECONDS + 60))
until "$root/lab" rpk cluster health | grep -q 'Healthy: *true'; do
  (( SECONDS < health_deadline )) || fail 'cluster healthy after failed broker restart'
  sleep 2
done
pass 'cluster healthy after failed broker restart'

"$root/lab" down >> "$log" 2>&1 || fail './lab down succeeded'
[[ -n $(awk '/^Removed /{print $2}' "$log" | tail -n1) ]] || fail 'runtime disposal reported'
[[ -n $project && -z $(podman ps -a --filter "name=^${project}_" --format '{{.Names}}') ]] && pass 'no lab containers remain' || fail 'no lab containers remain'
[[ -z $(podman volume ls --format '{{.Name}}' | grep "^${project}_" || true) ]] && pass 'no lab volumes remain' || fail 'no lab volumes remain'
[[ -z $(podman network ls --format '{{.Name}}' | grep "^${project}_" || true) ]] && pass 'no lab network remains' || fail 'no lab network remains'
[[ ! -f ${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/${identity:0:10}/port-base ]] && pass 'saved port state removed' || fail 'saved port state removed'
[[ -z $(podman image ls --filter "reference=localhost/$project-app:1" --format '{{.ID}}') ]] && pass 'optional app image removed' || fail 'optional app image removed (runtime disposal already completed)'
if curl -s --max-time 2 "$base_url/api/stats" >/dev/null; then fail 'app loopback port released'; else pass 'app loopback port released'; fi
finish 0
