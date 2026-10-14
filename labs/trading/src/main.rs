use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    env,
    io::Read,
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tiny_http::{Header, Method, Request, Response, Server};

const TOPIC: &str = "trading.exchange.v1";
const MIME: &str = "application/vnd.kafka.json.v2+json";
const MAX_BODY: u64 = 16384;
type Shared = Arc<Mutex<State>>;
type Reply = (u16, Value);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Command {
    id: String,
    action: String,
    #[serde(default)]
    commodity: String,
    #[serde(default)]
    side: String,
    #[serde(default)]
    price_ticks: i64,
    #[serde(default)]
    quantity: i64,
    #[serde(default)]
    order_id: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
struct Order {
    id: String,
    commodity: String,
    side: String,
    price_ticks: i64,
    quantity: i64,
    remaining: i64,
    sequence: i64,
    status: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
struct Trade {
    id: String,
    commodity: String,
    buy_order: String,
    sell_order: String,
    maker_order: String,
    price_ticks: i64,
    quantity: i64,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    Accepted { order: Order },
    Trade { trade: Trade },
    Cancelled { order_id: String },
    Rejected { reason: String },
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Record {
    Barrier {
        schema: u32,
        id: String,
    },
    Execution {
        schema: u32,
        command: Command,
        events: Vec<Event>,
    },
}
#[derive(Serialize)]
struct Operation {
    command: Command,
    status: String,
    reason: Option<String>,
    offset: i64,
    trade_ids: Vec<String>,
}
#[derive(Default)]
struct State {
    ready: bool,
    error: Option<String>,
    next_offset: i64,
    orders: BTreeMap<String, Order>,
    operations: BTreeMap<String, Operation>,
    trades: Vec<Trade>,
    pending: BTreeMap<String, Command>,
    unresolved: BTreeMap<String, Value>,
}
struct Job {
    command: Command,
    reply: mpsc::SyncSender<Reply>,
}

fn commodity_known(name: &str) -> bool {
    matches!(name, "WHEAT" | "COPPER" | "COFFEE")
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id != "."
        && id != ".."
        && id.len() <= 96
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
}
fn loopback_host(host: &str) -> bool {
    let name = match host.rsplit_once(':') {
        Some((name, port)) if !port.is_empty() && port.bytes().all(|c| c.is_ascii_digit()) => name,
        _ => host,
    };
    matches!(name, "127.0.0.1" | "localhost" | "[::1]")
}
fn commodities() -> Value {
    json!([
        {"symbol":"WHEAT","name":"Wheat","unit":"one metric tonne","tick_usd":"0.01","illustrative_ticks":24500},
        {"symbol":"COPPER","name":"Copper","unit":"one metric tonne","tick_usd":"0.01","illustrative_ticks":850000},
        {"symbol":"COFFEE","name":"Coffee","unit":"one 60 kg bag","tick_usd":"0.01","illustrative_ticks":21000}
    ])
}
fn effects(state: &State, c: &Command) -> Vec<Event> {
    let reject = |reason: &str| {
        vec![Event::Rejected {
            reason: reason.to_owned(),
        }]
    };
    if c.action == "cancel" {
        if !c.commodity.is_empty() || !c.side.is_empty() || c.price_ticks != 0 || c.quantity != 0 {
            return reject("Cancellation accepts only id, action and order_id");
        }
        return match state.orders.get(&c.order_id) {
            Some(o) if o.remaining > 0 && o.status != "cancelled" => vec![Event::Cancelled {
                order_id: c.order_id.clone(),
            }],
            Some(_) => reject("Order is already filled or cancelled"),
            None => reject("Order does not exist"),
        };
    }
    if c.action != "order" {
        return reject("Action must be order or cancel");
    }
    if !c.order_id.is_empty() {
        return reject("New orders must not supply order_id");
    }
    if !commodity_known(&c.commodity) {
        return reject("Commodity must be WHEAT, COPPER or COFFEE");
    }
    if c.side != "buy" && c.side != "sell" {
        return reject("Side must be buy or sell");
    }
    if !(1..=1_000_000_000).contains(&c.price_ticks) {
        return reject("Price must be 1..1000000000 integer USD-cent ticks");
    }
    if !(1..=1_000_000).contains(&c.quantity) {
        return reject("Quantity must be 1..1000000 whole commodity units");
    }
    let order = Order {
        id: c.id.clone(),
        commodity: c.commodity.clone(),
        side: c.side.clone(),
        price_ticks: c.price_ticks,
        quantity: c.quantity,
        remaining: c.quantity,
        sequence: state.next_offset,
        status: "open".into(),
    };
    let mut makers: Vec<&Order> = state
        .orders
        .values()
        .filter(|o| {
            o.commodity == c.commodity
                && o.side != c.side
                && o.remaining > 0
                && o.status != "cancelled"
                && if c.side == "buy" {
                    o.price_ticks <= c.price_ticks
                } else {
                    o.price_ticks >= c.price_ticks
                }
        })
        .collect();
    makers.sort_unstable_by(|a, b| {
        let price = if c.side == "buy" {
            a.price_ticks.cmp(&b.price_ticks)
        } else {
            b.price_ticks.cmp(&a.price_ticks)
        };
        price.then(a.sequence.cmp(&b.sequence))
    });
    let mut events = vec![Event::Accepted { order }];
    let mut remaining = c.quantity;
    for maker in makers {
        if remaining == 0 {
            break;
        }
        let quantity = remaining.min(maker.remaining);
        events.push(Event::Trade {
            trade: Trade {
                id: format!("{}-fill-{}", c.id, events.len()),
                commodity: c.commodity.clone(),
                buy_order: if c.side == "buy" { &c.id } else { &maker.id }.clone(),
                sell_order: if c.side == "sell" { &c.id } else { &maker.id }.clone(),
                maker_order: maker.id.clone(),
                price_ticks: maker.price_ticks,
                quantity,
            },
        });
        remaining -= quantity;
    }
    events
}
// Priority comes from the consumed offset. A proposal's provisional sequence can
// differ when another record lands before its append, so it is not an invariant.
fn without_sequence(events: &[Event]) -> Result<Value, String> {
    let mut value = serde_json::to_value(events).map_err(|e| e.to_string())?;
    for event in value.as_array_mut().into_iter().flatten() {
        if let Some(order) = event.get_mut("order").and_then(Value::as_object_mut) {
            order.remove("sequence");
        }
    }
    Ok(value)
}
fn apply(state: &mut State, record: Record, offset: i64) -> Result<(), String> {
    match record {
        Record::Barrier { schema: 1, .. } => {}
        Record::Execution {
            schema: 1,
            command,
            events,
        } => {
            if let Some(previous) = state.operations.get(&command.id) {
                if previous.command != command {
                    return Err("Conflicting operation ID in broker log".into());
                }
                state.next_offset = offset + 1;
                return Ok(());
            }
            // Verify the stored outcome against the deterministic reducer before applying it.
            if without_sequence(&effects(state, &command))? != without_sequence(&events)? {
                return Err(format!(
                    "Execution at offset {offset} violates the matching invariant"
                ));
            }
            let mut op = Operation {
                command,
                status: "accepted".into(),
                reason: None,
                offset,
                trade_ids: Vec::new(),
            };
            for event in events {
                match event {
                    Event::Accepted { mut order } => {
                        order.sequence = offset;
                        state.orders.insert(order.id.clone(), order);
                    }
                    Event::Trade { trade } => {
                        for id in [&trade.buy_order, &trade.sell_order] {
                            let o = state
                                .orders
                                .get_mut(id)
                                .ok_or("Trade references missing order")?;
                            if o.remaining < trade.quantity {
                                return Err("Trade exceeds remaining quantity".into());
                            }
                            o.remaining -= trade.quantity;
                            o.status = if o.remaining == 0 {
                                "filled"
                            } else {
                                "partial"
                            }
                            .into();
                        }
                        op.trade_ids.push(trade.id.clone());
                        state.trades.push(trade);
                    }
                    Event::Cancelled { order_id } => {
                        state
                            .orders
                            .get_mut(&order_id)
                            .ok_or("Cancel references missing order")?
                            .status = "cancelled".into();
                    }
                    Event::Rejected { reason } => {
                        op.status = "rejected".into();
                        op.reason = Some(reason);
                    }
                }
            }
            state.pending.remove(&op.command.id);
            state.operations.insert(op.command.id.clone(), op);
        }
        _ => return Err("Unsupported log schema; refusing to trade".into()),
    }
    state.next_offset = offset + 1;
    Ok(())
}
fn append(agent: &ureq::Agent, proxy: &str, record: &Record, key: &str) -> Result<i64, String> {
    let response: Value = agent
        .post(&format!("{proxy}/topics/{TOPIC}"))
        .set("Content-Type", MIME)
        .set("Accept", "application/vnd.kafka.v2+json")
        .send_json(json!({"records":[{"partition":0,"key":key,"value":record}]}))
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())?;
    let row = response
        .get("offsets")
        .and_then(|o| o.get(0))
        .ok_or("Missing broker append offset")?;
    if row.get("error_code").and_then(Value::as_i64).unwrap_or(0) != 0 {
        return Err(format!("Broker append failed: {row}"));
    }
    if row.get("partition").and_then(Value::as_i64) != Some(0) {
        return Err("Broker returned unexpected partition".into());
    }
    row.get("offset")
        .and_then(Value::as_i64)
        .filter(|o| *o >= 0)
        .ok_or_else(|| "Broker returned invalid offset".into())
}
fn replay_through(
    agent: &ureq::Agent,
    proxy: &str,
    state: &Shared,
    target: i64,
) -> Result<(), String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(45);
    loop {
        let next = state.lock().next_offset;
        if next > target {
            return Ok(());
        }
        if std::time::Instant::now() > deadline {
            return Err("Timed out consuming acknowledged records; outcome unknown".into());
        }
        let rows: Vec<Value> = agent.get(&format!("{proxy}/topics/{TOPIC}/partitions/0/records?offset={next}&timeout=1000&max_bytes=1048576"))
            .set("Accept", MIME).call().map_err(|e| e.to_string())?.into_json().map_err(|e| e.to_string())?;
        if rows.is_empty() {
            thread::sleep(Duration::from_millis(100));
        }
        for row in rows {
            let offset = row
                .get("offset")
                .and_then(Value::as_i64)
                .ok_or("Missing record offset")?;
            let mut s = state.lock();
            if offset != s.next_offset {
                return Err(format!("Log gap: expected {}, found {offset}. History expired or partition mutated; reset disposable lab", s.next_offset));
            }
            let record: Record =
                serde_json::from_value(row.get("value").ok_or("Missing record value")?.clone())
                    .map_err(|e| e.to_string())?;
            apply(&mut s, record, offset)?;
        }
    }
}
fn fail(state: &Shared, message: String) {
    let mut s = state.lock();
    s.ready = false;
    s.error = Some(message);
}
fn engine(state: Shared, jobs: mpsc::Receiver<Job>, proxy: String) {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(10))
        .build();
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let barrier = Record::Barrier {
        schema: 1,
        id: format!("boot-{stamp}"),
    };
    let startup = append(&agent, &proxy, &barrier, "startup")
        .and_then(|offset| replay_through(&agent, &proxy, &state, offset));
    if let Err(e) = startup {
        fail(&state, e);
    } else {
        state.lock().ready = true;
    }
    for job in jobs {
        let record = {
            let mut s = state.lock();
            if let Some(op) = s.operations.get(&job.command.id) {
                let reply = if op.command == job.command {
                    (200, json!(op))
                } else {
                    (
                        409,
                        json!({"error":"Operation ID already belongs to a different command"}),
                    )
                };
                let _ = job.reply.send(reply);
                continue;
            }
            if !s.ready {
                let body = json!({"error":s.error,"id":job.command.id,"status":"not_submitted"});
                s.pending.remove(&job.command.id);
                s.unresolved.insert(job.command.id.clone(), body.clone());
                let _ = job.reply.send((503, body));
                continue;
            }
            Record::Execution {
                schema: 1,
                events: effects(&s, &job.command),
                command: job.command,
            }
        };
        let id = match &record {
            Record::Execution { command, .. } => &command.id,
            _ => unreachable!(),
        };
        let result = append(&agent, &proxy, &record, id)
            .and_then(|offset| replay_through(&agent, &proxy, &state, offset));
        match result {
            Ok(()) => {
                let s = state.lock();
                let _ = job.reply.send((200, json!(s.operations.get(id))));
            }
            Err(e) => {
                let body = json!({"id":id,"status":"outcome_unknown","error":e,"guidance":"Inspect this operation ID after restart; do not submit a new ID"});
                {
                    let mut s = state.lock();
                    s.ready = false;
                    s.error = Some(e);
                    s.pending.remove(id);
                    s.unresolved.insert(id.clone(), body.clone());
                }
                let _ = job.reply.send((503, body));
            }
        }
    }
}
fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name, value).unwrap()
}
fn respond(req: Request, code: u16, body: impl AsRef<[u8]>, mime: &str) {
    let length = body.as_ref().len();
    let _ = req.respond(Response::new(tiny_http::StatusCode(code), Vec::new(), std::io::Cursor::new(body), Some(length), None).with_header(header("Content-Type", mime))
        .with_header(header("Cache-Control", "no-store"))
        .with_header(header("X-Content-Type-Options", "nosniff"))
        .with_header(header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")));
}
fn handle(mut req: Request, state: Shared, jobs: mpsc::SyncSender<Job>) {
    let path = req.url().split('?').next().unwrap_or("/").to_owned();
    if req.method() == &Method::Get || req.method() == &Method::Head {
        let static_file = match path.as_str() {
            "/" => Some((
                include_str!("../public/index.html"),
                "text/html; charset=utf-8",
            )),
            "/app.js" => Some((
                include_str!("../public/app.js"),
                "text/javascript; charset=utf-8",
            )),
            "/style.css" => Some((
                include_str!("../public/style.css"),
                "text/css; charset=utf-8",
            )),
            "/favicon.svg" => Some((
                include_str!("../public/favicon.svg"),
                "image/svg+xml; charset=utf-8",
            )),
            _ => None,
        };
        if let Some((body, mime)) = static_file {
            respond(req, 200, body, mime);
            return;
        }
    }
    if req.method() == &Method::Get {
        let s = state.lock();
        let (code, value) = if path == "/health" {
            (
                if s.ready { 200 } else { 503 },
                json!({"ready":s.ready,"error":s.error,"next_offset":s.next_offset}),
            )
        } else if path == "/api/state" {
            (
                200,
                json!({"ready":s.ready,"error":s.error,"next_offset":s.next_offset,"topic":TOPIC,"commodities":commodities(),"orders":s.orders.values().collect::<Vec<_>>(),"operations":s.operations.values().collect::<Vec<_>>(),"trades":s.trades}),
            )
        } else if path == "/api/trades" {
            (200, json!(s.trades))
        } else if let Some(id) = path.strip_prefix("/api/orders/") {
            match s.orders.get(id) {
                Some(order) => (200, json!(order)),
                None => (404, json!({"error":"Order not found"})),
            }
        } else if let Some(id) = path.strip_prefix("/api/operations/") {
            match s.operations.get(id) {
                Some(op) => (200, json!(op)),
                None => {
                    if let Some(outcome) = s.unresolved.get(id) {
                        (503, outcome.clone())
                    } else if s.pending.contains_key(id) {
                        (202, json!({"id":id,"status":"pending"}))
                    } else {
                        (
                            404,
                            json!({"id":id,"status":"not_observed","guidance":"Not proof of non-publication when readiness is false"}),
                        )
                    }
                }
            }
        } else if path == "/metrics" {
            let body = format!("# TYPE exchange_ready gauge\nexchange_ready {}\n# TYPE exchange_log_next_offset gauge\nexchange_log_next_offset {}\n# TYPE exchange_operations_total counter\nexchange_operations_total {}\n# TYPE exchange_rejected_total counter\nexchange_rejected_total {}\n# TYPE exchange_trades_total counter\nexchange_trades_total {}\n# TYPE exchange_open_orders gauge\nexchange_open_orders {}\n", u8::from(s.ready), s.next_offset, s.operations.len(), s.operations.values().filter(|o| o.status == "rejected").count(), s.trades.len(), s.orders.values().filter(|o| o.remaining > 0 && o.status != "cancelled").count());
            respond(req, 200, body, "text/plain; version=0.0.4");
            return;
        } else {
            (404, json!({"error":"Not found"}))
        };
        respond(req, code, value.to_string(), "application/json");
        return;
    }
    if req.method() != &Method::Post || path != "/api/commands" {
        respond(
            req,
            405,
            json!({"error":"Method not allowed"}).to_string(),
            "application/json",
        );
        return;
    }
    let get_header = |name: &'static str| {
        req.headers()
            .iter()
            .find(|h| h.field.equiv(name))
            .map(|h| h.value.as_str())
    };
    let content_ok = get_header("Content-Type")
        .map(|v| v.split(';').next() == Some("application/json"))
        .unwrap_or(false);
    // Host equality alone accepts a DNS-rebinding name that resolves to loopback.
    let origin_ok = get_header("Origin")
        .map(|origin| {
            get_header("Host")
                .map(|host| origin == format!("http://{host}") && loopback_host(host))
                .unwrap_or(false)
        })
        .unwrap_or(true);
    if !content_ok || !origin_ok {
        respond(
            req,
            403,
            json!({"error":"Use same-origin application/json requests"}).to_string(),
            "application/json",
        );
        return;
    }
    let mut bytes = Vec::new();
    if req
        .as_reader()
        .take(MAX_BODY + 1)
        .read_to_end(&mut bytes)
        .is_err()
        || bytes.len() as u64 > MAX_BODY
    {
        respond(
            req,
            413,
            json!({"error":"Body limit is 16 KiB"}).to_string(),
            "application/json",
        );
        return;
    }
    let command: Command = match serde_json::from_slice(&bytes) {
        Ok(c) => c,
        Err(e) => {
            respond(
                req,
                400,
                json!({"error":e.to_string()}).to_string(),
                "application/json",
            );
            return;
        }
    };
    if !valid_id(&command.id) {
        respond(
            req,
            400,
            json!({"error":"id must be 1..96 ASCII letters, digits, dot, underscore or hyphen"})
                .to_string(),
            "application/json",
        );
        return;
    }
    {
        let mut s = state.lock();
        if let Some(op) = s.operations.get(&command.id) {
            let result = if op.command == command {
                (200, json!(op))
            } else {
                (
                    409,
                    json!({"error":"Operation ID already belongs to a different command"}),
                )
            };
            respond(req, result.0, result.1.to_string(), "application/json");
            return;
        }
        if !s.ready {
            respond(
                req,
                503,
                json!({"error":s.error,"status":"unavailable"}).to_string(),
                "application/json",
            );
            return;
        }
        if let Some(existing) = s.pending.get(&command.id) {
            let result = if existing == &command {
                (202, json!({"id":command.id,"status":"pending"}))
            } else {
                (
                    409,
                    json!({"error":"Operation ID is pending with a different command"}),
                )
            };
            respond(req, result.0, result.1.to_string(), "application/json");
            return;
        }
        s.pending.insert(command.id.clone(), command.clone());
    }
    let id = command.id.clone();
    let (tx, rx) = mpsc::sync_channel(1);
    if jobs.try_send(Job { command, reply: tx }).is_err() {
        state.lock().pending.remove(&id);
        respond(
            req,
            503,
            json!({"id":id,"status":"not_submitted","error":"Engine queue is full"}).to_string(),
            "application/json",
        );
        return;
    }
    let (code, body) = rx.recv_timeout(Duration::from_secs(20)).unwrap_or_else(|_| (202, json!({"id":id,"status":"pending","guidance":"Poll this ID; do not resubmit with a new ID"})));
    respond(req, code, body.to_string(), "application/json");
}
fn serve() -> Result<(), String> {
    let state = Arc::new(Mutex::new(State::default()));
    let (tx, rx) = mpsc::sync_channel(64);
    let engine_state = state.clone();
    let proxy = env::var("REDPANDA_PROXY_URL")
        .unwrap_or_else(|_| "http://redpanda:8082".into())
        .trim_end_matches('/')
        .to_owned();
    thread::spawn(move || engine(engine_state, rx, proxy));
    let server = Server::http("0.0.0.0:3000").map_err(|e| e.to_string())?;
    let active = Arc::new(AtomicUsize::new(0));
    eprintln!("commodity-exchange listening on :3000; authoritative topic {TOPIC}");
    for req in server.incoming_requests() {
        if active.fetch_add(1, Ordering::SeqCst) >= 96 {
            active.fetch_sub(1, Ordering::SeqCst);
            respond(
                req,
                503,
                "{\"error\":\"Too many concurrent requests\"}",
                "application/json",
            );
            continue;
        }
        let (state, tx, active) = (state.clone(), tx.clone(), active.clone());
        thread::spawn(move || {
            handle(req, state, tx);
            active.fetch_sub(1, Ordering::SeqCst);
        });
    }
    Ok(())
}
fn cli(args: &[String]) -> Result<i32, String> {
    let base = env::var("EXCHANGE_URL").unwrap_or_else(|_| "http://127.0.0.1:3000".into());
    let usage = "commodity-exchange serve | book | trades | status OPERATION_ID | order-status ORDER_ID | order --id ID --commodity WHEAT --side buy --price-ticks 24500 --quantity 10 | cancel --id ID --order-id ORDER_ID\nEXCHANGE_URL defaults to http://127.0.0.1:3000. JSON output; exit 2=rejected, 3=pending/unknown.";
    let action = args.first().map(String::as_str).unwrap_or("help");
    if matches!(action, "help" | "--help" | "-h") {
        println!("{usage}");
        return Ok(0);
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(25))
        .build();
    let result = match action {
        "book" | "trades" if args.len() == 1 => agent
            .get(&format!(
                "{base}/api/{}",
                if action == "book" { "state" } else { "trades" }
            ))
            .call(),
        "status" | "order-status" if args.len() == 2 && valid_id(&args[1]) => agent
            .get(&format!(
                "{base}/api/{}/{}",
                if action == "status" {
                    "operations"
                } else {
                    "orders"
                },
                args[1]
            ))
            .call(),
        "order" | "cancel" => {
            if args.len() % 2 != 1 {
                return Err(usage.into());
            }
            let mut fields = BTreeMap::new();
            for pair in args[1..].as_chunks::<2>().0 {
                if !matches!(
                    pair[0].as_str(),
                    "--id"
                        | "--commodity"
                        | "--side"
                        | "--price-ticks"
                        | "--quantity"
                        | "--order-id"
                ) || fields.insert(pair[0].as_str(), pair[1].as_str()).is_some()
                {
                    return Err(format!("Unknown or repeated option {}", pair[0]));
                }
            }
            let field = |key: &str| fields.get(key).copied().unwrap_or("");
            let number = |key: &str| -> Result<i64, String> {
                if field(key).is_empty() {
                    Ok(0)
                } else {
                    field(key)
                        .parse()
                        .map_err(|_| format!("{key} must be an integer"))
                }
            };
            let c = Command {
                id: field("--id").into(),
                action: action.into(),
                commodity: field("--commodity").into(),
                side: field("--side").into(),
                price_ticks: number("--price-ticks")?,
                quantity: number("--quantity")?,
                order_id: field("--order-id").into(),
            };
            if !valid_id(&c.id) {
                return Err(
                    "Supply a stable --id (letters, digits, dot, underscore or hyphen)".into(),
                );
            }
            agent
                .post(&format!("{base}/api/commands"))
                .set("Content-Type", "application/json")
                .send_json(json!(c))
        }
        _ => return Err(usage.into()),
    };
    let (http, value): (u16, Value) = match result {
        Ok(response) => (
            response.status(),
            response.into_json().map_err(|e| e.to_string())?,
        ),
        Err(ureq::Error::Status(code, response)) => {
            (code, response.into_json().map_err(|e| e.to_string())?)
        }
        Err(e) => {
            return Err(format!(
                "Transport failure: {e}. Inspect the same operation ID before any retry."
            ))
        }
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?
    );
    Ok(if value["status"] == "rejected" {
        2
    } else if http == 202 || http >= 500 {
        3
    } else if http >= 400 {
        1
    } else {
        0
    })
}
fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let result = if args.first().map(String::as_str) == Some("serve") {
        serve().map(|_| 0)
    } else {
        cli(&args)
    };
    match result {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
