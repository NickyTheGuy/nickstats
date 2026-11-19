import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import RoundClock from './RoundClock.jsx';
import VisualControls from './VisualControls.jsx';
import KillFeed from './KillFeed.jsx';
import { roundCombat } from './state/kill-feed.mjs';
import { createDisplay,hasEnemyMovement } from './state/display.mjs';
import UtilitySearch from './UtilitySearch.jsx';
import { utilityScopes,utilityResultRounds,utilityResultDisplay } from './state/utility-search.mjs';
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
import IconButton from '../../shared/components/buttons/IconButton.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import MapWindow from './MapWindow.jsx';
import AnalyzerControls from './AnalyzerControls.jsx';
import { matchesRound, toggleRoundSet } from './state/round-selection.mjs';
import PlaybackControls from './PlaybackControls.jsx';
import mapData from './state/maps.json';
import { PLAYER_COLORS } from './state/replay.mjs';
import useRememberedState from '../../shared/hooks/useRememberedState.js';
import { browserPreferences } from '../../shared/state/preferences.mjs';
import { preference,sourcePreferences,displayPreferences,roundPreferences,groupRoundPreferences,strings,numberIn,boolean,focusPreferences } from './state/preferences.mjs';

export default function Analyzer({entryStore}) {
  const [savedSource]=useState(()=>browserPreferences().read(preference('source'),()=>sourcePreferences(null),sourcePreferences));
  const resumeTime=useRef(savedSource.loaded?browserPreferences().read(preference('time'),0,value=>numberIn(value,0,600000,0)):null);
  const entry=useSyncExternalStore(entryStore.subscribe,entryStore.getSnapshot);
  const matchFilters=useMatchFilters(savedSource);
  const [area,setArea]=useState(null),[openMenu,setOpenMenu]=useState(null);
  const [roundFocus,setRoundFocus]=useRememberedState(preference('focus'),null,focusPreferences),[utilityResults,setUtilityResults]=useState(null);
  const [showEnemies,setShowEnemies]=useRememberedState(preference('showEnemies'),false,boolean),[display,setDisplay]=useRememberedState(preference('display'),createDisplay,displayPreferences),[enemyDisplay,setEnemyDisplay]=useRememberedState(preference('enemyDisplay'),createDisplay,displayPreferences);
  const [mode,setMode]=useState(savedSource.mode),[queryPlayers,setQueryPlayers]=useState(null);
  const [groupRounds,setGroupRounds]=useRememberedState(preference('groupRounds'),()=>({sections:[],numbers:[]}),groupRoundPreferences),[cacheRevision,setCacheRevision]=useState(0);
  const [loadingRounds,setLoadingRounds]=useState(false);
  const roundOperation=useRef(null),movementCache=useRef(null);
  if(!movementCache.current)movementCache.current=createMovementCache();
  const [replays,setReplays] = useState([]), [mapName,setMapName] = useState('');
  const [selectedRounds,setSelectedRounds] = useRememberedState(preference('rounds'),[],strings), [selectedPlayers,setSelectedPlayers] = useRememberedState(preference('players'),[],value=>strings(value,64));
  const [side,setSide] = useRememberedState(preference('side'),0,value=>[0,2,3].includes(value)?value:0);
  const [time,setTime] = useRememberedState(preference('time'),0,value=>numberIn(value,0,600000,0)), [playing,setPlaying] = useState(false), [speed,setSpeed] = useRememberedState(preference('speed'),1,value=>[.5,1,2,4].includes(value)?value:1);
  const [eventStart,setEventStart]=useRememberedState(preference('eventStart'),0,value=>numberIn(value,0,600000,0));
  const startTime=Math.min(eventStart,time);
  const seekTime=useCallback(value=>{setTime(value);setEventStart(start=>Math.min(start,value));},[setTime,setEventStart]);
  const [busy,setBusy] = useState(false), [status,setStatus] = useState(''), [error,setError] = useState('');
  const [filters,setFilters]=useRememberedState(preference('filters'),()=>({result:'all',buy:[],enemyBuy:[]}),roundPreferences);
  const operation = useRef(null),sourceIdentity=useRef(browserPreferences().read(preference('identity'),'',value=>typeof value==='string'?value:''));
  useEffect(() => () => { operation.current?.abort();roundOperation.current?.abort(); }, []);
  const clearSource=useCallback(()=>{operation.current?.abort();roundOperation.current?.abort();operation.current=null;roundOperation.current=null;setReplays([]);setArea(null);setUtilityResults(null);setMapName('');setQueryPlayers(null);setBusy(false);setLoadingRounds(false);setError('');setStatus('');setPlaying(false);},[]);
  const chooseSource=useCallback(async source=>{
    clearSource();setMode(source.mode);setQueryPlayers(source.mode==='groups'?source.players:null);
    const identity=source.mode==='groups'?`groups:${source.players.map(p=>p.id).join(',')}`:`match:${source.matches[0]?.id}`;
    const reset=identity!==sourceIdentity.current;
    if(reset){setEventStart(0);resumeTime.current=null;setRoundFocus(null);setFilters({result:'all',buy:[],enemyBuy:[]});setSide(0);setGroupRounds({sections:[],numbers:[]});}
    const available=source.matches.filter(m=>m.capture);
    if(!available.length){if(source.matches.length)setError('No movement is stored for this selection. Reparse these demos from Match to capture it.');return;}
    const controller=new AbortController();operation.current=controller;setBusy(true);
    try {
      const loaded=await loadCaptureHeaders(available,{signal:controller.signal,onStatus:setStatus});controller.signal.throwIfAborted();
      setRoundFocus(previous=>{if(!previous||previous.map!==loaded[0].map)return previous;const keys=new Set(loaded.flatMap(r=>r.rounds.map(round=>`${r.match_uid}:${round.number}`)));return previous.keys.every(key=>keys.has(key))?previous:null;});
      sourceIdentity.current=identity;browserPreferences().set(preference('identity'),identity);setReplays(loaded);setMapName(loaded[0].map);
      const availablePlayers=source.mode==='groups'?source.players.filter(p=>p.steam_id).map(p=>`steam:${p.steam_id}`):loaded[0].players.map(p=>p.id);
      setSelectedPlayers(previous=>reset?availablePlayers:previous.filter(id=>availablePlayers.includes(id)));
      setSelectedRounds(previous=>{const keys=new Set(loaded.flatMap(r=>r.rounds.map(round=>`${r.match_uid}:${round.number}`))),kept=previous.filter(key=>keys.has(key));return reset||previous.length&&!kept.length?[`${loaded[0].match_uid}:${loaded[0].rounds[0].number}`]:kept;});
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
  const searchIdentity=JSON.stringify([searchScopes,selectedPlayers,side]);
  useEffect(()=>{setUtilityResults(null);setArea(null);},[searchIdentity]);
  const result=utilityResults?.identity===searchIdentity?utilityResults.data:null;
  const applyUtilityResults=useCallback(data=>{setUtilityResults(data?{identity:searchIdentity,data}:null);setArea(null);setPlaying(false);},[searchIdentity]);
  const roundKeys=useMemo(()=>result?[]:eligibleKeys,[result,eligibleKeys]);
  const focus=useMemo(()=>roundFocus?.map===mapName?instanceFocus(roundFocus.instances):null,[roundFocus,mapName]);
  const movementRosters=useMemo(()=>rosterIndex(mapReplays,selectedPlayers,{enemies:mode==='groups'&&showEnemies&&hasEnemyMovement(enemyDisplay),focus,side}),[mapReplays,selectedPlayers,mode,showEnemies,enemyDisplay,focus,side]);
  const playersForRound=useCallback((replay,round)=>rosterPlayers(movementRosters.get(`${replay.match_uid}:${round.number}`)),[movementRosters]);
  const cachedRounds=useMemo(()=>{
    if(!remote)return null;
    try{return movementCache.current.read(movementSelection(mapReplays,roundKeys,selectedPlayers,{playersForRound}));}catch{return null;}
  },[remote,mapReplays,roundKeys,selectedPlayers,playersForRound,cacheRevision]);
  useEffect(()=>{
    roundOperation.current?.abort();roundOperation.current=null;

    if(!remote||cachedRounds!==null||!roundKeys.length||!selectedPlayers.length){setLoadingRounds(false);setStatus('');if(cachedRounds!==null)setError('');return;}
    const controller=new AbortController();roundOperation.current=controller;setLoadingRounds(true);setError('');
    loadSelectedRounds(mapReplays,roundKeys,selectedPlayers,{signal:controller.signal,onStatus:setStatus,cache:movementCache.current,playersForRound})
      .then(rounds=>{controller.signal.throwIfAborted();setCacheRevision(v=>v+1);})
      .catch(e=>{if(!controller.signal.aborted){controller.abort();setError(e.message);}})
      .finally(()=>{if(roundOperation.current===controller){setLoadingRounds(false);setStatus('');roundOperation.current=null;}});
    return()=>controller.abort();
  },[remote,mapReplays,roundKeys,selectedPlayers,playersForRound]);
  const movementRounds=useMemo(()=>remote?(cachedRounds??[]):mapReplays.flatMap(r=>r.rounds.filter(round=>roundKeys.includes(`${r.match_uid}:${round.number}`)).map(round=>({...round,match_uid:r.match_uid}))),[remote,cachedRounds,mapReplays,roundKeys]);
  const rounds=useMemo(()=>result?utilityResultRounds(mapReplays,result.rows):movementRounds,[result,mapReplays,movementRounds]);
  const rosters=useMemo(()=>result?new Map(rounds.map(round=>[`${round.match_uid}:${round.number}`,{primary:[...new Set(round.utility.map(e=>e.player))],enemies:[]}])):movementRosters,[result,rounds,movementRosters]);
  const mapDisplay=useMemo(()=>result?utilityResultDisplay(result.type):display,[result,display]);
  useEffect(()=>{if(result){setPlaying(false);setTime(rounds.reduce((max,r)=>Math.max(max,r.duration),0));}},[result]);
  const duration = rounds.reduce((max,r)=>Math.max(max,r.duration),0), map = Object.hasOwn(mapData.maps,mapName) ? mapData.maps[mapName] : null;
  const areaSummary=useMemo(()=>area?.map===mapName&&rounds.length?summarizeArea(rounds,{players:mapPlayers.map(p=>p.id),selection:area.items,rosters}):null,[rounds,area,mapName,mapPlayers,rosters]);
  function selectItems(items,append=false) {
    setPlaying(false);
    setArea(previous=>({map:mapName,items:mergeSelection(previous?.map===mapName?previous.items:[],items,append)}));
  }
  useEffect(() => { if(resumeTime.current===null&&(!area||mapName&&area.map!==mapName))setTime(0);setPlaying(false); }, [selectedRounds,groupRounds,mapName,filters,selectedPlayers,side]);
  useEffect(()=>{if(rounds.length){if(resumeTime.current!==null){setTime(Math.min(resumeTime.current,duration));resumeTime.current=null;}else setTime(value=>Math.min(value,duration));}},[rounds,duration]);
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
  useEffect(()=>{if(resumeTime.current===null&&eventStart>time)setEventStart(time);},[time,eventStart,rounds.length]);
  useEffect(() => { if (time >= duration) setPlaying(false); }, [time,duration]);
  function focusArea() {
    setUtilityResults(null);
    const keys=[...(areaSummary?.matched||[])].map(selectionRoundKey).filter(Boolean);if(!keys.length)return;
    setRoundFocus({map:mapName,keys,instances:areaSummary.instances,previousMatchRounds:mode==='match'?[...selectedRounds]:null});if(mode==='match')setSelectedRounds(keys);setArea(null);setTime(0);setPlaying(false);
  }
  function clearRoundFocus(){if(mode==='match'&&roundFocus?.previousMatchRounds)setSelectedRounds(roundFocus.previousMatchRounds);setRoundFocus(null);}
  const combat=useMemo(()=>rounds.length===1?roundCombat(rounds[0],{rosters,players:selectedPlayers,side,display,enemyDisplay}):{kills:[],feed:[]},[rounds,rosters,selectedPlayers,side,display,enemyDisplay]);
  const roundPicker={replays:mapReplays,selected:selectedRounds,filters:{...filters,side,players:selectedPlayers},
    onNavigate:key=>{setUtilityResults(null);setSelectedRounds([key]);setRoundFocus(null);setArea(null);setTime(0);setPlaying(false);},onToggleSet:keys=>{setUtilityResults(null);setSelectedRounds(toggleRoundSet(selectedRounds,keys));setRoundFocus(null);}};
  return <section className="analyzer-view" aria-label="2D analyzer">
    <SourcePicker saved={savedSource} mode={mode} onMode={setMode} entry={entry} matchFilters={matchFilters} onChoose={chooseSource} onClear={clearSource} />
    <MapWindow map={map} mapName={mapName} rounds={rounds} players={mapPlayers} selected={selectedPlayers} colors={colors} time={time} startTime={startTime} side={side} display={mapDisplay} enemyDisplay={enemyDisplay} rosters={rosters}
      roundStrip={mode==='match'?<RoundPicker {...roundPicker} />:null}
      area={area?.map===mapName?area:null} areaSummary={areaSummary} onSelectItems={selectItems} onClearSelection={()=>setArea(null)} onAreaStart={()=>setPlaying(false)}
      clockOverlay={!result&&mode==='match'&&rounds.length===1&&<RoundClock round={rounds[0]} time={time} />}
      combatOverlay={rounds.length===1&&<KillFeed events={combat.feed} time={time} startTime={startTime} players={mapPlayers} colors={colors} />}
      areaOverlay={areaSummary&&<AreaSummary summary={areaSummary} loading={busy||loadingRounds} onClear={()=>setArea(null)} onFocus={focusArea} />}
      status={<><FormMessage className="analyzer-status">{status}</FormMessage><FormMessage error className="analyzer-error">{error}</FormMessage>
        {(busy||loadingRounds)&&<IconButton label="Cancel loading" className="button button-secondary" controlSize={30} onClick={()=>{operation.current?.abort();roundOperation.current?.abort();}}><path d="m6 6 12 12M6 18 18 6" /></IconButton>}
      </>}
      utility={<UtilitySearch scopes={searchScopes} players={selectedPlayers} side={side} result={result} onResults={applyUtilityResults} open={openMenu==='utility'} onToggle={()=>setOpenMenu(value=>value==='utility'?null:'utility')} />}
      visuals={<VisualControls mode={mode} open={openMenu==='visuals'} onToggle={()=>setOpenMenu(value=>value==='visuals'?null:'visuals')}
        showEnemies={showEnemies} onShowEnemies={setShowEnemies} display={display} setDisplay={setDisplay} enemyDisplay={enemyDisplay} setEnemyDisplay={setEnemyDisplay} />}
      controls={<AnalyzerControls replay={mode==='match'?mapReplays[0]:null} open={openMenu==='filters'} onToggle={()=>setOpenMenu(value=>value==='filters'?null:'filters')} players={players} selectedPlayers={selectedPlayers} setSelectedPlayers={setSelectedPlayers}
        colors={colors} side={side} onSide={setSide} filters={filters} setFilters={setFilters} selectedCount={result?rounds.length:eligibleKeys.length}
        roundFocus={roundFocus?.map===mapName?roundFocus:null} onClearFocus={clearRoundFocus}
        matchFilters={mode==='groups'?matchFilters:null}
        groupRounds={mode==='groups'?{replays:mapReplays,value:groupRounds,onChange:setGroupRounds}:null}
        />}
      playback={<PlaybackControls startTime={startTime} onStart={value=>setEventStart(Math.min(time,value))} time={time} duration={duration} playing={playing} setPlaying={setPlaying} onSeek={seekTime} speed={speed} setSpeed={setSpeed} kills={combat.kills} players={mapPlayers} round={!result&&mode==='match'&&rounds.length===1?rounds[0]:null} onKillSeek={value=>{setPlaying(false);seekTime(value);}} />} />
  </section>;
}
