import { normaliseServer } from './server-url';

describe('normaliseServer', () => {
  it.each([
    ['share.immersiavr.com', 'https://share.immersiavr.com'],
    ['https://immersia-360.example.workers.dev/', 'https://immersia-360.example.workers.dev'],
    ['  HTTPS://Share.Example.com/path/  ', 'https://share.example.com'],
    ['http://localhost:8787', 'http://localhost:8787'],
  ])('%s → %s', (input, out) => expect(normaliseServer(input)).toBe(out));

  it('refuses plain http (the key would travel unencrypted) and junk', () => {
    expect(normaliseServer('http://share.example.com')).toBeNull();
    expect(normaliseServer('')).toBeNull();
    expect(normaliseServer('not a url at all')).toBeNull();
  });
});
