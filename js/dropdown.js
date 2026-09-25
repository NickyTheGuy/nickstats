(() => {
  "use strict";

  const instances = new WeakMap();
  const menus = new Set();

  function sync(select) {
    const instance = instances.get(select);
    if (!instance) return;
    const { details, summary, menu, label } = instance;
    const selected = [...select.options].find(option => option.value === select.value);
    summary.textContent = selected?.textContent || "Choose an option";
    summary.setAttribute("aria-label", `${label}: ${summary.textContent}`);
    menu.replaceChildren();
    [...select.options].forEach(option => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = option.textContent; button.disabled = option.disabled;
      button.setAttribute("aria-current", String(option.value === select.value));
      button.addEventListener("click", () => {
        if (button.disabled) return;
        const changed = select.value !== option.value;
        select.value = option.value;
        details.open = false; sync(select); summary.focus();
        if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      menu.appendChild(button);
    });
  }

  function enhance(select) {
    if (!select || instances.has(select)) return;
    const label = select.getAttribute("aria-label") || "Option";
    const details = document.createElement("details"); details.className = "stats-dropdown";
    const summary = document.createElement("summary"); summary.tabIndex = 0;
    const menu = document.createElement("div"); menu.className = "stats-dropdown-menu";
    details.append(summary, menu); select.after(details);
    select.classList.add("stats-dropdown-native");
    instances.set(select, { details, summary, menu, label }); menus.add(details);
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      menus.forEach(other => { if (other !== details) other.open = false; });
      sync(select);
    });
    details.addEventListener("keydown", event => {
      if (event.key === "Escape") { details.open = false; summary.focus(); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (!details.open) { details.open = true; sync(select); }
      const enabled = [...menu.querySelectorAll("button:not(:disabled)")];
      if (!enabled.length) return;
      const position = enabled.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1
        : position < 0 ? event.key === "ArrowUp" ? enabled.length - 1 : 0
        : (position + (event.key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length;
      enabled[next].focus();
    });
    sync(select);
  }

  document.addEventListener("pointerdown", event => {
    menus.forEach(details => { if (details.open && !details.contains(event.target)) details.open = false; });
  });

  window.NickStatsDropdown = Object.freeze({ enhance, sync });
})();
