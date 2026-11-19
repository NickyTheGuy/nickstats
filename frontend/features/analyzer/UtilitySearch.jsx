import { useEffect,useRef,useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import DataTable from '../../shared/components/tables/DataTable.jsx';
import Pagination from '../../shared/components/navigation/Pagination.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import { analyzerJSON } from './state/server.mjs';
import { UTILITY_SEARCH_TYPES,utilityMetrics,utilityQuery,validateUtilityPage } from './state/utility-search.mjs';
import { formatTime } from './state/replay.mjs';

export default function UtilitySearch({scopes,players,names,onWatch,onClose}) {
  const [form,setForm]=useState({type:'HE',metric:'damage',minimum:'40'}),[data,setData]=useState(null),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const operation=useRef(null),scopeKey=JSON.stringify([scopes,players]),canIndex=Boolean(window.NickStatsManualFilters.store.account);
  useEffect(()=>{operation.current?.abort();setData(null);setError('');setBusy(false);setStatus('');return()=>operation.current?.abort();},[scopeKey]);
  function edit(next){operation.current?.abort();setForm(next);setData(null);setError('');setBusy(false);setStatus('');}
  async function run(offset=0,index=false) {
    operation.current?.abort();const controller=new AbortController();operation.current=controller;setBusy(true);setError('');
    try {
      const query=utilityQuery(scopes,players,form,offset);
      if(index)for(const [i,capture]of data.pending_captures.entries()){
        controller.signal.throwIfAborted();setStatus(`Indexing saved captures · ${i+1}/${data.pending_captures.length}…`);
        await analyzerJSON('/utility/index',{method:'POST',body:JSON.stringify({capture}),signal:controller.signal});
      }
      setStatus('Searching utility…');
      const result=await analyzerJSON('/utility/search',{method:'POST',body:JSON.stringify(query),signal:controller.signal});controller.signal.throwIfAborted();setData(validateUtilityPage(result,query));
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(operation.current===controller){setBusy(false);setStatus('');}}
  }
  const metricValue=row=>form.metric==='damage'?(row.enemy_damage??'—'):form.metric==='enemies'?(row.enemies_flashed??'—'):(row.enemy_blind_ms==null?'—':(row.enemy_blind_ms/1000).toFixed(2));
  const metricLabel=utilityMetrics(form.type).find(([key])=>key===form.metric)?.[1];
  const rows=data?.rows||[],owner=new Map(names.map(p=>[p.id,p.name])),rounds=scopes.reduce((n,s)=>n+s.rounds.length,0);
  return <section className="panel analyzer-utility-search" aria-label="Utility search">
    <header><h3>Utility search</h3><Button className="selection-chip" onClick={onClose}>Return to replay</Button></header>
    <form className="analyzer-utility-form" onSubmit={event=>{event.preventDefault();run();}}>
      <OptionField label="Grenade" value={form.type} options={UTILITY_SEARCH_TYPES} onChange={type=>edit({type,metric:type==='Flash'?'enemies':'damage',minimum:type==='Flash'?'1':'40'})} />
      <OptionField label="Effectiveness" value={form.metric} options={utilityMetrics(form.type)} onChange={metric=>edit({...form,metric,minimum:metric==='blind_ms'?'1':form.minimum})} />
      <label>Minimum<input aria-label="Minimum effectiveness" type="number" min="0" step={form.metric==='blind_ms'?'0.1':'1'} value={form.minimum} onChange={e=>edit({...form,minimum:e.target.value})} /></label>
      <Button type="submit" className="button button-primary" disabled={busy||!rounds||!players.length}>Search {rounds} rounds</Button>
      {busy&&<Button className="button button-secondary" onClick={()=>{operation.current?.abort();setBusy(false);setStatus('');}}>Cancel</Button>}
    </form>
    {!rounds&&<FormMessage>Choose saved matches and rounds to search.</FormMessage>}
    <FormMessage error>{error}</FormMessage><FormMessage>{status}</FormMessage>
    {data&&<><div className="analyzer-utility-coverage"><strong>{data.total} matching throws</strong><span>Unknown effectiveness / thrower · {data.unknown}</span>
      {!!data.pending_captures.length&&<><span>{data.pending_captures.length} saved captures need indexing</span>{canIndex?<Button className="selection-chip" disabled={busy} onClick={()=>run(0,true)}>Index saved captures</Button>:<span>Log in to index saved captures.</span>}</>}
    </div>
    <div className="table-wrap analyzer-utility-results"><table className="player-profile-table" aria-label="Utility search results"><colgroup><col style={{width:110}}/><col style={{width:110}}/><col style={{width:72}}/><col/><col/><col/>{form.type==='Flash'&&<col/>}</colgroup><DataTable sortable={false}
      headers={['Thrower',metricLabel,'Replay','Match','Round','Time',...(form.type==='Flash'?[form.metric==='enemies'?'Blind seconds':'Enemies blinded']:[])]}
      rows={rows.map(row=>[<span className="analyzer-utility-owner" title={owner.get(row.player)||row.player}>{owner.get(row.player)||row.player}</span>,metricValue(row),
        <Button className="selection-chip" title={row.attribution==='single_throw'?'Effectiveness from a round with exactly one grenade of this type.':'Recorded per-grenade effectiveness.'} onClick={()=>onWatch(row)}>Watch</Button>,
        `#${row.match_id}`,row.round,formatTime(row.time),...(form.type==='Flash'?[form.metric==='enemies'?(row.enemy_blind_ms==null?'—':(row.enemy_blind_ms/1000).toFixed(2)):(row.enemies_flashed??'—')]:[])])}
      emptyMessage={data.pending_captures.length?'Index saved captures to complete this search.':'No throws meet this threshold.'} /></table></div>
    <Pagination className="table-pagination" hidden={data.total<=data.limit} text={`${data.offset+1}–${Math.min(data.offset+data.limit,data.total)} of ${data.total} throws`}
      previousDisabled={busy||data.offset===0} nextDisabled={busy||data.offset+data.limit>=data.total} onPrevious={()=>run(Math.max(0,data.offset-data.limit))} onNext={()=>run(data.offset+data.limit)} /></>}
  </section>;
}
