const STRIPE_LINE_WIDTH = 3;

export function createStripeCanvas(
  baseHex: string,
  stripeHex: string
): HTMLCanvasElement {
  const block = STRIPE_LINE_WIDTH * 4;
  const size = block;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = stripeHex;
  ctx.lineWidth = STRIPE_LINE_WIDTH;
  ctx.lineCap = "butt";
  for (let offset = -block; offset <= block; offset += block / 2) {
    ctx.beginPath();
    ctx.moveTo(offset - block / 2, -block / 2);
    ctx.lineTo(offset + block + block / 2, block + block / 2);
    ctx.stroke();
  }
  return canvas;
}
