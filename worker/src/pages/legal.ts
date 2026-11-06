// The same text the app shows in Settings › Help: one source, so the App Store links and the app never differ.
import { PRIVACY, TERMS, type LegalDoc } from '../../../src/content/legal';
import { escapeHtml, htmlResponse, nonce } from '../http';

import { page } from './layout';

function render(doc: LegalDoc): Response {
  const n = nonce();
  const body = [
    `<h1>${escapeHtml(doc.title)}</h1>`,
    `<p class="faint">Updated ${escapeHtml(doc.updated)}</p>`,
    ...doc.sections.map(
      (s) => `<h2>${escapeHtml(s.heading)}</h2>${s.body.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}`,
    ),
  ].join('\n');
  return htmlResponse(page(`${doc.title} · Immersia 360`, n, body), n, 200, 'public, max-age=3600');
}

export const privacyPage = () => render(PRIVACY);
export const termsPage = () => render(TERMS);
