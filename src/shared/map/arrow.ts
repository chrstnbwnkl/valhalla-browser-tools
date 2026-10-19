/**
 * An arrowhead pointing right, which is where a symbol placed along a line faces the line's direction. Null where
 * there is no canvas (tests).
 */
export function arrowImage(
  size: number,
  fill: string,
  outline: string,
): ImageData | null {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: size,
    height: size,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.moveTo(size * 0.3, size * 0.2);
  ctx.lineTo(size * 0.72, size * 0.5);
  ctx.lineTo(size * 0.3, size * 0.8);
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.strokeStyle = outline;
  ctx.lineWidth = size * 0.26;
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = size * 0.13;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}
