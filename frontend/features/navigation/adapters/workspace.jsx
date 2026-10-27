import { createRoot } from 'react-dom/client';
import { PlayerWorkspaceTabs, GroupWorkspaceTabs } from '../WorkspaceTabs.jsx';

let player = {}, sessions = {}, playerRoot, groupRoot;
function renderPlayer() {
  playerRoot ||= createRoot(document.getElementById('playerOpenProfilesApp'));
  playerRoot.render(<PlayerWorkspaceTabs player={player} sessions={sessions} />);
}
window.NickStatsNavigationUI = Object.freeze({
  player(next) { player = next; renderPlayer(); },
  sessions(next) { sessions = next; renderPlayer(); },
  group(props) {
    groupRoot ||= createRoot(document.getElementById('comboProfilePlayersApp'));
    groupRoot.render(<GroupWorkspaceTabs {...props} />);
  }
});
