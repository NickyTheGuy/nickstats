import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import MapWindow from './MapWindow.jsx';
import AnalyzerControls from './AnalyzerControls.jsx';
import { matchesRound, toggleRoundSet, replaySampleCount } from './state/round-selection.mjs';
import PlaybackControls from './PlaybackControls.jsx';
import mapData from './state/maps.json';
import { COMBAT_LAYERS } from './state/combat.mjs';
import { PLAYER_COLORS, UTILITY_TYPES } from './state/replay.mjs';
import { openReplayFile } from './state/files.mjs';

export default function Analyzer() {
  const [replays,setReplays] = useState([]), [mapName,setMapName] = useState('');
  const [selectedRounds,setSelectedRounds] = useState([]), [selectedPlayers,setSelectedPlayers] = useState([]);
  const [utilities,setUtilities] = useState(UTILITY_TYPES), [side,setSide] = useState(0);
  const [time,setTime] = useState(0), [playing,setPlaying] = useState(false), [speed,setSpeed] = useState(1);
  const [busy,setBusy] = useState(false), [status,setStatus] = useState(''), [error,setError] = useState('');
  const [filters,setFilters]=useState({result:'all',buy:'all',enemyBuy:'all'});
  const [combatLayers,setCombatLayers]=useState(COMBAT_LAYERS);
  const operation = useRef(null);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    const pause = () => setPlaying(false);
    const navigate = event => { if (event.detail.page !== 'analyzer') pause(); };
    document.addEventListener('visibilitychange',pause); window.addEventListener('nickstats:page',navigate);
    return () => { document.removeEventListener('visibilitychange',pause); window.removeEventListener('nickstats:page',navigate); };
  }, []);
  const players = useMemo(() => [...new Map(replays.filter(r=>r.map===mapName).flatMap(r=>r.players.map(p=>[p.id,p]))).values()], [replays,mapName]);
  const colors = useMemo(() => new Map(players.map((p,i)=>[p.id,PLAYER_COLORS[i%PLAYER_COLORS.length]])), [players]);
  const rounds = useMemo(() => {
    const selected = new Set(selectedRounds);
    return replays.filter(r=>r.map===mapName).flatMap(r=>r.rounds.filter(round=>selected.has(`${r.match_uid}:${round.number}`)&&matchesRound(round,{...filters,players:selectedPlayers,side})));
  }, [replays,mapName,selectedRounds,filters,selectedPlayers,side]);
  const duration = rounds.reduce((max,r)=>Math.max(max,r.duration),0), map = Object.hasOwn(mapData.maps,mapName) ? mapData.maps[mapName] : null;
  const mapReplays = useMemo(()=>replays.filter(r=>r.map===mapName),[replays,mapName]);
  useEffect(() => { setTime(0); setPlaying(false); }, [selectedRounds,mapName,filters,selectedPlayers,side]);
  useEffect(() => {
    if (!playing || !duration) return;
    let frame, previous = performance.now(), lastRender = previous;
    const animate = now => {
      if (now-lastRender >= 32) {
        const delta = Math.min(now-previous,250)*speed; previous = now; lastRender = now;
        setTime(value => Math.min(duration,value+delta));
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing,speed,duration]);
  useEffect(() => { if (time >= duration) setPlaying(false); }, [time,duration]);
  async function openFiles(files) {
    if (!files.length || busy) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(''); setPlaying(false);
    let loaded = [...replays], messages = [];
    try {
      for (const file of files) {
        controller.signal.throwIfAborted();
        try {
          const replay = await openReplayFile(file,{ signal:controller.signal, onStatus:setStatus });
          const remaining = loaded.filter(r=>r.match_uid!==replay.match_uid);
          if (remaining.length>=8) throw new Error('Reload the viewer before opening more matches (8-match limit).');
          const count = [...remaining,replay].reduce((sum,r)=>sum+replaySampleCount(r),0);
          if (count > 2000000) throw new Error('Open replays exceed two million positions. Reload the viewer to free memory first.');
          loaded = [...remaining,replay]; setReplays(loaded); setMapName(replay.map);
          setSelectedRounds([`${replay.match_uid}:${replay.rounds[0].number}`]);
          setSelectedPlayers([...new Set(loaded.filter(r=>r.map===replay.map).flatMap(r=>r.players.map(p=>p.id)))]);
        } catch (failure) { if (controller.signal.aborted) throw failure; messages.push(`${file.name}: ${failure.message}`); }
      }
    } catch (failure) { if (!controller.signal.aborted) messages.push(failure.message); }
    finally { setBusy(false); setStatus(''); setError(messages.join(' ')); operation.current = null; }
  }
  function changeMap(value) {
    setMapName(value);
    const replay = replays.find(r=>r.map===value);
    setSelectedRounds(replay ? [`${replay.match_uid}:${replay.rounds[0].number}`] : []);
    setSelectedPlayers([...new Set(replays.filter(r=>r.map===value).flatMap(r=>r.players.map(p=>p.id)))]);
  }
  return <section className="panel analyzer-panel">
    <header className="section-head"><div><div className="eyebrow">2D analyzer</div><h2>Round explorer</h2></div>
      <div className="analyzer-import">
        <label className={`button button-primary${busy?' disabled':''}`}>Open demos / replays
          <input type="file" multiple accept=".dem,.zst,.json" disabled={busy} onChange={e=>{ const files = Array.from(e.target.files); e.target.value=''; openFiles(files); }} />
        </label>
        {busy && <Button className="button button-secondary" onClick={()=>operation.current?.abort()}>Cancel</Button>}
      </div>
    </header>
    <FormMessage className="analyzer-status">{status}</FormMessage><FormMessage error className="analyzer-error">{error}</FormMessage>
    {!replays.length && <p className="analyzer-empty">Open a .dem, .dem.zst or previously captured replay to explore rounds locally.</p>}
    {!!replays.length && <>
      <div className="analyzer-options">
        <OptionField label="Map" value={mapName} options={[...new Set(replays.map(r=>r.map))].map(m=>[m,m.replace(/^de_/, '')])} onChange={changeMap} />

      </div>
      <div className="analyzer-workspace">
        <div className="analyzer-stage">
          <MapWindow map={map} mapName={mapName} rounds={rounds} players={players} selected={selectedPlayers} colors={colors} time={time} side={side} utilities={utilities} combatLayers={combatLayers}
            controls={<AnalyzerControls players={players} selectedPlayers={selectedPlayers} setSelectedPlayers={setSelectedPlayers}
              colors={colors} utilities={utilities} setUtilities={setUtilities} side={side} onSide={setSide} filters={filters} setFilters={setFilters} selectedCount={rounds.length} combatLayers={combatLayers} setCombatLayers={setCombatLayers}
              roundPicker={{replays:mapReplays,selected:selectedRounds,filters:{...filters,side,players:selectedPlayers},
                onClear:()=>setSelectedRounds([]),onToggleSet:keys=>setSelectedRounds(previous=>toggleRoundSet(previous,keys))}} />}
            playback={<PlaybackControls time={time} duration={duration} playing={playing} setPlaying={setPlaying} onSeek={setTime} speed={speed} setSpeed={setSpeed} />} />
          {map && <div className="analyzer-caption">Time from freeze end · {rounds.length} selected {rounds.length===1?'round':'rounds'} · Skull: victim fill, killer outline · Areas approximate</div>}
          {mapReplays.some(r=>r.version<4) && <p className="analyzer-caption">Reopen the original demo to add recorded buy filters to older replays.</p>}
        </div>
      </div>
    </>}
  </section>;
}
