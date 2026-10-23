import TabList from '../components/TabList.jsx';

const classes = { className: 'player-open-profiles unified-profile-tabs', itemClassName: 'player-open-tab', tabClassName: 'player-open-tab-label' };

export function PlayerWorkspaceTabs({ player = {}, sessions = {} }) {
  const profiles = player.profiles || [], entries = sessions.entries || [];
  const options = [
    ['quick', 'Quick comparison', { disabled: !profiles.length, tabProps: { 'aria-controls': 'playerQuickApp' } }],
    ['graphs', 'Graphs', { disabled: !profiles.length, tabProps: { 'aria-controls': 'playerGraphs' } }],
    ...profiles.map(profile => [`profile:${profile.id}`, profile.name, {
      onClose: () => player.onClose(profile.id), closeLabel: `Close ${profile.name} profile`, tabProps: { 'aria-controls': 'playerProfileBody' }
    }]),
    ...entries.map(entry => [`session:${entry.key}`, 'Session', {
      onClose: () => sessions.onClose(entry.key), closeLabel: `Close ${entry.label}`,
      tabProps: { 'aria-controls': 'sessionView', title: entry.label, 'aria-label': entry.label }, itemProps: { 'data-session-tab': entry.key }
    }])
  ];
  const value = player.display === 'session' ? `session:${sessions.active}`
    : player.display === 'profile' ? `profile:${player.activeId}` : player.display;
  return <TabList {...classes} id="playerOpenProfiles" label="Player profiles, quick comparison, graphs and sessions"
    options={options} value={value} hidden={!profiles.length && !entries.length} onChange={key => {
      if (key.startsWith('session:')) sessions.onSelect(key.slice(8));
      else if (key.startsWith('profile:')) player.onSelect(key.slice(8));
      else player.onDisplay(key);
    }} />;
}

export function GroupWorkspaceTabs({ profiles, display, activeId, onSelect, onDisplay }) {
  const options = [
    ['quick', 'Quick comparison', { tabProps: { 'data-combo-display': 'quick', 'aria-controls': 'comboQuickApp' } }],
    ['graphs', 'Graphs', { tabProps: { 'data-combo-display': 'graphs', 'aria-controls': 'comboGraphs' } }],
    ...profiles.map(profile => [`profile:${profile.id}`, profile.name, { tabProps: { 'data-combo-player-id': profile.id, 'aria-controls': 'comboProfileBody' } }])
  ];
  return <TabList {...classes} id="comboProfilePlayers" label="Included player profiles, quick comparison and graphs" options={options}
    value={display === 'profile' ? `profile:${activeId}` : display} onChange={key => key.startsWith('profile:') ? onSelect(key.slice(8)) : onDisplay(key)} />;
}
