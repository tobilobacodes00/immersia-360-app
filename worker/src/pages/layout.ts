import { escapeHtml } from '../http';

/** The brand: ink, paper and one cobalt accent, the system font, generous space. */
export const BASE_CSS = `
:root { color-scheme: dark; --ink: #111110; --paper: #f7f6f2; --muted: #b3b0a8; --faint: #8a8780; --surface: #1b1b19; --cobalt: #2b3fe6; --cobalt-text: #7c8aff; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--ink); color: var(--paper); }
body { font: 17px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
main { max-width: 560px; margin: 0 auto; padding: 24px 20px 48px; }
.wordmark { font-weight: 700; letter-spacing: .02em; font-size: 17px; margin: 8px 0 28px; }
.wordmark span { color: var(--cobalt-text); }
h1 { font-size: 28px; line-height: 1.2; margin: 0 0 12px; }
h2 { font-size: 19px; margin: 32px 0 8px; }
p { margin: 0 0 12px; color: var(--muted); }
.faint { color: var(--faint); font-size: 14px; }
.button { display: block; text-align: center; background: var(--cobalt); color: #fff; text-decoration: none; font-weight: 600; font-size: 18px; padding: 16px 20px; border-radius: 14px; margin: 20px 0 12px; }
.button:focus-visible, a:focus-visible { outline: 3px solid var(--cobalt-text); outline-offset: 3px; }
video { display: block; width: 100%; max-height: 72vh; border-radius: 18px; background: #000; }
a { color: var(--cobalt-text); }
`;

export function page(title: string, nonce: string, body: string, extraHead = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style nonce="${nonce}">${BASE_CSS}</style>
${extraHead}
</head>
<body>
<main>
<div class="wordmark">Immersia <span>360</span></div>
${body}
</main>
</body>
</html>`;
}
