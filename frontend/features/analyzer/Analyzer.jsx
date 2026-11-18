import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import CheckboxGroup from '../../shared/components/forms/CheckboxGroup.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import ReplayMap from './ReplayMap.jsx';
import PlaybackControls from './PlaybackControls.jsx';
import RoundPicker from './RoundPicker.jsx';
import mapData from './state/maps.json';
import { PLAYER_COLORS, UTILITY_TYPES } from './state/replay.mjs';
import { openReplayFile, downloadReplay } from './state/files.mjs';

export default function Analyzer() {
  const [replays,setReplays] = useState([]), [mapName,setMapName] = useState(''), [levelId,setLevelId] = useState('default');
  const [selectedRounds,setSelectedRounds] = useState([]), [selectedPlayers,setSelectedPlayers] = useState([]);
  const [utilities,setUtilities] = useState(UTILITY_TYPES), [side,setSide] = useState(0), [trails,setTrails] = useState(true);
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
  const rounds = useMemo(() => replays.filter(r=>r.map===mapName).flatMap(r=>r.rounds.filter(round=>selectedRounds.includes(`${r.match_uid}:${round.number}`))), [replays,mapName,selectedRounds]);
  const duration = Math.max(0,...rounds.map(r=>r.duration)), map = mapData.maps[mapName];
  const level = map?.levels.find(l=>l.id===levelId) || map?.levels[0];
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
  const toggle = (setter, value, checked) => setter(previous => checked ? [...new Set([...previous,value])] : previous.filter(v=>v!==value));
  async function openFiles(files) {
    if (!files.length || busy) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(''); setPlaying(false);
    let loaded = [...replays], messages = [];
    try {
      for (const file of files) {
        controller.signal.throwIfAborted();
        if (loaded.length >= 8) { messages.push('Remove a replay before opening more (8-match limit).'); break; }
        try {
          const replay = await openReplayFile(file,{ signal:controller.signal, onStatus:setStatus });
          if (loaded.some(r=>r.match_uid===replay.match_uid)) { messages.push(`${file.name}: this match is already open.`); continue; }
          const count = [...loaded,replay].reduce((sum,r)=>sum+r.rounds.reduce((s,round)=>s+round.tracks.reduce((n,t)=>n+t.samples.length,0),0),0);
          if (count > 2000000) throw new Error('Open replays exceed two million positions. Remove a match first.');
          loaded = [...loaded,replay]; setReplays(loaded); setMapName(replay.map); setLevelId('default');
          setSelectedRounds([`${replay.match_uid}:${replay.rounds[0].number}`]);
          setSelectedPlayers([...new Set(loaded.filter(r=>r.map===replay.map).flatMap(r=>r.players.map(p=>p.id)))]);
        } catch (failure) { if (controller.signal.aborted) throw failure; messages.push(`${file.name}: ${failure.message}`); }
      }
    } catch (failure) { if (!controller.signal.aborted) messages.push(failure.message); }
    finally { setBusy(false); setStatus(''); setError(messages.join(' ')); operation.current = null; }
  }
  function changeMap(value) {
    setMapName(value); setLevelId('default');
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
      const next = remaining[0]; setMapName(next?.map||''); setLevelId('default');
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
        {map?.levels.length > 1 && <OptionField label="Level" value={level.id} options={map.levels.map(l=>[l.id,l.id==='default'?'Upper':'Lower'])} onChange={setLevelId} />}
        <OptionField label="Side" value={String(side)} options={[["0","Both"],["2","T"],["3","CT"]]} onChange={v=>setSide(Number(v))} />
        <label className="analyzer-check"><input type="checkbox" checked={trails} onChange={e=>setTrails(e.target.checked)} />5-second trails</label>
      </div>
      <div className="analyzer-workspace">
        <div className="analyzer-stage">
          {map ? <ReplayMap map={map} level={level} rounds={rounds} players={players} selected={selectedPlayers} colors={colors} time={time} side={side} utilities={utilities} trails={trails} />
            : <p role="status">No calibrated radar is available for {mapName} yet.</p>}
          {!!duration && <PlaybackControls time={time} duration={duration} playing={playing} setPlaying={setPlaying} onSeek={setTime} speed={speed} setSpeed={setSpeed} />}
          {map && <div className="analyzer-caption">Time from freeze end · {rounds.length} selected {rounds.length===1?'round':'rounds'} · Utility: detonation/start markers</div>}
        </div>
        <aside className="analyzer-sidebar">
          <div className="analyzer-picker-head"><strong>Players</strong><Button className="button button-secondary" onClick={()=>setSelectedPlayers(selectedPlayers.length===players.length?[]:players.map(p=>p.id))}>{selectedPlayers.length===players.length?'Clear':'All'}</Button></div>
          <CheckboxGroup label="Analyzer players" className="analyzer-players" labelClassName="analyzer-player" options={players.map(p=>[p.id,p.name,{}, {style:{'--player-color':colors.get(p.id)}}])} selected={selectedPlayers} onChange={(id,checked)=>toggle(setSelectedPlayers,id,checked)} />
          <strong>Utility</strong><CheckboxGroup label="Utility markers" className="analyzer-utility" options={UTILITY_TYPES.map(t=>[t,t])} selected={utilities} onChange={(type,checked)=>toggle(setUtilities,type,checked)} />
          <strong>Rounds</strong>
          <RoundPicker replays={replays} map={mapName} selected={selectedRounds} onRemove={remove} onDownload={downloadReplay} busy={busy} onToggle={(id,checked)=>{
            if (checked && selectedRounds.length >= 24) { setError('Select up to 24 rounds to overlay.'); return; }
            setError(''); toggle(setSelectedRounds,id,checked);
          }} />
        </aside>
      </div>
    </>}
  </section>;
}
