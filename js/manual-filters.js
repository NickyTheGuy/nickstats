(() => {
  "use strict";
  const ENDPOINT = "/nickstats/api/auth/manual-filters";
  const states = ["true", "false", "unknown"];
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
    if (states.includes(explicit)) return explicit;
    try { return BigInt(matchID) > BigInt(filter.cutoff_match_id) ? "false" : "unknown"; }
    catch (_) { return "unknown"; }
  }

  class ManualFilterStore {
    constructor({ request = (...args) => fetch(...args) } = {}) {
      this.request = request; this.account = null; this.filters = []; this.assignments = new Map();
      this.ready = false; this.loading = false; this.error = ""; this.version = 0; this.epoch = 0;
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
      if (!response.ok) throw new Error(body?.reason || `Manual filters returned HTTP ${response.status}.`);
      return body;
    }
    setAccount(username) {
      const next = username || null;
      if (next === this.account) return;
      this.epoch += 1; this.account = next; this.filters = []; this.assignments.clear(); this.pending.clear();
      this.ready = false; this.loading = false; this.error = ""; this.emit();
      if (next) this.load();
    }
    async load() {
      if (!this.account || this.loading || this.pending.size) return;
      const epoch = this.epoch; this.loading = true; this.error = ""; this.emit();
      try {
        const body = await this.json();
        if (epoch !== this.epoch) return;
        if (!Array.isArray(body?.filters) || !Array.isArray(body?.assignments)) throw new Error("Could not read manual filters.");
        this.filters = body.filters;
        this.assignments = new Map(body.assignments.map(row => [`${row.filter_id}:${row.match_id}`, row.state]));
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
    create(name) {
      return this.mutate("create", "", "POST", { name }, filter => {
        this.filters.push(filter); this.filters.sort((a, b) => a.name.localeCompare(b.name));
      });
    }
    remove(id) {
      return this.mutate(id, `/${encodeURIComponent(id)}`, "DELETE", null, () => {
        this.filters = this.filters.filter(filter => filter.id !== id);
        for (const key of this.assignments.keys()) if (key.startsWith(`${id}:`)) this.assignments.delete(key);
      });
    }
    assign(id, matchID, state) {
      if (!states.includes(state)) return Promise.resolve(false);
      return this.mutate(id, `/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchID)}`, "PUT", { state }, row => {
        this.assignments.set(`${row.filter_id}:${row.match_id}`, row.state);
      });
    }
  }

  const store = new ManualFilterStore();

  function createForm() {
    const form = el("form", null, "manual-filter-create");
    const input = el("input"); input.type = "text"; input.maxLength = 64; input.required = true;
    input.placeholder = "New filter name"; input.setAttribute("aria-label", "New manual filter name");
    const add = el("button", "+ Add", "button button-secondary"); add.type = "submit";
    add.disabled = !store.ready || store.loading || store.pending.has("create");
    form.append(input, add);
    form.addEventListener("submit", async event => {
      event.preventDefault(); const name = input.value.trim(); if (!name) return;
      add.disabled = true;
      if (await store.create(name)) input.value = "";
      else { add.disabled = false; input.focus(); }
    });
    return form;
  }

  class ManualFilterControl {
    constructor(targets, { onChange = () => {} } = {}) {
      this.targets = (Array.isArray(targets) ? targets : [targets]).map(target => typeof target === "string" ? document.getElementById(target) : target).filter(Boolean);
      this.selected = new Map(); this.onChange = onChange; this.account = store.account;
      store.subscribe(() => {
        let resetPagination = this.account !== store.account;
        if (resetPagination) { this.selected.clear(); this.account = store.account; }
        if (store.ready) for (const id of this.selected.keys()) if (!store.filters.some(filter => filter.id === id)) { this.selected.delete(id); resetPagination = true; }
        this.render(); this.onChange({ resetPagination });
      });
      document.addEventListener("click", event => {
        this.targets.forEach(target => { const menu = target.querySelector("details"); if (menu && !target.contains(event.target)) menu.open = false; });
      });
      this.render();
    }
    get active() { return Boolean(store.account && this.selected.size); }
    matches(match) {
      if (!this.active) return true;
      if (!store.ready) return false;
      return [...this.selected].every(([id, state]) => {
        const filter = store.filters.find(filter => filter.id === id);
        return filter && store.stateFor(filter, match.id) === state;
      });
    }
    summary() {
      if (!this.active) return "All matches";
      return [...this.selected].map(([id, state]) => `${store.filters.find(filter => filter.id === id)?.name || "Filter"}: ${label(state)}`).join(" · ");
    }
    render() {
      this.targets.forEach(target => {
        target.hidden = !store.account;
        if (!store.account) { target.replaceChildren(); return; }
        const old = target.querySelector("details"), open = old?.open || false;
        const draft = target.querySelector(".manual-filter-create input")?.value || "";
        const details = el("details", null, "map-filter-menu manual-filter-menu"); details.open = open;
        details.appendChild(el("summary", this.active ? `${this.selected.size} manual filter${this.selected.size === 1 ? "" : "s"}` : "All matches"));
        const panel = el("div", null, "map-filter-options manual-filter-options");
        panel.appendChild(el("p", "Private to your account. Active filters exclude Unknown matches; all selected conditions must match.", "manual-filter-help"));
        if (store.loading) panel.appendChild(el("p", "Loading filters…", "manual-filter-help"));
        if (store.error) {
          const error = el("p", store.error, "manual-filter-error"); error.setAttribute("role", "alert"); panel.appendChild(error);
          const retry = el("button", "Reload filters", "button button-secondary"); retry.type = "button";
          retry.addEventListener("click", event => { event.stopPropagation(); store.load(); }); panel.appendChild(retry);
        }
        if (store.ready) {
          const all = el("label"), input = el("input"); input.type = "checkbox"; input.checked = !this.active;
          input.addEventListener("change", event => { event.stopPropagation(); this.selected.clear(); this.render(); this.onChange({ resetPagination: true }); });
          all.append(input, el("span", "All matches")); panel.appendChild(all);
          store.filters.forEach(filter => {
            const row = el("div", null, "manual-filter-option"), checkLabel = el("label"), check = el("input");
            check.type = "checkbox"; check.checked = this.selected.has(filter.id);
            checkLabel.append(check, el("span", filter.name)); row.appendChild(checkLabel);
            check.addEventListener("change", event => {
              event.stopPropagation(); if (check.checked) this.selected.set(filter.id, "true"); else this.selected.delete(filter.id);
              this.render(); this.onChange({ resetPagination: true });
            });
            const select = el("select"); select.setAttribute("aria-label", `${filter.name} condition`);
            ["true", "false"].forEach(value => { const option = el("option", label(value)); option.value = value; select.appendChild(option); });
            select.value = this.selected.get(filter.id) || "true"; select.disabled = !check.checked;
            select.addEventListener("change", () => { this.selected.set(filter.id, select.value); this.render(); this.onChange({ resetPagination: true }); });
            const remove = el("button", "×", "manual-filter-delete"); remove.type = "button"; remove.disabled = store.pending.has(filter.id);
            remove.setAttribute("aria-label", `Delete ${filter.name} filter`);
            remove.addEventListener("click", event => {
              event.stopPropagation(); if (window.confirm(`Delete “${filter.name}” and its match assignments from your account?`)) store.remove(filter.id);
            });
            row.append(select, remove); panel.appendChild(row);
          });
        }
        const form = createForm(); form.querySelector("input").value = draft; panel.appendChild(form);
        details.appendChild(panel); target.replaceChildren(el("span", "Manual Filters", "manual-filter-heading"), details);
      });
    }
  }

  function matchEditor(match) {
    if (!store.account || !store.ready) return null;
    const details = el("details", null, "manual-match-menu");
    const summary = el("summary", "⋯"); summary.setAttribute("aria-label", `Manual filters for match ${match.id}`);
    details.appendChild(summary);
    const panel = el("div", null, "map-filter-options manual-match-options");
    panel.appendChild(el("strong", `Match #${match.id} · Manual Filters`));
    panel.appendChild(el("p", "Changes are private to your account.", "manual-filter-help"));
    store.filters.forEach(filter => {
      const row = el("div", null, "manual-match-state"), name = el("span", filter.name);
      const choices = el("div", null, "side-toggle"); choices.setAttribute("role", "group"); choices.setAttribute("aria-label", filter.name);
      const current = store.stateFor(filter, match.id);
      states.forEach(value => {
        const button = el("button", label(value), current === value ? "active" : ""); button.type = "button";
        button.setAttribute("aria-pressed", String(current === value)); button.disabled = store.pending.has(filter.id);
        button.addEventListener("click", event => { event.stopPropagation(); store.assign(filter.id, match.id, value); }); choices.appendChild(button);
      });
      row.append(name, choices); panel.appendChild(row);
    });
    if (!store.filters.length) panel.appendChild(el("p", "Create a filter to start labeling matches.", "manual-filter-help"));
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
  window.NickStatsManualFilters = Object.freeze({ store, ManualFilterStore, ManualFilterControl, matchState, matchEditor });
})();
