(() => {
  "use strict";

  // Add new parser-derived fields here when their first compact schema ships.
  // Aggregators will then keep a complete, correctly-denominated scope for them.
  const minimumSchema = Object.freeze({
    clawback_kills: 10,
    bozo_deaths: 10,
    flash_assists: 15,
    teammate_flash_assisted_kills: 15,
    opening_assisted_kills: 15,
    opening_damage_assisted_kills: 15,
    opening_flash_assisted_kills: 15,
    openingAssistRate: 15,
    opening_traded_deaths: 16,
    opening_trade_kills: 16,
    opening_assists: 16,
    opening_damage_assists: 16,
    opening_flash_assists: 16,
    opening_blinded_enemy_kills: 17,
    opening_blind_kills: 17,
    opening_deaths_while_blind: 17,
    opening_deaths_to_blind_killer: 17,
    opening_enemy_assisted_deaths: 17,
    opening_enemy_damage_assisted_deaths: 17,
    opening_enemy_flash_assisted_deaths: 17
  });
  const thresholds = [...new Set(Object.values(minimumSchema))].sort((left, right) => left - right);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const schemaVersion = schema => {
    const match = String(schema || "").match(/nickstats\.match\/(\d+)$/);
    return match ? Number(match[1]) : 0;
  };
  const mergeNumbers = (target, source) => {
    for (const [key, value] of Object.entries(source || {})) {
      if (key === "__scopes" || key === "__schema") continue;
      target[key] = key.endsWith("_max")
        ? Math.max(number(target[key]), number(value))
        : number(target[key]) + number(value);
    }
  };

  function add(target, source, schema) {
    mergeNumbers(target, source);
    const version = schemaVersion(schema);
    target.__scopes ||= {};
    for (const threshold of thresholds) {
      if (version < threshold) continue;
      const scoped = target.__scopes[threshold] ||= {};
      mergeNumbers(scoped, source);
    }
    return target;
  }

  function scope(stats, key) {
    const threshold = minimumSchema[key];
    if (!threshold) return stats || null;
    if (stats?.__schema != null) return schemaVersion(stats.__schema) >= threshold ? stats : null;
    return stats?.__scopes?.[threshold] || null;
  }

  function available(stats, key) {
    const selected = scope(stats, key);
    return Boolean(selected && number(selected.rounds) > 0);
  }

  function value(stats, key, sourceKey = key) {
    const selected = scope(stats, key);
    return selected ? number(selected[sourceKey]) : Number.NaN;
  }

  function rounds(stats, key) {
    const selected = scope(stats, key);
    return selected ? number(selected.rounds) : 0;
  }

  function materialize(stats) {
    const output = { ...(stats || {}) };
    for (const key of Object.keys(minimumSchema)) {
      if (key in output || !key.match(/[A-Z]/)) output[key] = value(stats, key);
    }
    return output;
  }

  window.NickStatsAvailability = {
    minimumSchema, schemaVersion, add, scope, available, value, rounds, materialize
  };
})();
