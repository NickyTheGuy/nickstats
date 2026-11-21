// Fill the actual rectangular pane. A square backing bitmap would clip zoomed
// radar pixels before CSS can paint them into the pane's spare height/width.
export function viewport(size, view, pixelRatio = 1) {
  const width = Math.max(1, size.width),
    height = Math.max(1, size.height),
    base = Math.min(width, height) / 1024;
  return {
    width,
    height,
    pixelRatio: Math.min(pixelRatio, 2, 4096 / width, 4096 / height),
    scale: base * view.zoom,
    x: width / 2 + view.x * base,
    y: height / 2 + view.y * base,
  };
}
