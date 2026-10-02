(() => {
  "use strict";
  const ENDPOINT = "/nickstats/api/auth/manual-filters";
  const states = ["true", "false", "unknown"];
  const isNumeric = tag => tag.kind === "number";
  const numeric = value => typeof value === "number" && Number.isFinite(value);
  const displayName = tag => tag.owner && tag.owner !== store.account ? `${tag.name} · ${tag.owner}` : tag.name;
  const operators = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", between: "Between" };
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

  function shareMenu(tag) {
    const menu = el("details", null, "tag-share-menu");
    menu.appendChild(el("summary", "Share"));
    const panel = el("div", null, "tag-share-panel");
    panel.appendChild(el("p", "Recipients can filter and graph these values. Only you can edit them.", "manual-filter-help"));
    for (const username of tag.shared_with || []) {
      const row = el("div", null, "tag-share-recipient"), revoke = el("button", "Remove", "button button-secondary"); revoke.type = "button";
      revoke.disabled = store.pending.has(tag.id); revoke.setAttribute("aria-label", `Stop sharing ${tag.name} with ${username}`);
      revoke.addEventListener("click", event => { event.stopPropagation(); store.share(tag.id, username, true); });
      row.append(el("span", username), revoke); panel.appendChild(row);
    }
    const form = el("form", null, "manual-filter-create"), input = el("input"), submit = el("button", "Share", "button button-secondary");
    input.required = true; input.maxLength = 64; input.placeholder = "Account username"; input.setAttribute("aria-label", `Share ${tag.name} with account`);
    submit.type = "submit"; submit.disabled = store.pending.has(tag.id); form.append(input, submit);
    form.addEventListener("submit", event => { event.preventDefault(); event.stopPropagation(); if (input.value.trim()) store.share(tag.id, input.value.trim()); });
    panel.appendChild(form); menu.appendChild(panel); return menu;
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
    reset({ notify = false } = {}) {
      this.selected.clear(); this.render();
      if (notify) this.onChange({ resetPagination: true });
    }
    get active() { return Boolean(store.account && this.selected.size); }
    matches(match) {
      if (!this.active) return true;
      if (!store.ready) return false;
      return [...this.selected].every(([id, state]) => {
        const filter = store.filters.find(filter => filter.id === id);
        return filter && conditionMatches(store.stateFor(filter, match.id), state);
      });
    }
    summary() {
      if (!this.active) return "All matches";
      return [...this.selected].map(([id, state]) => `${displayName(store.filters.find(filter => filter.id === id) || { name: "Tag" })}: ${typeof state === "string" ? label(state) : `${operators[state.op]} ${state.value ?? "…"}${state.op === "between" ? `–${state.max ?? "…"}` : ""}`}`).join(" · ");
    }
    render() {
      this.targets.forEach(target => {
        target.hidden = !store.account;
        if (!store.account) { target.replaceChildren(); return; }
        const old = target.querySelector("details"), open = old?.open || false;
        const draft = target.querySelector(".manual-tag-create input")?.value || "";
        const draftKind = target.querySelector(".manual-tag-create select")?.value || "boolean";
        const details = el("details", null, "map-filter-menu manual-filter-menu"); details.open = open;
        details.appendChild(el("summary", this.active ? `${this.selected.size} tag${this.selected.size === 1 ? "" : "s"}` : "All matches"));
        const panel = el("div", null, "map-filter-options manual-filter-options");
        panel.appendChild(el("p", "Unknown values are excluded; all selected conditions must match.", "manual-filter-help"));
        if (store.loading) panel.appendChild(el("p", "Loading tags…", "manual-filter-help"));
        if (store.error) {
          const error = el("p", store.error, "manual-filter-error"); error.setAttribute("role", "alert"); panel.appendChild(error);
          const retry = el("button", "Reload tags", "button button-secondary"); retry.type = "button";
          retry.addEventListener("click", event => { event.stopPropagation(); store.load(); }); panel.appendChild(retry);
        }
        if (store.ready) {
          const all = el("label"), input = el("input"); input.type = "checkbox"; input.checked = !this.active;
          input.addEventListener("change", event => { event.stopPropagation(); this.selected.clear(); this.render(); this.onChange({ resetPagination: true }); });
          all.append(input, el("span", "All matches")); panel.appendChild(all);
          store.filters.forEach(filter => {
            const row = el("div", null, `manual-filter-option${isNumeric(filter) ? " manual-filter-numeric" : ""}`), checkLabel = el("label"), check = el("input");
            check.type = "checkbox"; check.checked = this.selected.has(filter.id);
            checkLabel.append(check, el("span", displayName(filter))); row.appendChild(checkLabel);
            check.addEventListener("change", event => {
              event.stopPropagation(); if (check.checked) this.selected.set(filter.id, isNumeric(filter) ? { op: "gte", value: null } : "true"); else this.selected.delete(filter.id);
              this.render(); this.onChange({ resetPagination: true });
            });
            const select = el("select"); select.setAttribute("aria-label", `${filter.name} condition`);
            const choices = isNumeric(filter) ? Object.entries(operators) : [["true", "True"], ["false", "False"]];
            choices.forEach(([value, text]) => { const option = el("option", text); option.value = value; select.appendChild(option); });
            const selected = this.selected.get(filter.id);
            select.value = isNumeric(filter) ? selected?.op || "gte" : selected || "true"; select.disabled = !check.checked;
            const update = () => { this.render(); this.onChange({ resetPagination: true }); };
            select.addEventListener("change", () => {
              this.selected.set(filter.id, isNumeric(filter) ? { ...selected, op: select.value } : select.value); update();
            });
            const conditions = el("div", null, "manual-filter-conditions");
            conditions.appendChild(select); row.appendChild(conditions);
            if (isNumeric(filter)) {
              for (const key of ["value", ...(selected?.op === "between" ? ["max"] : [])]) {
                const input = el("input"); input.type = "number"; input.step = "any"; input.value = selected?.[key] ?? "";
                input.placeholder = key === "max" ? "Maximum" : selected?.op === "between" ? "Minimum" : "Value";
                input.disabled = !check.checked; input.setAttribute("aria-label", `${filter.name} ${key === "max" ? "maximum" : "value"}`);
                input.addEventListener("change", () => {
                  this.selected.set(filter.id, { ...this.selected.get(filter.id), [key]: input.value.trim() === "" ? null : Number(input.value) }); update();
                }); conditions.appendChild(input);
              }
            }
            if (!store.canEdit(filter)) { panel.appendChild(row); return; }
            const actions = el("div", null, "manual-filter-actions");
            if (store.supportsSharing) actions.appendChild(shareMenu(filter));
            const remove = el("button", "×", "manual-filter-delete"); remove.type = "button"; remove.disabled = store.pending.has(filter.id);
            remove.setAttribute("aria-label", `Delete ${filter.name} tag`);
            remove.addEventListener("click", event => {
              event.stopPropagation(); if (window.confirm(`Delete “${filter.name}” and its match assignments from your account?`)) store.remove(filter.id);
            });
            actions.appendChild(remove); row.appendChild(actions); panel.appendChild(row);
          });
        }
        const form = createForm(); form.querySelector("input").value = draft; form.querySelector("select").value = draftKind; panel.appendChild(form);
        details.appendChild(panel); target.replaceChildren(el("span", "Tags", "manual-filter-heading"), details);
      });
    }
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
  window.NickStatsManualFilters = Object.freeze({ store, ManualFilterStore, ManualFilterControl, matchState, conditionMatches, displayName, matchEditor });
})();
