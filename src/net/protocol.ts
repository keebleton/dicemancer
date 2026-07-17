// Pure online-play protocol: message shapes, room codes, and the host-side
// gatekeeping. No I/O here (peer wiring lives in net.ts) so all of it tests.
import { actingSeat, legalActions } from '../engine';
import type { Action, GameState, SeatColor } from '../engine';

export type SeatKind = 'human' | 'bot';

/** Everything that crosses the wire. Host is the only authority: clients send
 *  `intent`, the host answers with `sync` (full state; it is a few KB). */
export type NetMsg =
  /** spectate = watch only: the host replies begin with seat -1 and streams
   *  syncs, but the connection never gets a seat or a chat voice. */
  | { type: 'hello'; name: string; profileId: string | null; spectate?: boolean }
  /** you = the receiver's own index in players (host omits; it is 0). */
  | { type: 'lobby'; players: string[]; you?: number }
  /** Client -> host, lobby only: my seat plays these colors (and, when
   *  curated, exactly these cards). */
  | { type: 'deckPick'; colors: SeatColor[]; cards?: string[] }
  | {
      type: 'begin';
      state: GameState;
      /** -1 = you are a spectator. */
      seat: number;
      seatKinds: SeatKind[];
    }
  | { type: 'sync'; action: Action; state: GameState }
  | { type: 'intent'; action: Action }
  /** Host -> clients: per-seat connection truth + current seat kinds. */
  | { type: 'meta'; connected: boolean[]; seatKinds: SeatKind[] }
  /** Client -> host: table talk. The host stamps the seat (never trusted). */
  | { type: 'chatSend'; text: string; big?: boolean }
  /** Host -> everyone: a seat said something. big = emote styling. */
  | { type: 'chat'; seat: number; text: string; big?: boolean }
  | { type: 'bye'; reason: string };

/** Peer ids on the public broker are global; prefix + code keeps rooms ours. */
export const roomPeerId = (code: string) => `dicemancer-room-${code.toLowerCase()}`;

// No ambiguous glyphs (0/O, 1/I/L) so codes survive being read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeRoomCode(rand: () => number = Math.random): string {
  return Array.from(
    { length: 4 },
    () => CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]!,
  ).join('');
}

export const normalizeRoomCode = (raw: string) => raw.trim().toUpperCase();

/** May `seat` play `action` on this state right now? The host runs this on
 *  every client intent; a stale or forged action is simply dropped. Echo
 *  hearings are the one concurrent action: any owed seat answers for
 *  ITSELF, everything else belongs to the acting seat. */
export function isLegalIntent(state: GameState, seat: number, action: Action): boolean {
  if (state.winner !== null) return false;
  if (action.type === 'ECHO_CHOICE') {
    if (action.seat !== seat) return false; // you only hear for yourself
  } else if (actingSeat(state) !== seat) {
    return false;
  }
  const key = JSON.stringify(action);
  return legalActions(state).some((a) => JSON.stringify(a) === key);
}

/** Seat order for an online game: host first, then clients in join order,
 *  then bots to fill. Names are deduped so two Jakes stay tellable apart. */
export function buildSeats(
  hostName: string,
  clientNames: string[],
  botCount: number,
): { names: string[]; kinds: SeatKind[] } {
  const humans = [hostName, ...clientNames].map((n) => n.trim() || 'Player');
  const seen = new Map<string, number>();
  const names = humans.map((n) => {
    const k = (seen.get(n) ?? 0) + 1;
    seen.set(n, k);
    return k === 1 ? n : `${n} ${k}`;
  });
  const kinds: SeatKind[] = Array<SeatKind>(names.length).fill('human');
  for (let b = 1; b <= botCount; b++) {
    names.push(`Bot ${b}`);
    kinds.push('bot');
  }
  return { names, kinds };
}

export const DEFAULT_SEAT_COLORS: SeatColor[] = ['red', 'blue', 'green', 'yellow'];
