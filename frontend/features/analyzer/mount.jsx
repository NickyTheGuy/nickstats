import { createRoot } from 'react-dom/client';
import Analyzer from './Analyzer.jsx';
import { analyzerRoute, normalizeAnalyzerEntry, parseAnalyzerRoute } from './state/query.mjs';
import { saveReplay } from './state/server.mjs';
const host = document.getElementById('analyzerApp');
let snapshot=parseAnalyzerRoute(location.hash);
const listeners=new Set();
const entryStore={getSnapshot:()=>snapshot,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}};
function publish(source){snapshot=source;listeners.forEach(listener=>listener());}
window.addEventListener('hashchange',()=>{const source=parseAnalyzerRoute(location.hash);if(source)publish(source);});
window.NickStatsAnalyzer=Object.freeze({
  open(input){const source=normalizeAnalyzerEntry(input);if(!source)return;history.pushState(null,'',analyzerRoute(source));window.dispatchEvent(new HashChangeEvent('hashchange'));},
  saveReplay
});
if (host) createRoot(host).render(<Analyzer entryStore={entryStore} />);
