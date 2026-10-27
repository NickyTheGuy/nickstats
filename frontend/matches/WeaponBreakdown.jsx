import Disclosure from '../components/Disclosure.jsx';
import DataTable from '../components/DataTable.jsx';
import { weaponBreakdown, weaponHeaders, weaponIdentity } from '../state/weapon-breakdown.mjs';

function WeaponPlayer({ player }) {
  const model = weaponBreakdown(player);
  const name = player.name || 'Unknown player';
  return <Disclosure className="demo-weapon-player" summary={<>
    <span className="demo-weapon-summary-main"><strong>{name}</strong><span className="demo-weapon-action" aria-hidden="true" /></span>
    <span className="demo-weapon-totals">{model.totals}</span>
  </>}>
    <div className="table-wrap"><table className="demo-weapon-table" aria-label={`${name} weapon breakdown`}>
      <DataTable headers={weaponHeaders} {...model} toggleOff emptyMessage="No weapon events were recorded." />
    </table></div>
  </Disclosure>;
}

export default function WeaponBreakdown({ teams }) {
  return teams.map((team, index) => <section key={index} className="demo-weapon-team">
    <h4>{team.name || 'Team'}</h4>
    {(team.players || []).map((player, playerIndex) => <WeaponPlayer key={`${weaponIdentity(player)}:${playerIndex}`} player={player} />)}
  </section>);
}
