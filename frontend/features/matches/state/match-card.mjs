const mapArtworkLocations = {
  mirage: { file: "mirage.webp", position: "center 54%" },
  inferno: { file: "inferno.webp", position: "center 54%" },
  nuke: { file: "nuke.webp", position: "center 38%" },
  dust2: { file: "dust2.webp", position: "center 52%" },
  ancient: { file: "ancient.webp", position: "center 48%" },
  anubis: { file: "anubis.webp", position: "center 50%" },
  overpass: { file: "overpass.webp", position: "center 45%" },
  train: { file: "train.webp", position: "center 52%" },
  vertigo: { file: "vertigo.webp", position: "center 45%" },
  cache: { file: "cache.webp", position: "center 45%" }
};

function mapArtworkKey(name) {
  const normalized = String(name || "")
    .toLowerCase()
    .split(/[\\/]/)
    .pop()
    .replace(/\.(?:bsp|vpk)$/, "")
    .replace(/^de_/, "")
    .replace(/[^a-z0-9]/g, "");
  return normalized === "dustii" ? "dust2" : normalized;
}


export const artworkFor = name => mapArtworkLocations[mapArtworkKey(name)] || null;
export function matchScore(team) {
  if (team?.score == null || team.score === '') return null;
  const value = Number(team.score);
  return Number.isFinite(value) ? value : null;
}
export function teamResult(team, other) {
  const value = matchScore(team), opponent = matchScore(other);
  return value == null || opponent == null || value === opponent ? '' : value > opponent ? 'winner' : 'loser';
}
export function teamsFor(match) {
  const teams = Array.isArray(match.teams) ? match.teams : [];
  return match.viewer_team_slot === 1 && teams.length >= 2 ? [teams[1], teams[0]] : teams;
}
export function formatMatchTime(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
}
export function previewStats(stats) {
  return [['Rating', Number(stats.rating).toFixed(2)], ['K-D-A', `${stats.kills}-${stats.deaths}-${stats.assists}`], ['ADR', Number(stats.adr).toFixed(1)]];
}
export function matchDescription(match) {
  const teams = teamsFor(match), stats = match.viewer_stats;
  const score = teams.length >= 2 ? `${teams[0].name || 'Unknown team'} ${matchScore(teams[0]) ?? 'unknown'} to ${matchScore(teams[1]) ?? 'unknown'} ${teams[1].name || 'Unknown team'}` : 'score unavailable';
  const preview = stats ? `; rating ${Number(stats.rating).toFixed(2)}, kills ${stats.kills}, deaths ${stats.deaths}, assists ${stats.assists}, ADR ${Number(stats.adr).toFixed(1)}` : '';
  return `Open match ${match.id} on ${match.map || 'Unknown map'}: ${score}${preview}`;
}
