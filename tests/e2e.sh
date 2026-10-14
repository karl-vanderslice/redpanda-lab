#!/usr/bin/env bash
# End-to-end check: real produce/key routing/pause/lag/resume/failover, telemetry, Console, down, no leftovers.
# Writes a replayable report outside the checkout. Destroys this lab's data (not other Podman objects).
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
if [[ ${REDPANDA_LAB_SHELL:-0} != 1 ]]; then
  exec nix develop "path:$root" --no-update-lock-file -c env REDPANDA_LAB_SHELL=1 bash "$root/tests/e2e.sh" "$@"
fi
# shellcheck source-path=SCRIPTDIR
# shellcheck source=../scripts/local-podman
source "$root/scripts/local-podman"
require_local_podman
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
    if revision=$(git -C "$root" rev-parse --short HEAD 2>/dev/null); then
      source_revision="git $revision"
      if ! git -C "$root" diff --quiet HEAD 2>/dev/null; then source_revision+=', with uncommitted changes'; fi
    else
      source_revision='snapshot without Git metadata'
    fi
    echo; echo "- Source: $root ($source_revision)"
    echo "- Tools: $(podman --remote=false --version), $(podman-compose --podman-path="$REDPANDA_LAB_PODMAN" version 2>/dev/null | grep -i podman-compose | head -n1), node $(node --version)"
    echo "- Source snapshot hashes:"
    sha256sum "$root/flake.nix" "$root/flake.lock" "$root/LICENSE" "$root/compose.yml" "$root/.containerignore" "$root/app/package.json" "$root/app/package-lock.json" "$root/app/server.js" "$root/app/Containerfile" "$root/lab" "$root/scripts/local-podman" "$root/tests/e2e.sh"
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

if "$root/lab" rpk cluster health | grep -q 'Healthy: *true'; then
  pass 'rpk reports 3-node cluster healthy'
else
  fail 'rpk reports 3-node cluster healthy'
fi
if "$root/lab" rpk topic describe lab.events -p | awk 'NR>1 && $4=="[0" && $6=="2]"{n++} END{exit n!=6}'; then
  pass 'lab.events has 6 partitions replicated on brokers 0,1,2'
else
  fail 'lab.events has 6 partitions replicated on brokers 0,1,2'
fi

if [[ $(post /api/produce '{"key":"k","kind":"order.created","payload":[1]}') == 400 ]]; then
  pass 'non-object payload rejected with 400'
else
  fail 'non-object payload rejected with 400'
fi
if [[ $(post /api/generator '{"rate":101,"duration":5}') == 400 ]]; then
  pass 'generator rate above 100 rejected'
else
  fail 'generator rate above 100 rejected'
fi
before=$(stats | jq .produced)
[[ $(post /api/produce '{"key":"order-1","kind":"order.created","payload":{"total":12.5}}') == 201 ]] || fail 'manual produce acknowledged'
id=$(jq -r .id "$report_dir/body.json")
pass "manual produce acknowledged ($(jq -c . "$report_dir/body.json"))"
wait_for 'manual event consumed by shared consumer' 20 ".recent | any(.id == \"$id\")"
partition=$(jq -r .partition "$report_dir/body.json")
[[ $(post /api/produce '{"key":"order-1","kind":"order.created","payload":{"total":25}}') == 201 ]] || fail 'second same-key produce acknowledged'
if [[ $(jq -r .partition "$report_dir/body.json") == "$partition" ]]; then
  pass 'same key maps to the same partition'
else
  fail 'same key maps to the same partition'
fi
second_id=$(jq -r .id "$report_dir/body.json")
wait_for 'second same-key record consumed independently' 20 ".recent | any(.id == \"$second_id\")"

if [[ $(post /api/consumer '{"paused":true}') == 200 ]]; then
  pass 'consumer paused'
else
  fail 'consumer paused'
fi
if [[ $(post /api/generator '{"rate":50,"duration":4}') == 202 ]]; then
  pass 'generator started 50/s for 4s'
else
  fail 'generator started'
fi
if [[ $(post /api/generator '{"rate":5,"duration":5}') == 409 ]]; then
  pass 'second concurrent generator rejected with 409'
else
  fail 'second concurrent generator rejected with 409'
fi
wait_for 'generator finished on its own' 15 '.generator.running == false'
wait_for 'committed lag grows while paused' 15 ".lag > 100 and .paused and .produced >= ($before + 150)"
consumed_paused=$(stats | jq .consumed); sleep 3
if [[ $(stats | jq .consumed) == "$consumed_paused" ]]; then
  pass 'no consumption while paused'
else
  fail 'no consumption while paused'
fi
if [[ $(post /api/consumer '{"paused":false}') == 200 ]]; then
  pass 'consumer resumed'
else
  fail 'consumer resumed'
fi
wait_for 'backlog drained and committed (lag 0, consumed == produced)' 30 '.lag == 0 and .consumed == .produced and .lastError == null'

sleep 6 # one Prometheus scrape interval plus margin
for q in 'sum(up{job="redpanda"}) == 3' 'up{job="lab-app"} == 1' 'sum(lab_produced_total) > 150' 'lab_delivery_seconds_count > 0' 'sum(rate(redpanda_kafka_request_bytes_total{redpanda_topic="lab.events",redpanda_request="produce"}[1m])) > 0'; do
  if api "$prom_url/api/v1/query" --data-urlencode "query=$q" | jq -e '.data.result | length > 0' >/dev/null; then
    pass "Prometheus: $q"
  else
    fail "Prometheus: $q"
  fi
done
if api "${grafana_url%/d/*}/api/datasources/proxy/uid/prometheus/api/v1/query" --get --data-urlencode 'query=sum(up{job="redpanda"})' | jq -e '.status == "success" and .data.resultType == "vector" and ((.data.result[0].value[1] | tonumber) == 3)' >/dev/null; then
  pass 'Grafana datasource queries all three real broker targets'
else
  fail 'Grafana datasource queries all three real broker targets'
fi
if api "$console_url/api/consumer-groups" | jq -e '.consumerGroups | any(.groupId == "lab-explorer")' >/dev/null; then
  pass 'Console sees consumer group lab-explorer'
else
  fail 'Console sees consumer group lab-explorer'
fi
[[ $(post /api/consumer '{"paused":true}') == 200 ]] || fail 'consumer paused before broker failure'
wait_for 'pre-failover offsets committed' 15 '.lag == 0'
consumed_paused=$(stats | jq .consumed)
podman --remote=false kill "${project}_redpanda-1_1" >> "$log" 2>&1 || fail 'broker 1 stopped for failover'
before_failover=$(stats | jq .produced)
for n in {1..24}; do
  [[ $(post /api/produce "{\"key\":\"failover-$n\",\"kind\":\"sensor.reading\",\"payload\":{\"sensor\":\"failover\",\"celsius\":20}}") == 201 ]] || fail "acks=all production with one broker unavailable (key $n)"
done
pass '24 distinct keys acknowledged with one broker down'
wait_for 'broker-stored lag accumulates while paused through failover' 30 ".lag >= 24 and .paused and .produced == ($before_failover + 24)"
if [[ $(stats | jq .consumed) == "$consumed_paused" ]]; then
  pass 'consumer stays paused through broker failover'
else
  fail 'consumer stays paused through broker failover'
fi
[[ $(post /api/consumer '{"paused":false}') == 200 ]] || fail 'consumer resumed after broker failover'
wait_for 'consumer drains and commits after broker failover' 60 '.lag == 0 and .consumed >= .produced and .lastError == null'
podman --remote=false start "${project}_redpanda-1_1" >> "$log" 2>&1 || fail 'failed broker restarted'
health_deadline=$((SECONDS + 60))
until "$root/lab" rpk cluster health | grep -q 'Healthy: *true'; do
  (( SECONDS < health_deadline )) || fail 'cluster healthy after failed broker restart'
  sleep 2
done
pass 'cluster healthy after failed broker restart'

"$root/lab" down >> "$log" 2>&1 || fail './lab down succeeded'
remaining=$(podman --remote=false ps -a --filter "name=^${project}_" --format '{{.Names}}') || fail 'cannot inspect owned containers after disposal'
if [[ -n $project && -z $remaining ]]; then
  pass 'no lab containers remain'
else
  fail 'no lab containers remain'
fi
for kind in volume network; do
  inventory=$(podman --remote=false "$kind" ls --format '{{.Name}}') || fail "cannot inspect $kind inventory after disposal"
  if jq -R -s -e --arg prefix "${project}_" 'split("\n") | all(.[]; startswith($prefix) | not)' <<<"$inventory" >/dev/null; then
    pass "no lab $kind remains"
  else
    fail "no lab $kind remains"
  fi
done
if [[ ! -f ${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/${identity:0:10}/port-base ]]; then
  pass 'saved port state removed'
else
  fail 'saved port state removed'
fi
if curl -s --max-time 2 "$base_url/api/stats" >/dev/null; then fail 'app loopback port released'; else pass 'app loopback port released'; fi
finish 0
