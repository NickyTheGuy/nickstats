import Button from '../../shared/components/buttons/Button.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';

export default function UploadActions({ model, actions }) {
  const busy = model.busy || model.uploading;
  return <div className="actions">
    <Button className="button button-primary" id="demoParseButton" disabled={!model.selected || busy} onClick={actions.parse}>{model.parseLabel}</Button>
    <Button className="button button-secondary" id="demoClearButton" disabled={!model.selected || busy} onClick={actions.clear}>Clear</Button>
    <Button className="button button-primary" id="demoRetryUploadButton" hidden={!model.retry} disabled={busy} onClick={actions.retry}>Retry upload</Button>
    <Button className="button button-secondary" id="demoReplaceUploadButton" hidden={!model.replace} disabled={busy} onClick={actions.replace}>Replace stored match</Button>
    <Button className="button button-secondary" id="demoParsedDownloadButton" hidden={!model.download} disabled={busy} onClick={actions.downloadParsed}>Download match JSON</Button>
    <FormMessage as="div" className={`status${model.error ? ' error' : ''}`} id="demoStatus">{model.status}</FormMessage>
  </div>;
}
