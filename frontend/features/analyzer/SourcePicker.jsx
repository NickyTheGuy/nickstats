import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import ToggleGroup from '../../shared/components/forms/ToggleGroup.jsx';
import GroupBuilder from '../groups/GroupBuilder.jsx';
import { normalizeEditorRules } from '../groups/state/editing.mjs';
import PlayerSearch from '../players/search/PlayerSearch.jsx';
import { createPlayerSearch } from '../players/state/player-search.mjs';
import DateRangeFilter from '../filters/DateRangeFilter.jsx';
import TagFilter from '../filters/TagFilter.jsx';
import { DateRangeStore } from '../filters/state/date-range.mjs';
import { createTagFilterStore } from '../filters/state/tag-filter.mjs';
import { analyzerMatches, conditionPlayers, rulesForPlayers } from './state/query.mjs';
import { candidateMatches } from './state/server.mjs';

export default function SourcePicker({mode,onMode,entry,onChoose,onClear}) {
  const [players,setPlayers]=useState([]),[rules,setRules]=useState(()=>rulesForPlayers([]));
  const [matchID,setMatchID]=useState(''),[candidates,setCandidates]=useState(null),[map,setMap]=useState('');
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[revision,bump]=useState(0),[pendingTags,setPendingTags]=useState([]);
  const [search]=useState(()=>createPlayerSearch());
  const [dates]=useState(()=>new DateRangeStore({onChange:()=>bump(v=>v+1)}));
  const [tags]=useState(()=>createTagFilterStore(window.NickStatsManualFilters,{onChange:()=>bump(v=>v+1)}));
  const operation=useRef(null);
  useEffect(()=>()=>{operation.current?.abort();search.destroy();dates.destroy();tags.destroy();},[]);
  function invalidate() {operation.current?.abort();setPending(false);setCandidates(null);setError('');onClear();}
  function editPlayers(next) {invalidate();setPlayers(next);setRules(normalizeEditorRules(rules,next.map(p=>String(p.id))));}
  async function lookup(nextPlayers=players,nextMatchID=null) {
    operation.current?.abort();const controller=new AbortController();operation.current=controller;
    setPending(true);setError('');setCandidates(null);onClear();
    try {
      const matches=await candidateMatches({players:nextPlayers,matchID:nextMatchID,signal:controller.signal});
      controller.signal.throwIfAborted();
      if(nextMatchID) {
        if(!matches.length)throw new Error('This match was not found.');
        onChoose({mode:'match',matches,players:[]});
      } else setCandidates(matches);
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(operation.current===controller){setPending(false);operation.current=null;}}
  }
  useEffect(()=>{
    const store=window.NickStatsManualFilters.store;
    if(!pendingTags.length||!store.account||!store.ready||pendingTags.some(([id])=>!store.filters.some(tag=>tag.id===id)))return;
    tags.reset();for(const [id,condition]of pendingTags)tags.select(id,condition);setPendingTags([]);
  },[pendingTags,revision]);
  const matching=useMemo(()=>candidates===null||pendingTags.length?[]:analyzerMatches(candidates,rules,m=>dates.matches(m.played_at)&&tags.matches(m)),[candidates,rules,revision,pendingTags]);
  const maps=useMemo(()=>[...new Set(matching.map(m=>m.map))].sort(),[matching]);
  const chosenMap=maps.includes(map)?map:([...maps].sort((a,b)=>matching.filter(m=>m.map===b&&m.capture).length-matching.filter(m=>m.map===a&&m.capture).length)[0]||'');
  const scoped=useMemo(()=>matching.filter(m=>m.map===chosenMap),[matching,chosenMap]);
  const used=useMemo(()=>conditionPlayers(players,rules),[players,rules]);
  useEffect(()=>{
    if(mode==='groups'&&candidates!==null)onChoose({mode:'groups',matches:scoped,players:used,map:chosenMap});
  },[mode,candidates,scoped,used,chosenMap,onChoose]);
  useEffect(()=>{
    if(!entry)return;
    operation.current?.abort();search.reset();setError('');setCandidates(null);onMode(entry.mode);
    if(entry.mode==='match'){setPendingTags([]);setMatchID(entry.matchID);lookup([],entry.matchID);return;}
    const nextRules=normalizeEditorRules(entry.rules,entry.players.map(p=>p.id));
    setPlayers(entry.players);setRules(nextRules);setMap(entry.map||'');
    dates.from=entry.date?.from||'';dates.through=entry.date?.through||'';dates.closeMenus();
    tags.reset();setPendingTags(entry.tags||[]);
    lookup(entry.players);
  },[entry]);
  useEffect(()=>{
    const refresh=()=>{if(mode==='groups'&&candidates!==null)lookup();else if(mode==='match'&&matchID)lookup([],matchID);};
    window.addEventListener('nickstats:matches-changed',refresh);window.addEventListener('nickstats:replays-changed',refresh);
    return()=>{window.removeEventListener('nickstats:matches-changed',refresh);window.removeEventListener('nickstats:replays-changed',refresh);};
  },[mode,candidates,players,matchID]);
  const available=scoped.filter(m=>m.capture).length;
  return <section className="panel analyzer-source" aria-label="Analyzer source">
    <ToggleGroup label="Analyzer mode" className="side-toggle" value={mode} options={[["match","Match"],["groups","Groups"]]}
      onChange={value=>{invalidate();onMode(value);}} />
    {mode==='match'?<form className="analyzer-match-search" onSubmit={e=>{e.preventDefault();if(/^\d+$/.test(matchID)&&Number(matchID)>0)lookup([],matchID);}}>
      <label htmlFor="analyzerMatchID">Match</label><input id="analyzerMatchID" aria-label="Stored match ID" type="text" inputMode="numeric" value={matchID} placeholder="Match ID" onChange={e=>setMatchID(e.target.value)} />
      <Button type="submit" className="button button-primary" disabled={pending||!/^\d+$/.test(matchID)||Number(matchID)<=0}>Open match</Button>
    </form>:<>
      <PlayerSearch store={search} prefix="analyzer" variant="group" onSelect={player=>{if(players.length<20&&!players.some(p=>String(p.id)===String(player.id))){editPlayers([...players,{...player,id:String(player.id)}]);search.reset();}}} excluded={id=>players.some(p=>String(p.id)===id)||players.length>=20} />
      <GroupBuilder players={players} rules={rules} onRules={next=>{invalidate();setRules(next);}}
        onRemove={id=>editPlayers(players.filter(p=>String(p.id)!==String(id)))} />
      <div className="analyzer-match-filters">
        <div className="date-range-filter"><DateRangeFilter store={dates} target="analyzer" /></div>
        <div className="manual-filter-control"><TagFilter control={tags} api={window.NickStatsManualFilters} /></div>
        <Button className="button button-primary" disabled={pending||!players.length} onClick={()=>lookup()}>Find matches</Button>
      </div>
      {candidates!==null&&<div className="analyzer-query-result">
        {!!maps.length&&<OptionField label="Map" options={maps.map(name=>[name,`${name.replace(/^de_/,'')} · ${matching.filter(m=>m.map===name).length} matches`])} value={chosenMap} onChange={setMap} />}
        <span role="status">{scoped.length} matching {scoped.length===1?'match':'matches'}{chosenMap?` · ${available} with movement`:''}{scoped.length>available?` · ${scoped.length-available} need demo capture`:''}</span>
      </div>}
    </>}
    {pending&&<div className="analyzer-query-progress"><FormMessage>Finding matches…</FormMessage><Button className="button button-secondary" onClick={()=>{operation.current?.abort();setPending(false);}}>Cancel</Button></div>}
    {mode==='groups'&&!!pendingTags.length&&<div className="analyzer-query-progress"><FormMessage>{!window.NickStatsManualFilters.store.account?'Log in to apply the saved tag filters.':window.NickStatsManualFilters.store.ready?'Some saved tags are unavailable to this account.':'Loading saved tag filters…'}</FormMessage>
      <Button className="button button-secondary" onClick={()=>setPendingTags([])}>Clear saved tags</Button></div>}
    <FormMessage error>{error}</FormMessage>
  </section>;
}
