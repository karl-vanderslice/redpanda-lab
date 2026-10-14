#!/usr/bin/env bash
set -euo pipefail
# Run from the repository root after ./labs/run trading up. This scenario clears
# resting WHEAT orders in the disposable simulation, never broker history.
runner=(./labs/run trading)
url=$("${runner[@]}" urls --json | jq -er '.app')
url=${url%/}
prefix="e2e-$(date +%s)-$$"
cli() { "${runner[@]}" exec app commodity-exchange "$@"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert() { printf '%s' "$1" | jq -e "$2" >/dev/null || fail "$3"; printf 'PASS: %s\n' "$3"; }
wait_ready() {
  local attempt
  for ((attempt=0; attempt<90; attempt++)); do
    if curl -fsS --max-time 2 "$url/health" | jq -e '.ready == true' >/dev/null; then return 0; fi
    sleep 1
  done
  fail 'Exchange did not become ready within 90 bounded health attempts'
}
operation() {
  local id=$1 attempt body
  for ((attempt=0; attempt<40; attempt++)); do
    body=$(curl -sS --max-time 3 "$url/api/operations/$id")
    if printf '%s' "$body" | jq -e '.status == "accepted" or .status == "rejected"' >/dev/null; then printf '%s' "$body"; return 0; fi
    sleep 1
  done
  fail "Operation $id never reached accepted/rejected"
}
order() {
  local id=$1 side=$2 price=$3 quantity=$4 response code=0
  response=$(cli order --id "$id" --commodity WHEAT --side "$side" --price-ticks "$price" --quantity "$quantity") || code=$?
  if (( code != 0 && code != 3 )); then fail "Submitting $id failed ($code): $response"; fi
  operation "$id"
}
wait_ready
# Ensure a deterministic book even on repeated runs. Existing history remains.
book=$(cli book)
cleanup_index=0
while IFS= read -r id; do
  [[ -n "$id" ]] || continue
  cleanup_index=$((cleanup_index + 1))
  cli cancel --id "$prefix-clean-$cleanup_index" --order-id "$id" >/dev/null
  operation "$prefix-clean-$cleanup_index" >/dev/null
done < <(printf '%s' "$book" | jq -r '.orders[] | select(.commodity == "WHEAT" and .remaining > 0 and .status != "cancelled") | .id')

result=$(order "$prefix-ask-old" sell 25000 5)
assert "$result" '.status == "accepted" and (.trade_ids | length) == 0' 'CLI resting sell accepted through broker log'
order "$prefix-ask-new" sell 25000 7 >/dev/null
order "$prefix-ask-best" sell 24000 2 >/dev/null
result=$(order "$prefix-buy" buy 26000 8)
assert "$result" '.status == "accepted" and (.trade_ids | length) == 3' 'Crossing buy produces three partial/multi-maker fills'
trades=$(cli trades)
assert "$trades" "[.[] | select(.buy_order == \"$prefix-buy\") | .maker_order] == [\"$prefix-ask-best\",\"$prefix-ask-old\",\"$prefix-ask-new\"]" 'Sell book uses lowest price then oldest broker offset'
assert "$trades" "[.[] | select(.buy_order == \"$prefix-buy\") | [.price_ticks,.quantity]] == [[24000,2],[25000,5],[25000,1]]" 'Executions use maker ticks and exact integer quantities'
result=$(cli order-status "$prefix-ask-new")
assert "$result" '.status == "partial" and .remaining == 6' 'Partial maker retains six commodity units'
result=$(cli order-status "$prefix-buy")
assert "$result" '.status == "filled" and .remaining == 0' 'Incoming buy is fully filled'
result=$(cli cancel --id "$prefix-cancel" --order-id "$prefix-ask-new")
assert "$result" '.status == "accepted"' 'CLI cancellation accepted'
result=$(cli order-status "$prefix-ask-new")
assert "$result" '.status == "cancelled" and .remaining == 6' 'Cancellation preserves unexecuted remainder and removes liquidity'
# Buy-side descending price and same-price FIFO, including incoming partial fill.
order "$prefix-bid-old" buy 22000 3 >/dev/null
order "$prefix-bid-new" buy 22000 4 >/dev/null
order "$prefix-bid-best" buy 23000 2 >/dev/null
result=$(order "$prefix-sell" sell 21000 10)
assert "$result" '(.trade_ids | length) == 3' 'Sell sweeps three bid makers'
trades=$(cli trades)
assert "$trades" "[.[] | select(.sell_order == \"$prefix-sell\") | .maker_order] == [\"$prefix-bid-best\",\"$prefix-bid-old\",\"$prefix-bid-new\"]" 'Buy book uses highest price then oldest offset'
result=$(cli order-status "$prefix-sell")
assert "$result" '.status == "partial" and .remaining == 1' 'Incoming sell remainder rests after partial execution'
cli cancel --id "$prefix-cancel-sell" --order-id "$prefix-sell" >/dev/null
# Domain rejection is a durable event, not a transport/parser error.
code=0
result=$(cli order --id "$prefix-invalid" --commodity WHEAT --side buy --price-ticks 0 --quantity 5) || code=$?
[[ "$code" == 2 ]] || fail "Invalid price should exit 2, got $code"
assert "$result" '.status == "rejected" and (.reason | contains("Price"))' 'Invalid integer price is durably rejected'
result=$(cli status "$prefix-invalid") || code=$?
assert "$result" '.status == "rejected"' 'CLI status exposes persisted rejection'
# Identical stable-ID retry returns the original execution and appends nothing.
before=$(curl -fsS "$url/api/state")
result=$(order "$prefix-buy" buy 26000 8)
assert "$result" '.status == "accepted" and (.trade_ids | length) == 3' 'Identical stable ID returns original result'
after=$(curl -fsS "$url/api/state")
assert "$after" ".next_offset == $(printf '%s' "$before" | jq '.next_offset')" 'Deduplicated retry does not append a new execution'
code=0
result=$(cli order --id "$prefix-buy" --commodity WHEAT --side buy --price-ticks 26000 --quantity 9) || code=$?
[[ "$code" == 1 ]] || fail 'Conflicting operation ID must be HTTP 409 / CLI exit 1'
assert "$result" '(.error | contains("different command"))' 'Stable ID payload conflict is explicit'
# Browser order entry uses this same public endpoint; exercise its JSON contract.
body=$(jq -nc --arg id "$prefix-web" '{id:$id,action:"order",commodity:"WHEAT",side:"buy",price_ticks:20000,quantity:2}')
result=$(curl -fsS --max-time 25 "$url/api/commands" -H 'Content-Type: application/json' -H "Origin: $url" --data "$body")
assert "$result" '.status == "accepted"' 'Browser same-origin order entry reaches the real engine'
operation "$prefix-web" >/dev/null
cli cancel --id "$prefix-cancel-web" --order-id "$prefix-web" >/dev/null
# A foreign exact duplicate can land before the next proposal is appended.
# Replay must accept the proposal and assign priority from its real offset.
offset=$(cli status "$prefix-web" | jq -er '.offset')
record=$("${runner[@]}" rpk topic consume trading.exchange.v1 --offset "$offset" --num 1 --format '%v\n')
printf '%s\n' "$record" | "${runner[@]}" rpk topic produce trading.exchange.v1 --key "\"$prefix-web\"" --compression none >/dev/null
result=$(order "$prefix-after-duplicate" buy 20000 1)
assert "$result" '.status == "accepted"' 'Proposal after a foreign exact duplicate replays without an invariant fault'
result=$(cli order-status "$prefix-after-duplicate")
assert "$result" ".sequence > $offset" 'Order priority uses its consumed offset'
cli cancel --id "$prefix-cancel-after-duplicate" --order-id "$prefix-after-duplicate" >/dev/null
curl -fsS "$url/metrics" | jq -Rs -e 'contains("exchange_trades_total")' >/dev/null || fail 'Missing trade metric'
printf 'PASS: Prometheus metrics expose executed trades\n'
before=$(curl -fsS "$url/api/state")
"${runner[@]}" restart app
wait_ready
after=$(curl -fsS "$url/api/state")
# Only a startup barrier changes the offset; order, operation and trade history
# must be byte-for-byte identical as JSON values after complete replay.
expected=$(printf '%s' "$before" | jq -c '{orders,operations,trades}')
actual=$(printf '%s' "$after" | jq -c '{orders,operations,trades}')
[[ "$expected" == "$actual" ]] || fail 'Restart changed reconstructed exchange state'
printf 'PASS: Restart reconstructs exact orders, cancellations, rejections and trade history\n'
result=$(order "$prefix-buy" buy 26000 8)
assert "$result" '.status == "accepted" and (.trade_ids | length) == 3' 'Stable operation ID remains deduplicated after restart'
final=$(cli trades)
assert "$final" "[.[] | select(.buy_order == \"$prefix-buy\")] | length == 3" 'Replay and retry create no duplicate fills'
printf 'Trading E2E complete: matching, priority, partial fill, cancellation, rejection, web API and restart replay.\n'
