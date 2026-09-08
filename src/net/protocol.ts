import { inBounds } from '../engine/coords';
import { FLEET } from '../engine/ships';
import type { Coord, Outcome, ShipKind } from '../engine/types';

export const PROTOCOL_VERSION = 1;

export type SunkInfo = { kind: ShipKind; cells: Coord[] };

export type NetMessage =
  | { t: 'hello'; v: number; name: string; session: string }
  | { t: 'ready' }
  | { t: 'fire'; seq: number; at: Coord }
  | { t: 'result'; seq: number; at: Coord; outcome: Outcome; sunk?: SunkInfo; gameOver: boolean }
  | { t: 'rematch' }
  | { t: 'leave' };

export type MessageType = NetMessage['t'];

export const MAX_NAME_LENGTH = 24;

export function sanitizeName(raw: string, fallback = 'Captain'): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : fallback;
}

export function encode(msg: NetMessage): string {
  return JSON.stringify(msg);
}

/** Parses and validates a wire payload. Returns null for anything we would not have sent. */
export function decode(raw: unknown): NetMessage | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || typeof value.t !== 'string') return null;

  switch (value.t) {
    case 'hello': {
      if (!isInt(value.v) || typeof value.name !== 'string' || typeof value.session !== 'string')
        return null;
      if (value.session.length === 0 || value.session.length > 64) return null;
      return { t: 'hello', v: value.v, name: sanitizeName(value.name), session: value.session };
    }
    case 'ready':
      return { t: 'ready' };
    case 'rematch':
      return { t: 'rematch' };
    case 'leave':
      return { t: 'leave' };
    case 'fire': {
      if (!isInt(value.seq) || value.seq < 0) return null;
      const at = asCoord(value.at);
      if (!at) return null;
      return { t: 'fire', seq: value.seq, at };
    }
    case 'result': {
      if (!isInt(value.seq) || value.seq < 0) return null;
      const at = asCoord(value.at);
      if (!at) return null;
      if (!isOutcome(value.outcome) || typeof value.gameOver !== 'boolean') return null;
      const sunk = value.sunk === undefined ? undefined : asSunk(value.sunk);
      if (value.sunk !== undefined && !sunk) return null;
      if ((value.outcome === 'sunk') !== (sunk !== undefined)) return null;
      const msg: NetMessage = {
        t: 'result',
        seq: value.seq,
        at,
        outcome: value.outcome,
        gameOver: value.gameOver,
      };
      return sunk ? { ...msg, sunk } : msg;
    }
    default:
      return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function asCoord(v: unknown): Coord | null {
  if (!isRecord(v) || !isInt(v.row) || !isInt(v.col)) return null;
  const c = { row: v.row, col: v.col };
  return inBounds(c) ? c : null;
}

const OUTCOMES: readonly Outcome[] = ['miss', 'hit', 'sunk'];
function isOutcome(v: unknown): v is Outcome {
  return typeof v === 'string' && (OUTCOMES as readonly string[]).includes(v);
}

function asSunk(v: unknown): SunkInfo | null {
  if (!isRecord(v) || typeof v.kind !== 'string' || !Array.isArray(v.cells)) return null;
  const spec = FLEET.find((s) => s.kind === v.kind);
  if (!spec || v.cells.length !== spec.size) return null;
  const cells: Coord[] = [];
  for (const raw of v.cells) {
    const c = asCoord(raw);
    if (!c) return null;
    cells.push(c);
  }
  return { kind: spec.kind, cells };
}
