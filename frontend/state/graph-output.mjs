const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
function summaryLine(values, metric, format) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const average = mean(values);
  const deviation = values.length < 2 ? 0 : Math.sqrt(mean(values.map(value => (value - average) ** 2)));
  return `Mean ${format(average, metric)} · Median ${format(median, metric)} · SD ${format(deviation, metric)} · Range ${format(sorted[0], metric)}–${format(sorted.at(-1), metric)}`;
}

// Uses the exact prepared samples shown by the chart, including paired X/Y
// samples and compatible round appearances. Never mutates the chart's arrays.
export function graphOutputModel({ series, roundsMode, relationship, metric, xMetric, unit, colors, format, note }) {
  const cards = series.map((series, index) => {
    const colorIndex = series.colorIndex ?? index;
    const lines = roundsMode
      ? [`${series.roundValues.length} numbered rounds · ${series.roundValues.reduce((sum, point) => sum + point.appearances, 0)} played rounds`]
      : (relationship ? [['X', xMetric, 'value'], ['Y', metric, 'y']] : [['', metric, 'value']]).map(([axis, axisMetric, key]) => {
        const values = series.values.map(point => point[key]);
        return `${axis ? `${axis} · ${axisMetric.label}: ` : ''}${summaryLine(values, axisMetric, format)}${relationship ? '' : ` · n=${values.length}`}`;
      });
    if (!roundsMode && relationship) lines.push(`${series.values.length} paired ${unit === 'session' ? 'sessions' : 'matches'}`);
    return { id: String(series.id ?? `series-${colorIndex}`), label: series.label, color: colors[colorIndex % colors.length], lines };
  });
  return { cards, note, empty: cards.length ? '' : roundsMode
    ? 'No per-round data for these matches. Reparse older demos to add round data.' : `No qualifying ${unit} samples for this statistic.` };
}
