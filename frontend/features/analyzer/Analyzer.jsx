import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import RoundClock from './RoundClock.jsx';
import VisualControls from './VisualControls.jsx';
import KillFeed from './KillFeed.jsx';
import { roundCombat } from './state/kill-feed.mjs';
import { createDisplay,hasEnemyMovement } from './state/display.mjs';
import UtilitySearch from './UtilitySearch.jsx';
import { utilityScopes,utilityWatchKey } from './state/utility-search.mjs';
import { utilityKeys } from './state/map-selection.mjs';
import SourcePicker from './SourcePicker.jsx';
import useMatchFilters from './hooks/useMatchFilters.js';
import AreaSummary from './AreaSummary.jsx';
import { summarizeArea } from './state/area-selection.mjs';
import { selectionRoundKey } from './state/selection-targets.mjs';
import RoundPicker from './RoundPicker.jsx';
import { rosterIndex,rosterPlayers,instanceFocus } from './state/instances.mjs';
import { mergeSelection } from './state/map-selection.mjs';
import { createMovementCache, movementSelection } from './state/movement-cache.mjs';
import { groupRoundKeys } from './state/query.mjs';
import { loadCaptureHeaders, loadSelectedRounds } from './state/server.mjs';
import Button from '../../shared/components/buttons/Button.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import MapWindow from './MapWindow.jsx';
import AnalyzerControls from './AnalyzerControls.jsx';
import { matchesRound, toggleRoundSet, replaySampleCount } from './state/round-selection.mjs';
import PlaybackControls from './PlaybackControls.jsx';
import mapData from './state/maps.json';
import { PLAYER_COLORS } from './state/replay.mjs';
import { openReplayFile } from './state/files.mjs';

export default function Analyzer({entryStore}) {
  const entry=useSyncExternalStore(entryStore.subscribe,entryStore.getSnapshot);
  const matchFilters=useMatchFilters();
  const [area,setArea]=useState(null),[openMenu,setOpenMenu]=useState(null);
  const [roundFocus,setRoundFocus]=useState(null),[utilitySearch,setUtilitySearch]=useState(false),[utilityWatch,setUtilityWatch]=useState(null);
  const appliedWatch=useRef(null);
  const [showEnemies,setShowEnemies]=useState(false),[display,setDisplay]=useState(createDisplay),[enemyDisplay,setEnemyDisplay]=useState(createDisplay);
  const [mode,setMode]=useState('match'),[queryPlayers,setQueryPlayers]=useState(null);
  const [groupRounds,setGroupRounds]=useState({sections:[],numbers:[]}),[cacheRevision,setCacheRevision]=useState(0);
  const [loadingRounds,setLoadingRounds]=useState(false),[retry,setRetry]=useState(0);
  const roundOperation=useRef(null),movementCache=useRef(null);
  if(!movementCache.current)movementCache.current=createMovementCache();
  const [replays,setReplays] = useState([]), [mapName,setMapName] = useState('');
  const [selectedRounds,setSelectedRounds] = useState([]), [selectedPlayers,setSelectedPlayers] = useState([]);
  const [side,setSide] = useState(0);
  const [time,setTime] = useState(0), [playing,setPlaying] = useState(false), [speed,setSpeed] = useState(1);
  const [busy,setBusy] = useState(false), [status,setStatus] = useState(''), [error,setError] = useState('');
  const [filters,setFilters]=useState({result:'all',buy:[],enemyBuy:[]});
  const operation = useRef(null),sourceIdentity=useRef('');
  useEffect(() => () => { operation.current?.abort();roundOperation.current?.abort(); }, []);
  const clearSource=useCallback(()=>{operation.current?.abort();roundOperation.current?.abort();operation.current=null;roundOperation.current=null;setReplays([]);setArea(null);setUtilityWatch(null);setMapName('');setQueryPlayers(null);setBusy(false);setLoadingRounds(false);setError('');setStatus('');setPlaying(false);},[]);
  const chooseSource=useCallback(async source=>{
    clearSource();setMode(source.mode);setQueryPlayers(source.mode==='groups'?source.players:null);
    const identity=source.mode==='groups'?`groups:${source.players.map(p=>p.id).join(',')}`:`match:${source.matches[0]?.id}`;
    const reset=identity!==sourceIdentity.current;
    if(reset){setRoundFocus(null);setFilters({result:'all',buy:[],enemyBuy:[]});setSide(0);setGroupRounds({sections:[],numbers:[]});}
    const available=source.matches.filter(m=>m.capture);
    if(!available.length){if(source.matches.length)setError('No movement is stored for this selection. Reparse these demos from Match to capture it.');return;}
    const controller=new AbortController();operation.current=controller;setBusy(true);
    try {
      const loaded=await loadCaptureHeaders(available,{signal:controller.signal,onStatus:setStatus});controller.signal.throwIfAborted();
      sourceIdentity.current=identity;setReplays(loaded);setMapName(loaded[0].map);
      const availablePlayers=source.mode==='groups'?source.players.filter(p=>p.steam_id).map(p=>`steam:${p.steam_id}`):loaded[0].players.map(p=>p.id);
      setSelectedPlayers(previous=>reset?availablePlayers:previous.filter(id=>availablePlayers.includes(id)));
      if(reset)setSelectedRounds([`${loaded[0].match_uid}:${loaded[0].rounds[0].number}`]);
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(operation.current===controller){setBusy(false);setStatus('');operation.current=null;}}
  },[clearSource]);
  useEffect(() => {
    const pause = () => setPlaying(false);
    const navigate = event => { if (event.detail.page !== 'analyzer') pause(); };
    document.addEventListener('visibilitychange',pause); window.addEventListener('nickstats:page',navigate);
    return () => { document.removeEventListener('visibilitychange',pause); window.removeEventListener('nickstats:page',navigate); };
  }, []);
  const players = useMemo(() => queryPlayers ? queryPlayers.filter(p=>p.steam_id).map(p=>({id:`steam:${p.steam_id}`,name:p.name,steam_id:p.steam_id})) : [...new Map(replays.filter(r=>r.map===mapName).flatMap(r=>r.players.map(p=>[p.id,p]))).values()], [replays,mapName,queryPlayers]);
  const mapPlayers = useMemo(()=>[...new Map(replays.flatMap(r=>r.players.map(p=>[p.id,p]))).values()],[replays]);
  const colors = useMemo(() => new Map([...mapPlayers.map(p=>[p.id,'#ff7373']),...players.map((p,i)=>[p.id,PLAYER_COLORS[i%PLAYER_COLORS.length]])]), [players,mapPlayers]);
  const mapReplays = useMemo(()=>replays.filter(r=>r.map===mapName),[replays,mapName]);
  const remote=mapReplays.some(r=>r.capture);
  const eligibleKeys=useMemo(()=>{
    const keys=mode==='groups'?groupRoundKeys(mapReplays,groupRounds,{...filters,players:selectedPlayers,side}):
      mapReplays.flatMap(r=>r.rounds.filter(round=>selectedRounds.includes(`${r.match_uid}:${round.number}`)&&matchesRound(round,{...filters,players:selectedPlayers,side})).map(round=>`${r.match_uid}:${round.number}`));
    return roundFocus?.map===mapName?keys.filter(key=>roundFocus.keys.includes(key)):keys;
  },[mapReplays,mode,groupRounds,filters,selectedPlayers,side,selectedRounds,roundFocus,mapName]);
  const searchScopes=useMemo(()=>utilityScopes(mapReplays,eligibleKeys),[mapReplays,eligibleKeys]);
  useEffect(()=>{setUtilityWatch(null);appliedWatch.current=utilityWatch;if(utilitySearch){setArea(null);setTime(0);}},[searchScopes,selectedPlayers]);
  const watchedKey=utilityWatch?utilityWatchKey(mapReplays,utilityWatch):null;
  const roundKeys=useMemo(()=>utilitySearch?(watchedKey&&eligibleKeys.includes(watchedKey)?[watchedKey]:[]):eligibleKeys,[utilitySearch,watchedKey,eligibleKeys]);
  const focus=useMemo(()=>roundFocus?.map===mapName?instanceFocus(roundFocus.instances):null,[roundFocus,mapName]);
  const rosters=useMemo(()=>rosterIndex(mapReplays,selectedPlayers,{enemies:mode==='groups'&&showEnemies&&hasEnemyMovement(enemyDisplay),focus,side}),[mapReplays,selectedPlayers,mode,showEnemies,enemyDisplay,focus,side]);
  const playersForRound=useCallback((replay,round)=>rosterPlayers(rosters.get(`${replay.match_uid}:${round.number}`)),[rosters]);
  const cachedRounds=useMemo(()=>{
    if(!remote)return null;
    try{return movementCache.current.read(movementSelection(mapReplays,roundKeys,selectedPlayers,{playersForRound}));}catch{return null;}
  },[remote,mapReplays,roundKeys,selectedPlayers,playersForRound,retry,cacheRevision]);
  useEffect(()=>{
    roundOperation.current?.abort();roundOperation.current=null;

    if(!remote||cachedRounds!==null||!roundKeys.length||!selectedPlayers.length){setLoadingRounds(false);setStatus('');if(cachedRounds!==null)setError('');return;}
    const controller=new AbortController();roundOperation.current=controller;setLoadingRounds(true);setError('');
    loadSelectedRounds(mapReplays,roundKeys,selectedPlayers,{signal:controller.signal,onStatus:setStatus,cache:movementCache.current,playersForRound})
      .then(rounds=>{controller.signal.throwIfAborted();setCacheRevision(v=>v+1);})
      .catch(e=>{if(!controller.signal.aborted){controller.abort();setError(e.message);}})
      .finally(()=>{if(roundOperation.current===controller){setLoadingRounds(false);setStatus('');roundOperation.current=null;}});
    return()=>controller.abort();
  },[remote,mapReplays,roundKeys,selectedPlayers,playersForRound,retry]);
  const rounds=useMemo(()=>remote?(cachedRounds??[]):mapReplays.flatMap(r=>r.rounds.filter(round=>roundKeys.includes(`${r.match_uid}:${round.number}`)).map(round=>({...round,match_uid:r.match_uid}))),[remote,cachedRounds,mapReplays,roundKeys]);
  useEffect(()=>{
    if(!utilitySearch||!utilityWatch||appliedWatch.current===utilityWatch||loadingRounds)return;
    const round=rounds.find(r=>`${r.match_uid}:${r.number}`===watchedKey);if(!round)return;
    const index=round.utility.findIndex(e=>e.event_number===utilityWatch.event);if(index<0){setError('Reload this capture to locate the selected throw.');return;}
    appliedWatch.current=utilityWatch;setPlaying(false);setTime(Math.max(0,utilityWatch.time-3000));
    setArea({map:mapName,items:[{roundKey:watchedKey,player:utilityWatch.player,side:utilityWatch.side,utilities:[utilityKeys(round)[index]]}]});
  },[utilitySearch,utilityWatch,watchedKey,rounds,loadingRounds,mapName]);
  function watchUtility(row){setUtilityWatch({...row});appliedWatch.current=null;setPlaying(false);setDisplay(value=>({...value,utilities:[...new Set([...value.utilities,row.type])],utilityLayers:[...new Set([...value.utilityLayers,'Live','History'])]}));requestAnimationFrame(()=>document.querySelector('.analyzer-map-window')?.scrollIntoView({block:'nearest'}));}
  function chooseUtilitySearch(value){setUtilitySearch(value);setUtilityWatch(null);setArea(null);setTime(0);setPlaying(false);setOpenMenu(null);}
  const duration = rounds.reduce((max,r)=>Math.max(max,r.duration),0), map = Object.hasOwn(mapData.maps,mapName) ? mapData.maps[mapName] : null;
  const areaSummary=useMemo(()=>area?.map===mapName&&rounds.length?summarizeArea(rounds,{players:mapPlayers.map(p=>p.id),selection:area.items,rosters}):null,[rounds,area,mapName,mapPlayers,rosters]);
  function selectItems(items,append=false) {
    setPlaying(false);
    setArea(previous=>({map:mapName,items:mergeSelection(previous?.map===mapName?previous.items:[],items,append)}));
  }
  useEffect(() => { if(!area||mapName&&area.map!==mapName)setTime(0);setPlaying(false); }, [selectedRounds,groupRounds,mapName,filters,selectedPlayers,side]);
  useEffect(()=>{if(rounds.length)setTime(value=>Math.min(value,duration));},[rounds,duration]);
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
  function focusArea() {
    if(utilitySearch){setUtilitySearch(false);setUtilityWatch(null);}
    const keys=[...(areaSummary?.matched||[])].map(selectionRoundKey).filter(Boolean);if(!keys.length)return;
    setRoundFocus({map:mapName,keys,instances:areaSummary.instances,previousMatchRounds:mode==='match'?[...selectedRounds]:null});if(mode==='match')setSelectedRounds(keys);setArea(null);setTime(0);setPlaying(false);
  }
  function clearRoundFocus(){if(mode==='match'&&roundFocus?.previousMatchRounds)setSelectedRounds(roundFocus.previousMatchRounds);setRoundFocus(null);}
  async function openFiles(files) {
    if (!files.length || busy || loadingRounds) return;
    clearSource();movementCache.current.clear();setRoundFocus(null);sourceIdentity.current='local';setMode('match');
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(''); setPlaying(false);
    let loaded = remote?[]:[...replays], messages = [];
    try {
      for (const file of files) {
        controller.signal.throwIfAborted();
        try {
          const replay = await openReplayFile(file,{ signal:controller.signal, onStatus:setStatus });
          const remaining = loaded.filter(r=>r.map===replay.map&&r.match_uid!==replay.match_uid);
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
  const combat=useMemo(()=>rounds.length===1?roundCombat(rounds[0],{rosters,players:selectedPlayers,side,display,enemyDisplay}):{kills:[],feed:[]},[rounds,rosters,selectedPlayers,side,display,enemyDisplay]);
  const displayedRounds=utilitySearch&&watchedKey?[watchedKey]:selectedRounds;
  const roundPicker={replays:mapReplays,selected:displayedRounds,filters:{...filters,side,players:selectedPlayers},
    onNavigate:key=>{setUtilitySearch(false);setUtilityWatch(null);setSelectedRounds([key]);setRoundFocus(null);setArea(null);setTime(0);setPlaying(false);},onToggleSet:keys=>{if(utilitySearch&&watchedKey){setUtilitySearch(false);setUtilityWatch(null);}setSelectedRounds(toggleRoundSet(displayedRounds,keys));setRoundFocus(null);}};
  return <section className="analyzer-view" aria-label="2D analyzer">
    <SourcePicker mode={mode} onMode={setMode} entry={entry} matchFilters={matchFilters} onChoose={chooseSource} onClear={clearSource} />
    {utilitySearch&&<UtilitySearch scopes={searchScopes} players={selectedPlayers} names={mapPlayers} onWatch={watchUtility} onClose={()=>chooseUtilitySearch(false)} />}
    <MapWindow searchIdle={utilitySearch&&!utilityWatch} map={map} mapName={mapName} rounds={rounds} players={mapPlayers} selected={selectedPlayers} colors={colors} time={time} side={side} display={display} enemyDisplay={enemyDisplay} rosters={rosters}
      roundStrip={mode==='match'?<RoundPicker {...roundPicker} />:null}
      area={area?.map===mapName?area:null} areaSummary={areaSummary} onSelectItems={selectItems} onClearSelection={()=>setArea(null)} onAreaStart={()=>setPlaying(false)}
      clockOverlay={mode==='match'&&rounds.length===1&&<RoundClock round={rounds[0]} time={time} />}
      combatOverlay={rounds.length===1&&<KillFeed events={combat.feed} time={time} players={mapPlayers} colors={colors} />}
      areaOverlay={areaSummary&&<AreaSummary summary={areaSummary} loading={busy||loadingRounds} onClear={()=>setArea(null)} onFocus={focusArea} />}
      actions={<div className="analyzer-import">
        {mode==='match'&&!utilitySearch&&<label className={`button button-primary${busy||loadingRounds?' disabled':''}`}>Open
          <input aria-label="Open demos or replays" type="file" multiple accept=".dem,.zst,.json" disabled={busy||loadingRounds} onChange={e=>{const files=Array.from(e.target.files);e.target.value='';openFiles(files);}} />
        </label>}
        {(busy||loadingRounds)&&<Button className="button button-secondary" onClick={()=>{operation.current?.abort();roundOperation.current?.abort();}}>Cancel</Button>}
        {remote&&(!utilitySearch||utilityWatch)&&!busy&&!loadingRounds&&<Button className="button button-secondary" onClick={()=>{movementCache.current.invalidateCaptures(mapReplays.map(r=>r.capture));setRetry(v=>v+1);}}>Reload selection</Button>}
      </div>}
      status={<><FormMessage className="analyzer-status">{status}</FormMessage><FormMessage error className="analyzer-error">{error}</FormMessage></>}
      visuals={<VisualControls mode={mode} open={openMenu==='visuals'} onToggle={()=>setOpenMenu(value=>value==='visuals'?null:'visuals')}
        showEnemies={showEnemies} onShowEnemies={setShowEnemies} display={display} setDisplay={setDisplay} enemyDisplay={enemyDisplay} setEnemyDisplay={setEnemyDisplay} />}
      controls={<AnalyzerControls utilitySearch={utilitySearch} onUtilitySearch={chooseUtilitySearch} open={openMenu==='filters'} onToggle={()=>setOpenMenu(value=>value==='filters'?null:'filters')} players={players} selectedPlayers={selectedPlayers} setSelectedPlayers={setSelectedPlayers}
        colors={colors} side={side} onSide={setSide} filters={filters} setFilters={setFilters} selectedCount={utilitySearch&&!utilityWatch?eligibleKeys.length:rounds.length}
        roundFocus={roundFocus?.map===mapName?roundFocus:null} onClearFocus={clearRoundFocus}
        matchFilters={mode==='groups'?matchFilters:null}
        groupRounds={mode==='groups'?{replays:mapReplays,value:groupRounds,onChange:setGroupRounds}:null}
        />}
      playback={<PlaybackControls time={time} duration={duration} playing={playing} setPlaying={setPlaying} onSeek={setTime} speed={speed} setSpeed={setSpeed} kills={combat.kills} players={mapPlayers} round={mode==='match'&&rounds.length===1?rounds[0]:null} onKillSeek={value=>{setPlaying(false);setTime(value);}} />} />
  </section>;
}
