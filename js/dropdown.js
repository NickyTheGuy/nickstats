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
      button.addEventListener("click", event => {
        event.stopPropagation();
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
      menus.forEach(other => {
        if (other.isConnected === false) menus.delete(other);
        else if (other !== details) other.open = false;
      });
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
    menus.forEach(details => {
      if (details.isConnected === false) menus.delete(details);
      else if (details.open && !details.contains(event.target)) details.open = false;
    });
  });

  // Activate menu buttons on touch release instead of relying on the browser's
  // compatibility mouse click. Keep the existing click handlers (and native
  // keyboard/mouse behavior), and cancel that compatibility click to avoid
  // applying an action twice. Do not intercept swipes or native form inputs.
  const touchMenus = ".stats-dropdown-menu, .date-range-panel, .map-filter-options, .tag-share-panel";
  let tap = null;
  document.addEventListener("touchstart", event => {
    tap = null;
    if (event.touches.length !== 1) return;
    const button = event.target.closest?.("button");
    if (!button || button.disabled || !button.closest(touchMenus)) return;
    const touch = event.touches[0];
    tap = { button, id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  document.addEventListener("touchmove", event => {
    const touch = [...event.touches].find(touch => touch.identifier === tap?.id);
    if (!touch || Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > 10) tap = null;
  }, { passive: true });
  document.addEventListener("touchcancel", () => { tap = null; }, { passive: true });
  document.addEventListener("scroll", () => { tap = null; }, { passive: true, capture: true });
  document.addEventListener("touchend", event => {
    const gesture = tap; tap = null;
    if (!gesture || event.touches.length || !event.cancelable) return;
    const touch = [...event.changedTouches].find(touch => touch.identifier === gesture.id);
    const { button, x, y } = gesture;
    if (!touch || !button.isConnected || button.disabled ||
        Math.hypot(touch.clientX - x, touch.clientY - y) > 10 ||
        !button.contains(document.elementFromPoint(touch.clientX, touch.clientY))) return;
    event.preventDefault();
    button.click();
  }, { passive: false });

  window.NickStatsDropdown = Object.freeze({ enhance, sync });
})();
