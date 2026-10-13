#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
app=$("$root/labs/run" bitcoin urls --json | jq -er '.app')
work=$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/bitcoin-e2e.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }
get() { curl --silent --show-error --fail --max-time 10 "$app$1"; }
post() { curl --silent --show-error --fail-with-body --max-time 40 -H 'content-type: application/json' -d "{\"id\":\"$1\",\"kind\":\"$2\"}" "$app/api/commands"; }
reject() {
  local code
  code=$(curl --silent --show-error --max-time 40 -o "$work/rejected.json" -w '%{http_code}' -H 'content-type: application/json' -d "{\"id\":\"$1\",\"kind\":\"$2\"}" "$app/api/commands")
  [[ $code == 409 ]] || fail "expected a domain rejection, got $code"
}
wait_ready() {
  for _ in {1..120}; do
    if curl -fsS --max-time 3 "$app/health" | jq -e '.ready' >/dev/null; then return; fi
    sleep 1
  done
  fail 'paper app did not recover'
}
reserved=$(get /api/state | jq -er '"tick-" + .source.fixtureSha256[0:16] + "-0"')
code=$(curl --silent --show-error --max-time 10 -o "$work/reserved.json" -w '%{http_code}' -H 'content-type: application/json' -d "{\"id\":\"$reserved\",\"kind\":\"pause\"}" "$app/api/commands")
[[ $code == 400 ]] || fail 'a client reserved an internal timer ID'
jq -e '.outcomeUnknown == false' "$work/reserved.json" >/dev/null || fail 'pre-publish rejection was marked uncertain'
pass 'client IDs cannot reserve timer work and pre-publish errors have known completion state'
post manual-mode auto-off >/dev/null
reject before-quote buy
jq -e '.result.accepted == false and .result.model.quantitySats == 0' "$work/rejected.json" >/dev/null
post first-quote step >/dev/null
post manual-buy buy > "$work/buy.json"
get /api/state > "$work/before-duplicate.json"
post manual-buy buy > "$work/duplicate.json"
cmp "$work/buy.json" "$work/duplicate.json" || fail 'same id did not return the original outcome'
reject manual-buy sell
reject second-buy buy
get /api/state > "$work/after-rejections.json"
jq -e --slurpfile before "$work/before-duplicate.json" '.account == $before[0].account and (.trades | length == 1)' "$work/after-rejections.json" >/dev/null || fail 'duplicate or rejected command changed the account'
pass 'manual buy, stable IDs, conflicting IDs and invalid position transitions preserve one position'
post second-quote step >/dev/null
post manual-sell sell > "$work/sell.json"
get /api/state > "$work/manual.json"
node --input-type=module - "$work/manual.json" <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
const state=JSON.parse(fs.readFileSync(process.argv[2]));
const [buy,sell]=state.trades;
const cash=1000000n, scale=100000000n;
const budget=cash/4n, principal=budget*10000n/10010n;
const quantity=principal*scale/BigInt(state.prices[0].priceCents);
const ceil=(a,b)=>(a+b-1n)/b;
const cost=ceil(quantity*BigInt(buy.priceCents),scale);
const entryFee=ceil(cost,1000n);
const proceeds=quantity*BigInt(sell.priceCents)/scale;
const exitFee=ceil(proceeds,1000n);
const profit=proceeds-exitFee-cost-entryFee;
assert.equal(BigInt(buy.quantitySats),quantity);
assert.equal(BigInt(buy.notionalCents),cost);
assert.equal(BigInt(buy.feeCents),entryFee);
assert.equal(BigInt(sell.notionalCents),proceeds);
assert.equal(BigInt(sell.feeCents),exitFee);
assert.equal(state.account.quantitySats,0);
assert.equal(BigInt(state.account.cashCents),cash+profit);
assert.equal(BigInt(state.account.realizedCents),profit);
assert.equal(state.account.unrealizedCents,0);
assert.equal(BigInt(state.account.feesCents),entryFee+exitFee);
console.log(`Independent accounting: quantity ${quantity} sats, realized ${profit} cents, fees ${entryFee+exitFee} cents`);
JS
pass 'cash, satoshi rounding, both fees and realized loss agree with independent integer accounting'
post automatic-mode auto-on >/dev/null
post paced-play play >/dev/null
for _ in {1..30}; do
  if get /api/state | jq -e '.replay.index >= 2' >/dev/null; then break; fi
  sleep 0.2
done
get /api/state | jq -e '.replay.index >= 2' >/dev/null || fail 'timer did not consume a quote'
post paced-pause pause >/dev/null
paused=$(get /api/state | jq -er '.replay.index')
sleep 3
get /api/state | jq -e --argjson index "$paused" '.replay.playing == false and .replay.index == $index' >/dev/null || fail 'quotes continued after the consumed pause'
pass 'automatic quote pacing works and a consumed pause prevents subsequent timer ticks'
for number in {1..24}; do
  if get /api/state | jq -e '.replay.ended' >/dev/null; then break; fi
  post "finish-$number" step >/dev/null
done
get /api/state > "$work/finished.json"
jq -e '.replay.ended and (.replay.playing == false) and .account.quantitySats == 0 and
  (.trades | length == 4) and .trades[2].side == "buy" and .trades[3].side == "sell" and
  .trades[2].marketAt == .prices[8].at and .trades[3].marketAt == .prices[22].at and
  .account.cashCents == (1000000 + .account.realizedCents) and (.account.feesCents > 0)' "$work/finished.json" >/dev/null || fail 'next-candle automatic entries/exits or final account invariant failed'
reject after-end step
pass 'the 3/8-hour strategy enters after warmup and exits on the next close, without looking ahead or overreading the fixture'
duplicate=$(jq -c '.record' "$work/buy.json")
printf '%s\n' "$duplicate" | "$root/labs/run" bitcoin rpk topic produce bitcoin.paper.v1 -k manual-buy --compression none
for _ in {1..30}; do
  if get /api/state | jq -e '.duplicates == 1' >/dev/null; then break; fi
  sleep 0.2
done
get /api/state > "$work/before-restart.json"
jq -e '.duplicates == 1 and (.trades | length == 4)' "$work/before-restart.json" >/dev/null || fail 'broker duplicate was not ignored'
"$root/labs/run" bitcoin restart app
wait_ready
get /api/state > "$work/after-restart.json"
jq -S . "$work/before-restart.json" > "$work/expected.json"
jq -S . "$work/after-restart.json" > "$work/actual.json"
cmp "$work/expected.json" "$work/actual.json" || fail 'restart changed account, prices, trades or receipts'
pass 'a duplicate broker record and restart preserve exact paper accounting and do not fill again'
code=$(curl --silent --show-error --max-time 5 -o "$work/origin.json" -w '%{http_code}' -H 'origin: http://foreign.invalid' -H 'content-type: application/json' -d '{"id":"foreign","kind":"play"}' "$app/api/commands")
[[ $code == 403 ]] || fail 'foreign-origin mutation accepted'
get /metrics | grep -q 'bitcoin_paper_trades_total{side="sell"} 2' || fail 'paper metrics missing'
pass 'foreign-origin writes are rejected and consumed paper-trade metrics are exposed'
