import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import Button from '../../shared/components/buttons/Button.jsx';
import Disclosure from '../../shared/components/layout/Disclosure.jsx';
import UploadPanel from './UploadPanel.jsx';
import { createUploadStore } from './state/upload.mjs';

function UploadRoot({ store, actions }) {
  const model = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <>
    <UploadPanel model={model} actions={actions} />
    {createPortal(model.diagnostics && <Disclosure id="demoDiagnostics" className="demo-diagnostics" summary="Parser troubleshooting">
      <div className="demo-diagnostics-body"><p>Download the round-allocation report when a parsed match cannot be uploaded.</p>
        <Button className="button button-secondary" id="demoDiagnosticsDownloadButton" onClick={actions.downloadDiagnostics}>Download diagnostics JSON</Button>
      </div>
    </Disclosure>, document.getElementById('demoDiagnosticsApp'))}
    {createPortal(<Button className="button button-primary" id="demoDownloadButton" onClick={actions.downloadMatch}>Download match JSON</Button>, document.getElementById('demoDownloadApp'))}
  </>;
}

window.NickStatsUploadUI = Object.freeze({
  create(actions) {
    const store = createUploadStore();
    createRoot(document.getElementById('demoUploadApp')).render(<UploadRoot store={store} actions={actions} />);
    return store;
  }
});
