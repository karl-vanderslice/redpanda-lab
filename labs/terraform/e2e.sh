#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
lab=$(realpath "$(dirname "${BASH_SOURCE[0]}")")
run="$lab/lab"
[[ $# == 0 ]] || { printf 'test takes no arguments and destroys its fresh test cluster\n' >&2; exit 2; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }
info=$("$run" urls --json)
project=$(jq -r .project <<<"$info")
state=$(jq -r .state <<<"$info")
[[ $(jq -r .console <<<"$info") != null ]] || fail 'test requires Console enabled'
[[ ! -f "$state/terraform.tfstate" ]] || jq -e '(.resources // [] | length)==0' "$state/terraform.tfstate" >/dev/null || fail 'test refuses nonempty existing state; destroy it after review first'
# shellcheck source-path=SCRIPTDIR
# shellcheck source=../../scripts/local-podman
source "$lab/../../scripts/local-podman"
require_local_podman
[[ -z $(podman --remote=false ps -a --filter "label=io.redpanda.lab.project=$project" --format '{{.ID}}') ]] || fail 'owned containers already exist'
[[ -z $(podman --remote=false volume ls --filter "label=io.redpanda.lab.project=$project" --format '{{.Name}}') ]] || fail 'owned volumes already exist'
[[ -z $(podman --remote=false network ls --filter "label=io.redpanda.lab.project=$project" --format '{{.Name}}') ]] || fail 'owned network already exists'
# A failed test retains its partial deployment/state for diagnosis, never blind cleanup.
trap 'printf "E2E failed; retain and inspect state at %s. Review lab plan --destroy before cleanup.\n" "$state" >&2' ERR
mkdir -p "$state/evidence"
plan=$("$run" plan --json)
jq -e '.changed==true and .kind=="apply"' <<<"$plan" >/dev/null || fail 'fresh plan has no changes'
"$run" show --json > "$state/evidence/create-plan.json"
jq -e '
  [.resource_changes[] | select(.mode=="managed")] as $r |
  ($r|length)==10 and
  all($r[]; .change.actions==["create"]) and
  ([$r[]|select(.type=="docker_container")]|length)==4 and
  ([$r[]|select(.type=="docker_volume")]|length)==3 and
  ([$r[]|select(.type=="docker_network")]|length)==1 and
  ([$r[]|select(.type=="docker_image")]|length)==2 and
  all($r[]|select(.type=="docker_container");
    all(.change.after.ports[]; .ip=="127.0.0.1" and .external>=20000))
' "$state/evidence/create-plan.json" >/dev/null || fail 'create plan violates reviewed resource/loopback contract'
"$run" apply --reviewed "$(jq -r .sha256 <<<"$plan")"
pass 'reviewed saved plan creates 3 brokers, Console, network and 3 data volumes'
"$run" health
for broker in 0 1 2; do
  podman --remote=false inspect "$project-broker-$broker" | jq -e --arg p "$project" \
    '.[0].State.Running==true and .[0].Config.Labels["io.redpanda.lab.project"]==$p and .[0].HostConfig.Memory==1073741824 and all(.[0].HostConfig.PortBindings[] []; .HostIp=="127.0.0.1")' >/dev/null || fail "broker-$broker runtime contract"
done
pass 'live rootless brokers obey memory and loopback contracts'
topic=terraform.lifecycle.v1
"$run" rpk topic create "$topic" --partitions 1 --replicas 3
message='{"event":"terraform-applied","version":1,"review":"saved-plan"}'
printf '%s\n' "$message" | timeout 30 "$run" rpk topic produce "$topic" --acks=-1 --delivery-timeout 15s --format '%v\n'
received=$(timeout 30 "$run" rpk topic consume "$topic" --offset start --num 1 --format '%v')
[[ "$received" == "$message" ]] || fail 'replicated topic round-trip differs'
"$run" health
pass 'RF3 Kafka record round-trip succeeds with all acknowledgments'
plan=$("$run" plan --json)
jq -e '.changed==false' <<<"$plan" >/dev/null || fail 'post-apply plan not converged'
pass 'refresh finds no infrastructure changes after initial apply'
# Restarting one broker does not delete its Terraform-owned named data volume.
before_volume=$(podman --remote=false inspect "$project-broker-1" | jq -r '.[0].Mounts[]|select(.Destination=="/var/lib/redpanda/data")|.Name')
podman --remote=false restart --time 30 "$project-broker-1"
"$run" health
after_volume=$(podman --remote=false inspect "$project-broker-1" | jq -r '.[0].Mounts[]|select(.Destination=="/var/lib/redpanda/data")|.Name')
[[ "$before_volume" == "$after_volume" ]] || fail 'broker restart lost the owned data volume'
received=$(timeout 30 "$run" rpk topic consume "$topic" --offset start --num 1 --format '%v')
[[ "$received" == "$message" ]] || fail 'broker restart lost the log record'
pass 'named broker volume and replicated record survive broker restart'
before_brokers=$(podman --remote=false ps --filter "label=io.redpanda.lab.project=$project" --filter label=io.redpanda.lab.role=broker --format '{{.ID}}' | sort)
"$run" drift
podman --remote=false inspect "$project-console" | jq -e '.[0].State.Running==false' >/dev/null || fail 'Console was not stopped'
plan=$("$run" plan --json)
jq -e '.changed==true' <<<"$plan" >/dev/null || fail 'Terraform failed to detect real stopped Console drift'
"$run" show --json > "$state/evidence/drift-plan.json"
jq -e '
  [.resource_changes[] | select(.mode=="managed" and .change.actions!=["no-op"])] as $r |
  ($r|length)==1 and $r[0].address=="docker_container.console[0]" and
  $r[0].change.actions==["update"] and
  $r[0].change.before.must_run==false and $r[0].change.after.must_run==true
' "$state/evidence/drift-plan.json" >/dev/null || fail 'reviewed drift plan must repair only Console must_run'
"$run" apply --reviewed "$(jq -r .sha256 <<<"$plan")"
after_brokers=$(podman --remote=false ps --filter "label=io.redpanda.lab.project=$project" --filter label=io.redpanda.lab.role=broker --format '{{.ID}}' | sort)
[[ "$before_brokers" == "$after_brokers" ]] || fail 'Console reconciliation replaced a broker'
podman --remote=false inspect "$project-console" | jq -e '.[0].State.Running==true' >/dev/null || fail 'Console not restarted by Terraform'
plan=$("$run" plan --json)
jq -e '.changed==false' <<<"$plan" >/dev/null || fail 'drift repair did not converge'
pass 'saved reviewed drift plan reconciles stopped Console without touching brokers'
plan=$("$run" plan --destroy --json)
"$run" show --destroy --json > "$state/evidence/destroy-plan.json"
jq -e '
  [.resource_changes[] | select(.mode=="managed")] as $r |
  ($r|length)==10 and all($r[]; .change.actions==["delete"])
' "$state/evidence/destroy-plan.json" >/dev/null || fail 'destroy plan deletion set differs from owned ten resources'
"$run" apply --destroy --reviewed "$(jq -r .sha256 <<<"$plan")"
jq -e '(.resources // [] | length)==0' "$state/terraform.tfstate" >/dev/null || fail 'state still has resources'
[[ -z $(podman --remote=false ps -a --filter "label=io.redpanda.lab.project=$project" --format '{{.ID}}') ]] || fail 'owned containers survived'
[[ -z $(podman --remote=false volume ls --filter "label=io.redpanda.lab.project=$project" --format '{{.Name}}') ]] || fail 'owned volumes survived'
[[ -z $(podman --remote=false network ls --filter "label=io.redpanda.lab.project=$project" --format '{{.Name}}') ]] || fail 'owned network survived'
while IFS= read -r endpoint; do
  if curl --fail --silent --max-time 2 "$endpoint/v1/status/ready" >/dev/null 2>&1; then fail "destroyed Admin API still reachable at $endpoint"; fi
done < <(jq -r '.brokers[].admin' <<<"$info")
pass 'reviewed full destroy empties state and owned containers, volumes and network; Admin APIs stop'
next=$(
  LAB_TF_PORT_BASE=59000 LAB_TF_CONSOLE_ENABLED=false "$run" urls --json
)
jq -e '.console==null and .brokers[0].kafka=="127.0.0.1:59000"' <<<"$next" >/dev/null || fail 'verified destroy did not release the previous target choices'
pass 'inspection after verified destroy accepts new port and Console choices without planning them'
trap - ERR
printf 'Terraform lifecycle E2E complete. Private evidence: %s/evidence\n' "$state"
