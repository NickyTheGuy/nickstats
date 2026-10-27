const identity = (steamId, name) => steamId ? `steam:${steamId}` : `name:${String(name || '').toLocaleLowerCase()}`;
const unavailable = () => ({ text: '—', className: 'duel-unavailable' });

export function matchMatrix(teams, kind) {
  const trades = kind === 'trades';
  const players = (teams || []).flatMap((team, teamIndex) => (team.players || []).map((player, index) => ({
    player, teamIndex, teamName: team.name || `Team ${teamIndex + 1}`,
    key: `${teamIndex}:${identity(player.steam_id, player.name)}:${index}`
  })));
  const startsTeam = index => index > 0 && players[index].teamIndex !== players[index - 1].teamIndex;
  const columns = players.map((entry, index) => ({ key: entry.key, text: entry.player.name || 'Unknown', title: entry.teamName,
    className: startsTeam(index) ? 'duel-team-column-start' : undefined }));
  return {
    label: trades ? 'Trade responses by teammate' : 'Kills and deaths by opponent',
    wrapperClassName: 'table-wrap demo-duel-matrix-wrap',
    className: `demo-duel-matrix${trades ? ' demo-trade-matrix' : ''}`,
    corner: trades ? { text: 'O/A/S ↓ / Teammate →', title: 'Opportunities / attempts / successes' }
      : { text: 'K-D ↓ / Opponent →', className: 'duel-corner' },
    columns,
    rows: players.map((entry, rowIndex) => {
      const data = new Map((trades ? entry.player.trade_matchups || [] : entry.player.duels || []).map(item => [
        trades ? identity(item.teammate_steam_id, item.teammate) : identity(item.opponent_steam_id, item.opponent), item
      ]));
      return { key: entry.key, text: entry.player.name || 'Unknown',
        title: `${entry.teamName}${trades ? ' · potential trader' : ''}`,
        className: startsTeam(rowIndex) ? 'duel-team-row-start' : undefined,
        cells: players.map((column, index) => {
          const item = data.get(identity(column.player.steam_id, column.player.name));
          let cell;
          if (trades) {
            if (entry === column || entry.teamIndex !== column.teamIndex) cell = unavailable();
            else {
              const opportunities = item?.opportunities || 0, attempts = item?.attempts || 0, successes = item?.successes || 0;
              cell = { text: `${opportunities}/${attempts}/${successes}`,
                title: `${entry.player.name} responding to ${column.player.name}: ${opportunities} opportunities, ${attempts} attempts, ${successes} successes`,
                className: successes ? 'trade-success' : attempts ? 'trade-attempt' : opportunities ? 'trade-opportunity' : 'trade-none' };
            }
          } else if (!item) cell = unavailable();
          else {
            const kills = item.kills || 0, deaths = item.deaths || 0;
            cell = { text: `${kills}-${deaths}`, title: entry === column
              ? `${entry.player.name}: ${deaths} self-kill${deaths === 1 ? '' : 's'}`
              : `${entry.player.name}: ${kills} kills and ${deaths} deaths against ${column.player.name}`,
              className: kills > deaths ? 'duel-positive' : kills < deaths ? 'duel-negative' : 'duel-even' };
          }
          return { ...cell, className: [columns[index].className, cell.className].filter(Boolean).join(' ') };
        }) };
    })
  };
}
