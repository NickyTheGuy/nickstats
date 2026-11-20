import TabList from '../../shared/components/navigation/TabList.jsx';
import { selectionPlayerOptions,playerSelection } from './state/selection-players.mjs';
import useSelectionMatches from './hooks/useSelectionMatches.js';
import { useEffect,useMemo,useState,useSyncExternalStore } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import IconButton from '../../shared/components/buttons/IconButton.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import RoundFilter from './RoundFilter.jsx';
import SelectionMetrics from './SelectionMetrics.jsx';
import { defaultSelectionScope,exactSelectionSummary,friendBreakdown,selectedMatchContext } from './state/selection-scope.mjs';
import { selectedMatchTotals } from './state/selection-matches.mjs';
import { friendsStore } from '../account/state/friends.mjs';
export default function AreaSummary({summary,rounds,items,replays,scope:chosenScope,onScope,loading,onClear,onFocus}) {
  const [playerChoice,setPlayerChoice]=useState('combined');
  const playerOptions=useMemo(()=>selectionPlayerOptions(summary,replays.flatMap(replay=>replay.players)),[summary,replays]);
  const player=playerOptions.some(([id])=>id===playerChoice)?playerChoice:'combined';
  useEffect(()=>{if(player!==playerChoice)setPlayerChoice(player);},[player,playerChoice]);
  const active=useMemo(()=>playerSelection(rounds,items,summary,player),[rounds,items,summary,player]);
  const scope=chosenScope||defaultSelectionScope(items);
  const allContext=useMemo(()=>selectedMatchContext(replays,summary,items),[replays,summary,items]);
  const context=useMemo(()=>player==='combined'?allContext:selectedMatchContext(replays,active.summary,active.items),[replays,active,player,allContext]);
  const matchState=useSelectionMatches(allContext,scope==='matches');
  const [openError,setOpenError]=useState('');
  const friends=useSyncExternalStore(friendsStore.subscribe,friendsStore.getSnapshot);
  useEffect(()=>{friendsStore.sync(window.NickStatsAccountSession?.username);},[]);
  const details=scope==='selection'?exactSelectionSummary(rounds,active.items):scope==='matches'?(matchState.players?selectedMatchTotals(context,matchState.players):null):active.summary;
  const breakdown=scope==='rounds'&&friends.username&&friends.ready?friendBreakdown(rounds,active.items,replays,friends.friends,{self:window.NickStatsAccountPlayer?.steamID||null}):[];
  return <aside className="analyzer-area-summary" aria-label="Selected round outcomes" aria-busy={loading||scope==='matches'&&matchState.loading}>
    <header><strong>Selection</strong><IconButton label="Clear selection" size={14} controlSize="28px" onClick={onClear}><path d="m6 6 12 12M6 18 18 6" /></IconButton></header>
    {playerOptions.length>2&&<TabList label="Selection players" options={playerOptions.map(([id,label])=>[id,label,{tabProps:{title:label}}])} value={player} onChange={setPlayerChoice} className="analyzer-selection-player-tabs" tabClassName="selection-chip" />}
    <RoundFilter label="Statistics scope" value={scope} options={['selection','rounds','matches'].map(value=>[value,value[0].toUpperCase()+value.slice(1)])} onChange={onScope} />
    {loading?<span role="status">Loading rounds…</span>:<>
      <div className="analyzer-area-count" aria-live="polite"><strong>{scope==='matches'?context.matches.length:`${active.summary.count} / ${active.summary.total}`}</strong><span>{scope==='matches'?'matches':`rounds · ${active.summary.percent.toFixed(1)}%`}</span></div>
      {details?<SelectionMetrics summary={details} scope={scope} />:!matchState.error&&<span role="status">Loading match statistics…</span>}
      <FormMessage error>{scope==='matches'?matchState.error:''}</FormMessage>
      {scope==='matches'&&matchState.error&&<Button className="button button-secondary" onClick={matchState.retry}>Retry match statistics</Button>}
      {!!breakdown.length&&<table className="analyzer-friends-table"><caption>Round outcomes by teammates</caption><thead><tr><th>Team</th><th>Rounds</th><th>Win %</th><th>K–D</th><th>Rating</th></tr></thead><tbody>{breakdown.map(row=><tr key={row.value}><th>{row.label}</th><td>{row.knownResults}</td><td>{row.winRate==null?'—':row.winRate.toFixed(1)}</td><td>{row.combatComplete?`${row.kills}–${row.deaths}`:'—'}</td><td>{row.rating==null?'—':row.rating.toFixed(2)}</td></tr>)}</tbody></table>}
      <Button className="button button-primary analyzer-focus-button" disabled={!active.summary.count} onClick={()=>onFocus(active.summary)}>Focus selection</Button>
      <Button className="button button-secondary analyzer-focus-button" disabled={!context.matches.length} onClick={()=>{try{window.NickStatsSessions.openSelection(context);setOpenError('');}catch(error){setOpenError(error.message);}}}>Open selected matches</Button>
      <FormMessage error>{openError}</FormMessage>
    </>}
  </aside>;
}
