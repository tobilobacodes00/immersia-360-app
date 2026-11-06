/** No 0/O, 1/l/I: these end up read aloud, typed on a TV remote, or scanned from a QR code. */
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function pick(alphabet: string, length: number): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

/** A share id: 10 characters, about 58 bits. */
export const shareId = () => pick(ALPHABET, 10);

/** A Display pairing code: 6 upper-case characters, short-lived. */
export const pairingCode = () => pick(CODE_ALPHABET, 6);

/** A Display's secret: 32 random bytes, hex. */
export function displayToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const isShareId = (id: string) => /^[2-9a-km-zA-HJ-NP-Z]{10}$/.test(id);
export const isToken = (token: string) => /^[0-9a-f]{64}$/.test(token);
