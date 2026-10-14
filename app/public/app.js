"use strict";

(() => {
  const button = document.getElementById("theme");
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const modes = ["system", "light", "dark"];
  const storageKey = "signal-harbor-theme";
  let preference = "system";
  try {
    const saved = localStorage.getItem(storageKey);
    if (modes.includes(saved)) preference = saved;
  } catch {
    // Storage is optional; the in-memory preference still works.
  }
  function applyTheme() {
    const appearance = preference === "system" ? (system.matches ? "dark" : "light") : preference;
    root.dataset.theme = appearance;
    button.textContent = `Theme: ${preference}${preference === "system" ? ` (${appearance})` : ""}`;
    button.title = `Switch to ${modes[(modes.indexOf(preference) + 1) % modes.length]} theme`;
  }
  button.addEventListener("click", () => {
    preference = modes[(modes.indexOf(preference) + 1) % modes.length];
    applyTheme();
    try {
      localStorage.setItem(storageKey, preference);
    } catch {
      // Continue without persistence when storage is denied.
    }
  });
  system.addEventListener("change", () => {
    if (preference === "system") applyTheme();
  });
  applyTheme();
})();

"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const number = new Intl.NumberFormat();
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const state = {
    snapshot: null,
    healthy: false,
    updatedAt: null,
    viewPaused: false,
    mutationPending: false,
    fetching: false,
    statsFlight: null,
    pollTimer: null,
    records: new Map(),
    recentSignature: null,
    partitionSignature: null,
  };

  class ApiError extends Error {
    constructor(message, status = null) {
      super(message);
      this.status = status;
    }
  }

  async function request(path, body) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 12000);
    const mutation = body !== undefined;
    try {
      const response = await fetch(path, {
        method: mutation ? "POST" : "GET",
        headers: mutation ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" },
        body: mutation ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new ApiError(`The API returned an unreadable response (HTTP ${response.status}).`, response.ok ? null : response.status);
      }
      if (!response.ok) {
        throw new ApiError(typeof data?.error === "string" ? data.error : `The API returned HTTP ${response.status}.`, response.status);
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError("The request timed out after 12 seconds.");
      throw new ApiError("The API could not be reached.");
    } finally {
      clearTimeout(deadline);
    }
  }

  function setText(id, text) {
    const element = byId(id);
    if (element.textContent !== text) element.textContent = text;
  }

  function pill(id, label, tone = "") {
    const element = byId(id);
    setText(id, label);
    element.className = `status-pill ${tone}`.trim();
  }

  function notice(id, text) {
    const element = byId(id);
    setText(id, text || "");
    element.hidden = !text;
  }

  function result(id, text, tone = "") {
    setText(id, text);
    byId(id).className = `action-result ${tone}`.trim();
  }

  function updateSnapshotStatus() {
    if (state.viewPaused) {
      setText("snapshot-status", "Live updates paused. Resume live updates to use the event controls.");
    } else if (!state.updatedAt) {
      setText("snapshot-status", state.healthy ? "Waiting for the cluster to become ready." : "Waiting for the first snapshot.");
    } else {
      const prefix = state.healthy ? "Snapshot" : "Last known snapshot";
      setText("snapshot-status", `${prefix} at ${time.format(state.updatedAt)} · ${state.healthy ? "refreshing every 2 seconds" : "API unavailable; checking every 2 seconds"}`);
    }
  }

  function syncControls() {
    const enabled = Boolean(state.snapshot?.ready && state.healthy && !state.viewPaused && !state.mutationPending);
    const running = Boolean(state.snapshot?.generator?.running);
    byId("producer-fields").disabled = !enabled;
    byId("generator-fields").disabled = !enabled || running;
    byId("consumer-button").disabled = !enabled;
    byId("generator-stop").disabled = !enabled || !running;
    byId("refresh-button").disabled = state.fetching || state.mutationPending;
    byId("live-button").disabled = state.mutationPending;
    byId("live-button").setAttribute("aria-pressed", String(state.viewPaused));
    setText("live-button", state.viewPaused ? "Resume live updates" : "Pause live updates");
    updateSnapshotStatus();
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function displayTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Time unavailable" : time.format(date);
  }

  function makeRecord(record) {
    const details = element("details", "record");
    const summary = element("summary");
    const heading = element("span", "record-heading");
    heading.append(element("span", "record-kind", record.kind), element("span", "record-source", record.source));
    const meta = element("span", "record-meta");
    const key = element("span");
    key.append("Key ", element("code", "", record.key || "(no key)"));
    const position = element("span");
    position.append(`Partition ${record.partition} · Offset `, element("code", "", record.offset));
    const consumed = element("span", "", `Consumed ${displayTime(record.consumedAt)}`);
    meta.append(key, position, consumed);
    summary.append(heading, meta);
    const body = element("div", "record-body");
    body.append(element("p", "", `Event ${record.id} · Created ${record.createdAt} · Consumed ${record.consumedAt}`));
    body.append(element("pre", "", JSON.stringify(record.payload, null, 2)));
    details.append(summary, body);
    return details;
  }

  function renderRecords(recent, paused) {
    const records = recent.slice(0, 100).sort((a, b) => {
      const difference = new Date(b.consumedAt).getTime() - new Date(a.consumedAt).getTime();
      return Number.isFinite(difference) ? difference : 0;
    });
    setText("records-count", number.format(records.length));
    const empty = byId("records-empty");
    empty.hidden = records.length > 0;
    byId("records-list").hidden = records.length === 0;
    if (!records.length) {
      empty.querySelector("h3").textContent = paused ? "The consumer is paused" : "No consumed records yet";
      empty.querySelector("p").textContent = paused ? "Produce an event, then resume the consumer to read the backlog." : "Produce an event above or start the generator to fill this stream.";
    }
    const signature = JSON.stringify(records);
    if (signature === state.recentSignature) return;
    state.recentSignature = signature;
    const list = byId("records-list");
    const retained = new Set();
    records.forEach((record, index) => {
      const id = String(record.id);
      retained.add(id);
      const fingerprint = JSON.stringify(record);
      let entry = state.records.get(id);
      if (!entry || entry.fingerprint !== fingerprint) {
        const node = makeRecord(record);
        if (entry) {
          node.open = entry.node.open;
          entry.node.replaceWith(node);
        }
        entry = { node, fingerprint };
        state.records.set(id, entry);
      }
      // Preserve unchanged details elements, including their open state and focus.
      if (list.children[index] !== entry.node) list.insertBefore(entry.node, list.children[index] || null);
    });
    for (const [id, entry] of state.records) {
      if (!retained.has(id)) {
        entry.node.remove();
        state.records.delete(id);
      }
    }
  }

  function renderPartitions(partitions) {
    const signature = JSON.stringify(partitions);
    if (signature === state.partitionSignature) return;
    state.partitionSignature = signature;
    const fragment = document.createDocumentFragment();
    if (!partitions.length) fragment.append(element("p", "muted", "No partition offsets available yet. Refresh stats after the cluster is ready."));
    partitions.forEach((partition) => {
      const card = element("article", "partition");
      card.append(element("h3", "", `Partition ${partition.partition}`));
      const values = element("dl");
      [["High", partition.high], ["Committed", partition.committed], ["Lag", number.format(partition.lag)]].forEach(([label, value]) => {
        const pair = element("div");
        pair.append(element("dt", "", label), element("dd", "offset-value", value));
        values.append(pair);
      });
      card.append(values);
      fragment.append(card);
    });
    byId("partition-list").replaceChildren(fragment);
  }

  function renderLinks(links) {
    const names = { console: "console-link", grafana: "grafana-link", prometheus: "prometheus-link", registry: "registry-link" };
    for (const [key, id] of Object.entries(names)) {
      const link = byId(id);
      try {
        if (typeof links[key] !== "string" || !links[key]) throw new Error("Missing link");
        const url = new URL(links[key], window.location.href);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported protocol");
        link.href = url.href;
        link.removeAttribute("aria-disabled");
        link.removeAttribute("title");
      } catch {
        link.removeAttribute("href");
        link.setAttribute("aria-disabled", "true");
        link.title = "Tool URL unavailable; refresh stats after the API is ready.";
      }
    }
    byId("tool-links").hidden = false;
    byId("tools-loading").hidden = true;
  }

  function renderSnapshot(snapshot) {
    state.snapshot = snapshot;
    state.healthy = true;
    state.updatedAt = new Date();
    notice("connection-error", "");
    pill("connection-status", snapshot.ready ? "Connected" : "Cluster starting", snapshot.ready ? "success" : "warning");
    setText("broker-count", `${number.format(snapshot.brokers.length)} brokers discovered`);
    setText("brokers-detail", snapshot.brokers.length ? `Discovered brokers: ${snapshot.brokers.map((broker) => `${broker.nodeId} · ${broker.host}:${broker.port}`).join(" / ")}` : "No brokers discovered yet. Check the broker containers, then refresh stats.");
    setText("produced-value", number.format(snapshot.produced));
    setText("consumed-value", number.format(snapshot.consumed));
    setText("lag-value", snapshot.lag === null ? "Unavailable" : number.format(snapshot.lag));
    setText("lag-caption", snapshot.lag === null ? "Committed offsets could not be read" : "High offsets minus group positions");
    notice("lag-error", snapshot.lagError ? `Committed lag unavailable: ${snapshot.lagError} Check broker health and group offsets in Redpanda Console, then refresh stats.` : "");
    notice("backend-error", snapshot.lastError ? `Last backend error: ${snapshot.lastError} Check the app and broker logs before repeating an action; a failed send may have reached the brokers.` : "");
    const paused = Boolean(snapshot.paused);
    pill("consumer-status", paused ? "Paused" : "Consuming", paused ? "warning" : "success");
    setText("consumer-button", paused ? "Resume consumer" : "Pause consumer");
    setText("consumer-explanation", paused ? "The shared Kafka consumer is paused. New events stay on the brokers; resume to drain the backlog." : "Pause the actual Kafka consumer, not just this view. Resume to drain the backlog.");
    const generator = snapshot.generator;
    pill("generator-status", generator.running ? "Running" : "Idle", generator.running ? "warning" : "");
    byId("generator-running").hidden = !generator.running;
    setText("generator-progress", `${number.format(generator.rate)} events / second · ${number.format(Math.max(0, Math.ceil(generator.remainingSeconds)))} seconds remaining`);
    renderRecords(snapshot.recent, paused);
    renderPartitions(snapshot.partitions);
    renderLinks(snapshot.links);
  }

  async function readSnapshot(allowWhilePaused) {
    try {
      const snapshot = await request("/api/stats");
      if (state.viewPaused && !allowWhilePaused) return;
      if (!snapshot || typeof snapshot.ready !== "boolean" || !Array.isArray(snapshot.recent) || !Array.isArray(snapshot.partitions) || !Array.isArray(snapshot.brokers) || !snapshot.generator || !snapshot.links) {
        throw new ApiError("The API returned an incomplete stats snapshot.");
      }
      renderSnapshot(snapshot);
    } catch (error) {
      if (state.viewPaused && !allowWhilePaused) return;
      state.healthy = false;
      pill("connection-status", "API unavailable", "error");
      notice("connection-error", `${error.message} Check that the app and broker containers are running and inspect their logs. Use Refresh stats after recovery. Existing values are last known; event actions are disabled.`);
      if (!state.snapshot) {
        byId("records-empty").querySelector("h3").textContent = "The stream is unavailable";
        byId("records-empty").querySelector("p").textContent = "Recover the API connection, then refresh stats to read the stream.";
      }
    }
  }

  function refreshStats(allowWhilePaused = false) {
    if (state.statsFlight) return state.statsFlight;
    state.fetching = true;
    syncControls();
    state.statsFlight = readSnapshot(allowWhilePaused).finally(() => {
      state.fetching = false;
      state.statsFlight = null;
      syncControls();
    });
    return state.statsFlight;
  }

  function schedulePoll() {
    clearTimeout(state.pollTimer);
    if (!state.viewPaused && !document.hidden) state.pollTimer = setTimeout(poll, 2000);
  }

  async function poll() {
    clearTimeout(state.pollTimer);
    if (state.viewPaused || document.hidden) return;
    if (!state.mutationPending) await refreshStats();
    schedulePoll();
  }

  async function mutate(path, body, region, pendingText, successMessage) {
    if (state.mutationPending || !state.healthy || !state.snapshot?.ready || state.viewPaused) return;
    state.mutationPending = true;
    syncControls();
    result(region, pendingText);
    try {
      const response = await request(path, body);
      result(region, successMessage(response), "success");
      // Finish an older GET first so the post-action snapshot cannot be stale.
      if (state.statsFlight) await state.statsFlight;
      await refreshStats();
    } catch (error) {
      const unknown = error.status === null || error.status >= 500;
      const recovery = unknown
        ? "Outcome unknown: the action may have completed. Refresh stats and inspect Redpanda Console before submitting again. No automatic retry was made."
        : "Check the inputs and current state, refresh stats, then submit again only when ready. No automatic retry was made.";
      result(region, `${error.message} ${recovery}`, "error");
      if (unknown) {
        state.healthy = false;
        pill("connection-status", "Check action outcome", "warning");
        notice("connection-error", "An action returned an unknown outcome. Refresh stats to recover the connection and check its state. Inspect Redpanda Console for a produced event before sending it again.");
      }
    } finally {
      state.mutationPending = false;
      syncControls();
      schedulePoll();
    }
  }

  byId("producer-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const payloadField = byId("event-payload");
    payloadField.removeAttribute("aria-invalid");
    notice("payload-error", "");
    let payload;
    try {
      payload = JSON.parse(payloadField.value);
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Use a JSON object enclosed in { }.");
    } catch (error) {
      payloadField.setAttribute("aria-invalid", "true");
      notice("payload-error", `Cannot produce this payload. ${error instanceof SyntaxError ? "Use valid JSON with double-quoted property names and no trailing commas." : error.message}`);
      result("produce-result", "Fix the JSON payload before producing an event. Nothing was sent.", "error");
      payloadField.focus();
      return;
    }
    mutate("/api/produce", { key: byId("event-key").value, kind: byId("event-kind").value, payload }, "produce-result", "Producing event; waiting for broker acknowledgement…", (response) => `Produced event ${response.id} · Partition ${response.partition} · Offset ${response.offset}. Broker acknowledgement received; consumption and commit can follow later.`);
  });

  byId("event-payload").addEventListener("input", () => {
    byId("event-payload").removeAttribute("aria-invalid");
    notice("payload-error", "");
  });

  byId("generator-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const rate = Number(byId("generator-rate").value);
    const duration = Number(byId("generator-duration").value);
    if (!Number.isInteger(rate) || rate < 1 || rate > 100 || !Number.isInteger(duration) || duration < 1 || duration > 300) {
      result("generator-result", "Use a whole-number rate from 1 to 100 and a duration from 1 to 300 seconds. Nothing was sent.", "error");
      byId("generator-form").reportValidity();
      return;
    }
    mutate("/api/generator", { rate, duration }, "generator-result", "Starting bounded traffic generation…", () => `Generator started at ${number.format(rate)} events / second for ${number.format(duration)} seconds.`);
  });

  byId("generator-stop").addEventListener("click", () => {
    mutate("/api/generator/stop", {}, "generator-result", "Stopping future generator sends…", () => "Generator stopped. In-flight sends may still complete.");
  });

  byId("consumer-button").addEventListener("click", () => {
    const paused = !state.snapshot.paused;
    mutate("/api/consumer", { paused }, "consumer-result", paused ? "Pausing the shared Kafka consumer…" : "Resuming the shared Kafka consumer…", (response) => response.paused ? "Shared consumer paused. In-flight reads and commits can still complete." : "Shared consumer resumed. Waiting records can now be consumed.");
  });

  byId("refresh-button").addEventListener("click", async () => {
    await refreshStats(true);
    schedulePoll();
  });

  byId("live-button").addEventListener("click", () => {
    state.viewPaused = !state.viewPaused;
    clearTimeout(state.pollTimer);
    syncControls();
    if (!state.viewPaused) poll();
  });

  document.addEventListener("visibilitychange", () => {
    clearTimeout(state.pollTimer);
    if (!document.hidden && !state.viewPaused) poll();
  });

  window.addEventListener("pagehide", () => clearTimeout(state.pollTimer));
  syncControls();
  poll();
})();
