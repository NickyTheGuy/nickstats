import ToggleChips from '../../shared/components/forms/ToggleChips.jsx';
import { analyzerPlayerTeams, sortAnalyzerPlayers } from './state/player-options.mjs';

export default function AnalyzerPlayers({ players, selected, colors, onChange, replay }) {
  const options = (rows) =>
    rows.map((player) => [
      player.id,
      player.name,
      {
        style: { '--player-color': colors.get(player.id) },
        className: 'analyzer-player',
        title: player.name,
      },
    ]);
  if (!replay)
    return (
      <ToggleChips
        label="Analyzer players"
        className="analyzer-players"
        options={options(sortAnalyzerPlayers(players))}
        selected={selected}
        onChange={onChange}
      />
    );
  return (
    <div
      className="analyzer-players analyzer-player-teams"
      role="group"
      aria-label="Analyzer players"
    >
      {analyzerPlayerTeams(players, replay).map((team) => (
        <div
          key={team.id}
          className={`analyzer-player-team${team.id === 'unknown' ? ' analyzer-player-team-unknown' : ''}`}
        >
          <span>{team.label}</span>
          <ToggleChips
            label={`${team.label} players`}
            options={options(team.players)}
            selected={selected}
            onChange={onChange}
          />
        </div>
      ))}
    </div>
  );
}
