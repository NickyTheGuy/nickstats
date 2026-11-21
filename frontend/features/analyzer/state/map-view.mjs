const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function transformMapView(view, factor, origin, target, rect) {
  const zoom = clamp(view.zoom * factor, 1, 4),
    unit = 1024 / Math.max(1, Math.min(rect.width, rect.height)),
    limit = (zoom - 1) * 512;
  const x = (origin.x - rect.left - rect.width / 2) * unit,
    y = (origin.y - rect.top - rect.height / 2) * unit;
  return {
    zoom,
    x: clamp(x - ((x - view.x) * zoom) / view.zoom + (target.x - origin.x) * unit, -limit, limit),
    y: clamp(y - ((y - view.y) * zoom) / view.zoom + (target.y - origin.y) * unit, -limit, limit),
  };
}
export function wheelZoomFactor(delta, mode = 0, height = 800) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
  return Math.exp(-clamp(pixels, -100, 100) * 0.002);
}
export function touchTransform(view, before, after, rect) {
  const center = (points) => ({
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  });
  const distance = (points) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  return transformMapView(
    view,
    distance(after) / Math.max(1, distance(before)),
    center(before),
    center(after),
    rect,
  );
}
