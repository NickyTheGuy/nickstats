import Button from '../buttons/Button.jsx';

export default function NumberStepper({ prefix, value, min, max, onStep }) {
  return <div className="graph-bucket-stepper" id={`${prefix}GraphBucketStepper`}>
    <Button id={`${prefix}GraphBucketsLess`} aria-label="Use fewer buckets" disabled={value <= min} onClick={() => onStep(-1)}>−</Button>
    <output id={`${prefix}GraphBucketCount`} aria-live="polite">{value}</output>
    <Button id={`${prefix}GraphBucketsMore`} aria-label="Use more buckets" disabled={value >= max} onClick={() => onStep(1)}>+</Button>
  </div>;
}
