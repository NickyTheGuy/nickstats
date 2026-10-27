export function weaponName(id) {
  const names = {
    ak47: "AK-47", aug: "AUG", awp: "AWP", bizon: "PP-Bizon", cz75a: "CZ75-Auto",
    deagle: "Desert Eagle", elite: "Dual Berettas", famas: "FAMAS", fiveseven: "Five-SeveN",
    g3sg1: "G3SG1", galilar: "Galil AR", glock: "Glock-18", hkp2000: "P2000",
    m249: "M249", m4a1: "M4A4", m4a1_silencer: "M4A1-S", mac10: "MAC-10",
    mag7: "MAG-7", mp5sd: "MP5-SD", mp7: "MP7", mp9: "MP9", negev: "Negev",
    nova: "Nova", p250: "P250", p90: "P90", revolver: "R8 Revolver", sawedoff: "Sawed-Off",
    scar20: "SCAR-20", sg556: "SG 553", ssg08: "SSG 08", taser: "Zeus x27",
    tec9: "Tec-9", ump45: "UMP-45", usp_silencer: "USP-S", xm1014: "XM1014",
    hegrenade: "HE Grenade", flashbang: "Flashbang", smokegrenade: "Smoke Grenade",
    decoy: "Decoy", fire: "Molotov / Incendiary", knife: "Knife"
  };
  return names[id] || String(id || "Unknown").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export const weaponHeaders = ['Weapon', 'Kills', 'K/RU', 'Damage', 'Dmg/RU', 'Shots', 'Hits', 'Hit rate', 'Rounds used', 'Usage'];
export const weaponIdentity = player => player.steam_id ? `steam:${player.steam_id}` : `name:${String(player.name || '').toLocaleLowerCase()}`;

export function weaponBreakdown(player) {
  const rounds = player.rounds_played ?? 0;
  const weapons = Array.isArray(player.weapon_stats) ? player.weapon_stats : [];
  const sortRows = weapons.map(stat => [weaponName(stat.weapon), stat.kills || 0,
    (stat.kills || 0) / Math.max(1, stat.rounds_used || 0), stat.damage || 0,
    (stat.damage || 0) / Math.max(1, stat.rounds_used || 0), stat.shots || 0, stat.hits || 0,
    100 * (stat.hits || 0) / Math.max(1, stat.shots || 0), stat.rounds_used || 0,
    100 * (stat.rounds_used || 0) / Math.max(1, rounds)]);
  return {
    totals: `${weapons.reduce((sum, stat) => sum + (stat.kills || 0), 0)} kills · ${weapons.reduce((sum, stat) => sum + (stat.shots || 0), 0)} shots`,
    sortRows,
    rows: sortRows.map(row => row.map((value, index) => index === 2 ? value.toFixed(3)
      : index === 4 ? value.toFixed(1) : index === 7 || index === 9 ? `${value.toFixed(1)}%` : value))
  };
}
