import Button from './Button.jsx';

export default function Pagination({ id, className, previousId, nextId, labelId, text = '', hidden = true, previousDisabled = true, nextDisabled = true, onPrevious, onNext }) {
  return <div id={id} className={className} hidden={hidden}>
    <Button id={previousId} className="button button-secondary" disabled={previousDisabled} onClick={onPrevious}>Previous</Button>
    <span id={labelId}>{text}</span>
    <Button id={nextId} className="button button-secondary" disabled={nextDisabled} onClick={onNext}>Next</Button>
  </div>;
}
