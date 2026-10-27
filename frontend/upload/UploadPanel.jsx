import FileDropZone from '../components/FileDropZone.jsx';
import UploadActions from './UploadActions.jsx';
import BatchQueue from './BatchQueue.jsx';

export default function UploadPanel({ model, actions }) {
  return <>
    <div className="section-head"><div><div className="eyebrow">Upload</div><h2>Add a match</h2></div></div>
    <FileDropZone id="demoDropZone" inputId="demoInput" labelId="demoFileLabel" label={model.fileLabel} resetKey={model.resetKey}
      disabled={model.busy || model.uploading} onFiles={actions.files}
      accept=".dem,.gz,.dem.gz,.zst,.dem.zst,.zip,application/gzip,application/zstd,application/zip">
      <code>.dem</code>, <code>.zst</code>, <code>.gz</code>, or <code>.zip</code> · batches parse one at a time in the browser
    </FileDropZone>
    <UploadActions model={model} actions={actions} />
    <BatchQueue model={model} />
  </>;
}
