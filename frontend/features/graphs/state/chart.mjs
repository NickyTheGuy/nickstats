export function chartFrame(options = {}) {
  return { viewBox: '0 0 900 420', marks: [], ...options,
    add(mark) { this.marks.push(mark); return mark; } };
}
export function chartMark(type, attributes = {}, text = null) {
  return { type, attributes: { ...attributes }, text };
}
export function tooltipBox({ label, x: anchorX, y: anchorY }) {
  const width = Math.min(360, Math.max(150, label.length * 6.2 + 16));
  return { width, x: Math.max(5, Math.min(895 - width, anchorX - width / 2)), y: anchorY > 54 ? anchorY - 36 : anchorY + 10 };
}
export function svgProps(attributes) {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key === 'class' ? 'className'
    : /^(aria|data)-/.test(key) ? key : key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
}
