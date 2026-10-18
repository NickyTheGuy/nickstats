(() => {
  "use strict";
  const ENDPOINT = "/nickstats/api/auth/manual-filters";
  const states = ["true", "false", "unknown"];
  const isNumeric = tag => tag.kind === "number";
  const numeric = value => typeof value === "number" && Number.isFinite(value);
  const displayName = tag => tag.owner && tag.owner !== store.account ? `${tag.name} · ${tag.owner}` : tag.name;
  function conditionMatches(value, condition) {
    if (typeof condition === "string") return value === condition;
    if (!numeric(value) || !numeric(condition?.value)) return false;
    switch (condition.op) {
      case "gt": return value > condition.value;
      case "gte": return value >= condition.value;
      case "lt": return value < condition.value;
      case "lte": return value <= condition.value;
      case "eq": return value === condition.value;
      case "between": return numeric(condition.max) && value >= condition.value && value <= condition.max;
      default: return false;
    }
  }
  const label = value => value[0].toUpperCase() + value.slice(1);
  const el = (tag, text = null, className = "") => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  // IDs, rather than played dates or first observation, define upload order.
  function matchState(filter, matchID, assignments) {
    const explicit = assignments.get(`${filter.id}:${matchID}`);
    if (isNumeric(filter)) return numeric(explicit) ? explicit : "unknown";
    if (states.includes(explicit)) return explicit;
    try { return BigInt(matchID) > BigInt(filter.cutoff_match_id) ? "false" : "unknown"; }
    catch (_) { return "unknown"; }
  }

  class ManualFilterStore {
    constructor({ request = (...args) => fetch(...args) } = {}) {
      this.request = request; this.account = null; this.filters = []; this.assignments = new Map();
      this.supportsSharing = false; this.supportsNumeric = false; this.ready = false; this.loading = false; this.error = ""; this.version = 0; this.epoch = 0;
      this.listeners = new Set(); this.pending = new Set();
    }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit() { this.version += 1; this.listeners.forEach(listener => listener()); }
    async json(path = "", options = {}) {
      const response = await this.request(`${ENDPOINT}${path}`, {
        credentials: "same-origin", cache: "no-store", ...options,
        headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) }
      });
      const body = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.reason || `Tags returned HTTP ${response.status}.`);
      return body;
    }
    setAccount(username) {
      const next = username || null;
      if (next === this.account) return;
      this.epoch += 1; this.account = next; this.filters = []; this.assignments.clear(); this.pending.clear();
      this.supportsSharing = false; this.supportsNumeric = false; this.ready = false; this.loading = false; this.error = ""; this.emit();
      if (next) this.load();
    }
    async load() {
      if (!this.account || this.loading || this.pending.size) return;
      const epoch = this.epoch; this.loading = true; this.error = ""; this.emit();
      try {
        const body = await this.json();
        if (epoch !== this.epoch) return;
        if (!Array.isArray(body?.filters) || !Array.isArray(body?.assignments)) throw new Error("Could not read tags.");
        this.filters = body.filters; this.supportsNumeric = body.supports_numeric === true; this.supportsSharing = body.supports_sharing === true;
        this.assignments = new Map(body.assignments.map(row => [`${row.filter_id}:${row.match_id}`, numeric(row.value) ? row.value : row.state]));
        this.ready = true;
      } catch (error) { if (epoch === this.epoch) this.error = error.message; }
      finally { if (epoch === this.epoch) { this.loading = false; this.emit(); } }
    }
    stateFor(filter, matchID) { return matchState(filter, matchID, this.assignments); }
    async mutate(key, path, method, body, apply) {
      if (!this.account || !this.ready || this.loading || this.pending.has(key)) return false;
      const epoch = this.epoch; this.pending.add(key); this.error = ""; this.emit();
      try {
        const result = await this.json(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
        if (epoch !== this.epoch) return false;
        apply(result); return true;
      } catch (error) { if (epoch === this.epoch) this.error = error.message; return false; }
      finally { if (epoch === this.epoch) { this.pending.delete(key); this.emit(); } }
    }
    create(name, kind = "boolean") {
      if (kind === "number" && !this.supportsNumeric) return Promise.resolve(false);
      return this.mutate("create", "", "POST", { name, kind }, filter => {
        this.filters.push(filter); this.filters.sort((a, b) => a.name.localeCompare(b.name));
      });
    }
    canEdit(tag) { return Boolean(this.account && tag && (!tag.owner || tag.owner === this.account)); }
    share(id, username, revoke = false) {
      if (!this.supportsSharing || !this.canEdit(this.filters.find(tag => tag.id === id))) return Promise.resolve(false);
      const path = `/${encodeURIComponent(id)}/shares${revoke ? `/${encodeURIComponent(username)}` : ""}`;
      return this.mutate(id, path, revoke ? "DELETE" : "PUT", revoke ? null : { username }, body => {
        this.filters = body.filters;
        this.assignments = new Map(body.assignments.map(row => [`${row.filter_id}:${row.match_id}`, numeric(row.value) ? row.value : row.state]));
      });
    }
    remove(id) {
      const tag = this.filters.find(tag => tag.id === id);
      if (tag && !this.canEdit(tag)) return Promise.resolve(false);
      return this.mutate(id, `/${encodeURIComponent(id)}`, "DELETE", null, () => {
        this.filters = this.filters.filter(filter => filter.id !== id);
        for (const key of this.assignments.keys()) if (key.startsWith(`${id}:`)) this.assignments.delete(key);
      });
    }
    assign(id, matchID, state) {
      const filter = this.filters.find(filter => filter.id === id);
      if (filter && !this.canEdit(filter)) return Promise.resolve(false);
      if (isNumeric(filter || {}) ? !numeric(state) && state !== "unknown" : !states.includes(state)) return Promise.resolve(false);
      return this.mutate(id, `/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchID)}`, "PUT", numeric(state) ? { state: "true", value: state } : { state }, row => {
        this.assignments.set(`${row.filter_id}:${row.match_id}`, numeric(row.value) ? row.value : row.state);
      });
    }
  }

  const store = new ManualFilterStore();

  function createForm() {
    const form = el("form", null, "manual-filter-create manual-tag-create");
    const input = el("input"); input.type = "text"; input.maxLength = 64; input.required = true;
    input.placeholder = "New tag name"; input.setAttribute("aria-label", "New tag name");
    const kind = el("select"); kind.setAttribute("aria-label", "Tag type");
    for (const [value, text] of [["boolean", "True/False"], ["number", "Number"]]) {
      const option = el("option", text); option.value = value; option.disabled = value === "number" && !store.supportsNumeric; kind.appendChild(option);
    }
    const add = el("button", "+ Add", "button button-secondary"); add.type = "submit";
    add.disabled = !store.ready || store.loading || store.pending.has("create");
    form.append(input, kind, add);
    form.addEventListener("submit", async event => {
      event.preventDefault(); const name = input.value.trim(); if (!name) return;
      add.disabled = true;
      if (await store.create(name, kind.value)) input.value = "";
      else { add.disabled = false; input.focus(); }
    });
    return form;
  }

  function matchEditor(match) {
    if (!store.account || !store.ready) return null;
    const details = el("details", null, "manual-match-menu");
    const summary = el("summary", "⋯"); summary.setAttribute("aria-label", `Tags for match ${match.id}`);
    details.appendChild(summary);
    const panel = el("div", null, "map-filter-options manual-match-options");
    panel.appendChild(el("strong", `Match #${match.id} · Tags`));
    panel.appendChild(el("p", "Edit your tags here. Shared tags are read-only.", "manual-filter-help"));
    store.filters.forEach(filter => {
      const row = el("div", null, "manual-match-state"), name = el("span", displayName(filter));
      const choices = el("div", null, "side-toggle"); choices.setAttribute("role", "group"); choices.setAttribute("aria-label", filter.name);
      const current = store.stateFor(filter, match.id);
      if (!store.canEdit(filter)) {
        row.append(name, el("span", numeric(current) ? String(current) : label(current), "manual-filter-help"));
        panel.appendChild(row); return;
      }
      if (isNumeric(filter)) {
        const form = el("form", null, "manual-tag-value"), input = el("input");
        input.type = "number"; input.step = "any"; input.value = numeric(current) ? current : "";
        input.placeholder = "Unknown"; input.setAttribute("aria-label", `${filter.name} value`);
        const save = el("button", "Save", "button button-secondary"); save.type = "submit";
        save.disabled = store.pending.has(filter.id);
        form.append(input, save);
        form.addEventListener("submit", event => {
          event.preventDefault(); event.stopPropagation();
          if (!input.checkValidity()) return;
          store.assign(filter.id, match.id, input.value.trim() === "" ? "unknown" : Number(input.value));
        });
        row.append(name, form); panel.appendChild(row); return;
      }
      states.forEach(value => {
        const button = el("button", label(value), current === value ? "active" : ""); button.type = "button";
        button.setAttribute("aria-pressed", String(current === value)); button.disabled = store.pending.has(filter.id);
        button.addEventListener("click", event => { event.stopPropagation(); store.assign(filter.id, match.id, value); }); choices.appendChild(button);
      });
      row.append(name, choices); panel.appendChild(row);
    });
    if (!store.filters.length) panel.appendChild(el("p", "Create a tag to start labeling matches.", "manual-filter-help"));
    if (store.error) { const error = el("p", store.error, "manual-filter-error"); error.setAttribute("role", "alert"); panel.appendChild(error); }
    panel.appendChild(createForm()); details.appendChild(panel);
    details.addEventListener("toggle", () => {
      if (details.open && details.isConnected) document.querySelectorAll(".manual-match-menu[open]").forEach(other => { if (other !== details) other.open = false; });
    });
    return details;
  }
  document.addEventListener("click", event => {
    document.querySelectorAll(".manual-match-menu[open]").forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
  });
  window.addEventListener("nickstats:account-session", () => store.setAccount(window.NickStatsAccountSession?.username));
  window.addEventListener("focus", () => store.load());
  window.NickStatsManualFilters = Object.freeze({ store, ManualFilterStore, matchState, conditionMatches, displayName, matchEditor });
})();
