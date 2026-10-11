import ComparisonBody from '../components/ComparisonBody.jsx';

export default function ComparisonPage({ model, prefix, title, description, mapsLabel }) {
  return <>
    <header className="section-head quick-comparison-heading">
      <div><div className="eyebrow">Quick comparison</div><h2 id={`${prefix}QuickTitle`}>{title}</h2>
        <p id={`${prefix}QuickMeta`}>{model?.meta || description}</p></div>
    </header>
    <ComparisonBody model={model} prefix={prefix} mapsLabel={mapsLabel}
      emptyMessage="No qualifying matches for this map and filter combination." />
  </>;
}
