import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import MapWindow from './MapWindow.jsx';
import AnalyzerControls from './AnalyzerControls.jsx';
import { presetRounds, replaySampleCount } from './state/round-selection.mjs';
import PlaybackControls from './PlaybackControls.jsx';
import mapData from './state/maps.json';
import { PLAYER_COLORS, UTILITY_TYPES } from './state/replay.mjs';
import { openReplayFile, downloadReplay } from './state/files.mjs';

export default function Analyzer() {
  const [replays,setReplays] = useState([]), [mapName,setMapName] = useState(''), [layout,setLayout] = useState('auto');
  const [selectedRounds,setSelectedRounds] = useState([]), [selectedPlayers,setSelectedPlayers] = useState([]);
  const [utilities,setUtilities] = useState(UTILITY_TYPES), [side,setSide] = useState(0), [phase,setPhase] = useState(null);
  const [time,setTime] = useState(0), [playing,setPlaying] = useState(false), [speed,setSpeed] = useState(1);
  const [busy,setBusy] = useState(false), [status,setStatus] = useState(''), [error,setError] = useState('');
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
    return replays.filter(r=>r.map===mapName).flatMap(r=>r.rounds.filter(round=>selected.has(`${r.match_uid}:${round.number}`)));
  }, [replays,mapName,selectedRounds]);
  const duration = rounds.reduce((max,r)=>Math.max(max,r.duration),0), map = Object.hasOwn(mapData.maps,mapName) ? mapData.maps[mapName] : null;
  const mapReplays = useMemo(()=>replays.filter(r=>r.map===mapName),[replays,mapName]);
  useEffect(() => { setTime(0); setPlaying(false); }, [selectedRounds,mapName]);
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
  function selectPreset(nextPhase,nextSide=side) {
    setPhase(nextPhase); setSide(nextSide);
    setSelectedRounds(presetRounds(mapReplays,{phase:nextPhase,side:nextSide,players:selectedPlayers}));
  }
  useEffect(()=>{
    if (phase) setSelectedRounds(presetRounds(mapReplays,{phase,side,players:selectedPlayers}));
  },[selectedPlayers,mapReplays]);
  function replaceRounds(ids) {setPhase(null);setSelectedRounds(ids);}
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
          if (remaining.length>=8) throw new Error('Remove a replay before opening more (8-match limit).');
          const count = [...remaining,replay].reduce((sum,r)=>sum+replaySampleCount(r),0);
          if (count > 2000000) throw new Error('Open replays exceed two million positions. Remove a match first.');
          loaded = [...remaining,replay]; setReplays(loaded); setMapName(replay.map); setPhase(null);
          setSelectedRounds([`${replay.match_uid}:${replay.rounds[0].number}`]);
          setSelectedPlayers([...new Set(loaded.filter(r=>r.map===replay.map).flatMap(r=>r.players.map(p=>p.id)))]);
        } catch (failure) { if (controller.signal.aborted) throw failure; messages.push(`${file.name}: ${failure.message}`); }
      }
    } catch (failure) { if (!controller.signal.aborted) messages.push(failure.message); }
    finally { setBusy(false); setStatus(''); setError(messages.join(' ')); operation.current = null; }
  }
  function changeMap(value) {
    setMapName(value); setPhase(null);
    const replay = replays.find(r=>r.map===value);
    setSelectedRounds(replay ? [`${replay.match_uid}:${replay.rounds[0].number}`] : []);
    setSelectedPlayers([...new Set(replays.filter(r=>r.map===value).flatMap(r=>r.players.map(p=>p.id)))]);
  }
  function remove(uid) {
    const remaining = replays.filter(r=>r.match_uid!==uid); setReplays(remaining);
    setSelectedRounds(ids=>ids.filter(id=>!id.startsWith(`${uid}:`)));
    const retained = new Set(remaining.filter(r=>r.map===mapName).flatMap(r=>r.players.map(p=>p.id)));
    setSelectedPlayers(ids=>ids.filter(id=>retained.has(id)));
    if (!remaining.some(r=>r.map===mapName)) {
      const next = remaining[0]; setMapName(next?.map||''); setPhase(null);
      setSelectedRounds(next ? [`${next.match_uid}:${next.rounds[0].number}`] : []);
      setSelectedPlayers(next?.players.map(p=>p.id)||[]);
    }
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
    {!replays.length && <p className="analyzer-empty">Open a .dem or .dem.zst to capture movement locally. Save the replay to reopen it without parsing again.</p>}
    {!!replays.length && <>
      <div className="analyzer-options">
        <OptionField label="Map" value={mapName} options={[...new Set(replays.map(r=>r.map))].map(m=>[m,m.replace(/^de_/, '')])} onChange={changeMap} />

      </div>
      <div className="analyzer-workspace">
        <div className="analyzer-stage">
          <MapWindow map={map} mapName={mapName} layout={layout} setLayout={setLayout} rounds={rounds} players={players} selected={selectedPlayers} colors={colors} time={time} side={side} utilities={utilities}
            controls={<AnalyzerControls players={players} selectedPlayers={selectedPlayers} setSelectedPlayers={setSelectedPlayers}
              colors={colors} utilities={utilities} setUtilities={setUtilities} side={side} onSide={value=>selectPreset(phase||'all',value)} selectedCount={rounds.length}
              roundPicker={{replays:mapReplays,selected:selectedRounds,onRemove:remove,onDownload:downloadReplay,busy,phase,onPreset:selectPreset,onReplace:replaceRounds,
                onToggle:(id,checked)=>{setPhase(null);setSelectedRounds(previous=>checked?[...new Set([...previous,id])]:previous.filter(v=>v!==id));}}} />} />
          {!!duration && <PlaybackControls time={time} duration={duration} playing={playing} setPlaying={setPlaying} onSeek={setTime} speed={speed} setSpeed={setSpeed} />}
          {map && <div className="analyzer-caption">Time from freeze end · {rounds.length} selected {rounds.length===1?'round':'rounds'} · Smoke / fire areas approximate</div>}
          {mapReplays.some(r=>r.version===1) && <p className="analyzer-caption">Reopen the original demo to add grenade flight paths and recorded utility expiry to older replays.</p>}
        </div>
      </div>
    </>}
  </section>;
}
