import { renderSVG } from 'uqr';

const INK = '#111110';
const PAPER = '#f7f6f2';

/** A QR code as SVG: ink on paper (what phone cameras read best), with the standard quiet zone. */
export function qrSvg(text: string): Response {
  const svg = renderSVG(text, { ecc: 'M', border: 4, pixelSize: 10, blackColor: INK, whiteColor: PAPER });
  return new Response(svg, {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
