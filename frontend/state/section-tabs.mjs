export const profileSections = [
  ['overview', 'Overview'], ['matches', 'Matches'], ['openings', 'Opening'], ['initiation', 'Initiation'],
  ['trades', 'Trades'], ['rounds', 'Rounds'], ['roundState', 'Round state'], ['context', 'Context'],
  ['movement', 'Movement'], ['utility', 'Utility'], ['weapons', 'Weapons'], ['maps', 'Maps']
];
const title = value => value[0].toUpperCase() + value.slice(1);
export function sectionTabs(kind) {
  if (kind === 'match') return {
    id: 'demoAnalysisTabs', label: 'Match analysis section', className: 'demo-result-tabs', tabClassName: 'demo-result-tab',
    options: [['scoreboard', 'Scoreboard'], ['duels', 'Duels'], ['trades', 'Trades'], ['weapons', 'Weapons'], ['timeline', 'Timeline']]
      .map(([key, label]) => [key, label, { tabProps: {
        id: `demo${title(key)}Tab`, 'aria-controls': `demo${title(key)}View`, 'data-demo-result-view': key
      } }])
  };
  if (!['player', 'combo'].includes(kind)) throw new Error(`Unknown section tabs: ${kind}`);
  return {
    id: `${kind}DetailTabs`, label: kind === 'player' ? 'Player statistics' : 'Conditional player statistics',
    className: 'player-profile-tabs', tabClassName: 'player-profile-tab',
    options: profileSections.map(([key, label]) => [key, label, { tabProps: {
      id: `${kind}Detail${title(key)}Tab`, 'aria-controls': `${kind}Section${title(key)}`,
      [kind === 'player' ? 'data-player-view' : 'data-combo-profile-view']: key
    } }])
  };
}
