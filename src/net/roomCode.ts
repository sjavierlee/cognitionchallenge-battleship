import { defaultRng, randomInt, type Rng } from '../engine/rng';

/** Crockford-style alphabet: no 0/O or 1/I so codes survive being read aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const CODE_LENGTH = 6;

/** Namespace prefix on the public PeerJS broker so codes cannot collide with other apps. */
const PEER_PREFIX = 'bship-v1-';

export function generateRoomCode(rng: Rng = defaultRng): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(rng, CODE_ALPHABET.length)];
  return code;
}

/** Accepts a pasted share link or a code typed in any case with spaces/dashes. */
export function normalizeRoomCode(input: string): string {
  const fromLink = /room\/([A-Za-z0-9-]+)/.exec(input);
  return (fromLink ? fromLink[1] : input).toUpperCase().replace(/[\s-]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export function peerIdForRoom(code: string): string {
  return PEER_PREFIX + code;
}

export function roomFromHash(hash: string): string | null {
  const m = /^#\/room\/([A-Za-z0-9-]+)\/?$/.exec(hash);
  if (!m) return null;
  const code = normalizeRoomCode(m[1]);
  return isValidRoomCode(code) ? code : null;
}

export function roomHash(code: string): string {
  return `#/room/${code}`;
}
