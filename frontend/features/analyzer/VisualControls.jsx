import OverlayMenu from './OverlayMenu.jsx';
import RoundFilter from './RoundFilter.jsx';
import DisplayControls from './DisplayControls.jsx';
export default function VisualControls({
  open,
  onToggle,
  mode,
  display,
  setDisplay,
  enemyDisplay,
  setEnemyDisplay,
  showEnemies,
  onShowEnemies,
}) {
  return (
    <OverlayMenu buttonLabel="Visuals" label="Analyzer visuals" open={open} onToggle={onToggle}>
      <DisplayControls prefix="Player" display={display} setDisplay={setDisplay} />
      {mode === 'groups' && (
        <>
          <RoundFilter
            label="Enemies"
            value={showEnemies ? 'on' : 'off'}
            options={[
              ['on', 'On'],
              ['off', 'Off'],
            ]}
            onChange={(value) => onShowEnemies(value === 'on')}
          />
          {showEnemies && (
            <DisplayControls prefix="Enemy" display={enemyDisplay} setDisplay={setEnemyDisplay} />
          )}
        </>
      )}
    </OverlayMenu>
  );
}
