export const roundConditions = [
  ['ALL', 'All'],
  ['opening_kill', 'Opening kill'],
  ['opening_death', 'Opening death'],
  ['opening_attempt', 'Attempted'],
  ['no_opening', 'No attempt'],
];
const categories = new Set(['opening_kill', 'opening_death', 'no_opening']);
// These economy deltas/forecasts are signed in the saved round payload.
// Counts and resource totals must remain nonnegative.
const signedConditionStat =
  /^clutch_econ_(?:win|loss)_(?:survive|die)_(?:differential|swing|team_cash_change|enemy_cash_change|save_impact|(?:t|ct)[1-5]_(?:victory|victory_dead|failure|failure_late))$/;
export function validateRoundConditions(body, playerID) {
  if (String(body?.player_id) !== String(playerID) || !Array.isArray(body.matches))
    throw Error('Invalid round conditions response.');
  const ids = new Set();
  for (const match of body.matches) {
    if (
      !Number.isSafeInteger(match.id) ||
      match.id <= 0 ||
      ids.has(match.id) ||
      !Number.isSafeInteger(match.expected_rounds) ||
      match.expected_rounds < 0 ||
      !Number.isSafeInteger(match.covered_rounds) ||
      match.covered_rounds < 0 ||
      match.covered_rounds > match.expected_rounds ||
      !Array.isArray(match.slices)
    )
      throw Error('Round condition coverage changed. Refresh this profile.');
    ids.add(match.id);
    const rounds = new Set();
    for (const row of match.slices) {
      if (
        !categories.has(row.condition) ||
        !['T', 'CT'].includes(row.side) ||
        !['REGULATION', 'OVERTIME'].includes(row.round_phase) ||
        typeof row.hero !== 'boolean' ||
        !Array.isArray(row.rounds) ||
        !row.rounds.length ||
        !row.stats ||
        typeof row.stats !== 'object' ||
        !Array.isArray(row.weapons) ||
        row.stats.rounds !== row.rounds.length
      )
        throw Error('Invalid condition statistics.');
      for (const [key, value] of Object.entries(row.stats)) {
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          (value < 0 && !signedConditionStat.test(key))
        )
          throw Error(`Invalid condition statistic: ${key}.`);
      }
      for (const number of row.rounds) {
        if (!Number.isSafeInteger(number) || number < 1 || number > 65535 || rounds.has(number))
          throw Error('Overlapping condition rounds.');
        rounds.add(number);
      }
    }
    if (rounds.size !== match.covered_rounds) throw Error('Incomplete condition statistics.');
  }
  return body;
}
export function conditionMatches(matches, data, condition) {
  if (condition === 'ALL') return matches;
  const byID = new Map(data.matches.map((match) => [String(match.id), match]));
  return matches.map((match) => {
    const coverage = byID.get(String(match.id));
    if (coverage && coverage.expected_rounds !== match.rounds)
      throw Error('Match history changed. Refresh this profile.');
    const sides = (coverage?.slices || []).filter((row) =>
      condition === 'opening_attempt'
        ? row.condition === 'opening_kill' || row.condition === 'opening_death'
        : row.condition === condition,
    );
    const rounds = new Set(sides.flatMap((row) => row.rounds));
    return {
      ...match,
      round_condition: condition,
      sides,
      round_kills: (match.round_kills || []).filter((row) => rounds.has(row.round)),
    };
  });
}
export function conditionSliceMatches(
  row,
  {
    side = 'ALL',
    buy = 'ALL',
    opponentBuy = 'ALL',
    roundResult = 'ALL',
    roundPhase = 'ALL',
    heroOnly = false,
  } = {},
) {
  return (
    (side === 'ALL' || row.side === side) &&
    (buy === 'ALL' || (buy === 'hero' && row.hero === true) || row.buy_type === buy) &&
    (opponentBuy === 'ALL' || row.opponent_buy_type === opponentBuy) &&
    (roundResult === 'ALL' || row.round_result === roundResult) &&
    (roundPhase === 'ALL' || row.round_phase === roundPhase) &&
    (!heroOnly || row.hero === true)
  );
}
export function conditionCoverage(matches, data) {
  const ids = new Set(matches.map((match) => String(match.id))),
    rows = data.matches.filter((match) => ids.has(String(match.id)));
  return {
    covered: rows.reduce((n, row) => n + row.covered_rounds, 0),
    expected: matches.reduce((n, row) => n + row.rounds, 0),
  };
}
