// PeerJS wiring for online play. One singleton; the store subscribes to the
// callbacks. Topology: the HOST's browser is the server (it owns the real
// GameState and the rng); clients connect over WebRTC using a 4-letter room
// code, brokered by the public PeerJS cloud (signaling only, game data is
// peer to peer). No backend of ours anywhere.
//
// RESILIENCE (2026-07-15): a dropped client no longer folds the table. Their
// seat is marked disconnected, the game waits (or the host swaps in a bot),
// and a reconnecting player is matched back to their seat by profile id or
// name and re-synced with a fresh 'begin'. The host can also reopen a room
// under its old code after a refresh; the store re-seeds it from local
// persistence.
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Action, GameState } from '../engine';
import { makeRoomCode, roomPeerId } from './protocol';
import type { NetMsg, SeatKind } from './protocol';
import type { SeatColor } from '../engine';

export interface NetDeckPick {
  colors: SeatColor[];
  cards?: string[];
}

/** NAT traversal. STUN alone fails whenever either side sits behind a
 *  strict NAT (hotspots, CGNAT): the join dies before it ever opens with
 *  "lost the connection". Every FREE public TURN relay we probed
 *  (openrelay.metered.ca and even peerjs.com's own defaults) is dead, so
 *  reliable relaying needs a keyed service: create a free metered.ca app
 *  (50 GB/month) and fill in the two constants below; credentials are then
 *  fetched fresh per session and merged in. Until then the public entries
 *  ride along as a hail mary. */
const METERED_APP = 'dicemancer';
const METERED_KEY = '6b7289937879b3f8ec1dd112da603bdfd181';

const BASE_ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

let fetchedTurn: RTCIceServer[] | null = null;
async function iceServers(): Promise<RTCIceServer[]> {
  if (!METERED_APP || !METERED_KEY) return BASE_ICE;
  if (!fetchedTurn) {
    try {
      const res = await fetch(
        `https://${METERED_APP}.metered.live/api/v1/turn/credentials?apiKey=${METERED_KEY}`,
      );
      if (res.ok) fetchedTurn = (await res.json()) as RTCIceServer[];
    } catch {
      // offline or the service hiccuped: ride the base list this session
    }
  }
  return fetchedTurn ? [...BASE_ICE, ...fetchedTurn] : BASE_ICE;
}

export type NetMode = 'offline' | 'host' | 'client';

interface Callbacks {
  /** Lobby roster changed (both sides; host includes itself first).
   *  you = the receiver's own index in players (0 for the host). */
  onLobby: (players: string[], you: number) => void;
  /** Client only: the host started (or re-synced) the game; here is your seat. */
  onBegin: (state: GameState, seat: number, seatKinds: SeatKind[]) => void;
  /** Client only: the host applied an action. */
  onSync: (action: Action, state: GameState) => void;
  /** Host only: a client wants to act. seat = their seat once begun. */
  onIntent: (seat: number, action: Action) => void;
  /** Host only: a seat's connection state flipped mid-game. */
  onPresence: (seat: number, connected: boolean) => void;
  /** Host only: a dropped player is back on their seat; re-sync them. */
  onReattach: (seat: number) => void;
  /** Host only: a spectator connected; answer with net.beginSpectator(id). */
  onSpectate: (id: number) => void;
  /** Client only: presence + seat kinds pushed by the host. */
  onMeta: (connected: boolean[], seatKinds: SeatKind[]) => void;
  /** Host only: a client wants to say something (host validates + relays). */
  onChatSend: (seat: number, text: string, big: boolean) => void;
  /** Client only: relayed table talk. */
  onChat: (seat: number, text: string, big: boolean) => void;
  /** The session died for THIS peer (host gone, fatal error). */
  onDrop: (reason: string) => void;
}

interface ClientSlot {
  conn: DataConnection | null;
  name: string;
  profileId: string | null;
  /** Assigned at begin(); -1 while in the lobby. */
  seat: number;
  connected: boolean;
  /** The player's own deck choice, sent from their lobby (null = default). */
  deck: NetDeckPick | null;
}

class Net {
  mode: NetMode = 'offline';
  roomCode: string | null = null;
  private peer: Peer | null = null;
  private clients: ClientSlot[] = []; // host side, join order
  private spectators = new Map<number, DataConnection>(); // host side, watch-only
  private nextSpectatorId = 1;
  private hostConn: DataConnection | null = null; // client side
  private hostName = '';
  private begun = false;
  private cb: Callbacks | null = null;
  private closing = false;

  setCallbacks(cb: Callbacks) {
    this.cb = cb;
  }

  /** Open a room. Tries the preferred code first (host resume), then random
   *  codes on broker collisions. Resolves with the code in use. */
  async host(name: string, preferredCode?: string): Promise<string> {
    this.leave();
    this.mode = 'host';
    this.hostName = name;
    const servers = await iceServers();
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt: number) => {
        const code = attempt === 0 && preferredCode ? preferredCode : makeRoomCode();
        const peer = new Peer(roomPeerId(code), { config: { iceServers: servers } });
        this.peer = peer;
        peer.on('open', () => {
          this.roomCode = code;
          this.emitLobby();
          resolve(code);
        });
        peer.on('error', (err) => {
          if ((err as { type?: string }).type === 'unavailable-id' && attempt < 4) {
            peer.destroy();
            tryOpen(attempt + 1);
            return;
          }
          if (this.roomCode === null) reject(new Error(String(err)));
          else this.drop(`connection error: ${String(err)}`);
        });
        peer.on('connection', (conn) => this.acceptClient(conn));
        peer.on('disconnected', () => {
          // Broker link lost; existing WebRTC connections keep working, but
          // try to get back so new joins and rejoins still work.
          if (!this.closing) peer.reconnect();
        });
      };
      tryOpen(0);
    });
  }

  /** Host resuming after a refresh: reopen the room and pre-register the
   *  known seats as disconnected so rejoining players match back in. */
  expectSeats(entries: { name: string; profileId: string | null; seat: number }[]) {
    this.begun = true;
    this.clients = entries.map((e) => ({
      conn: null,
      name: e.name,
      profileId: e.profileId,
      seat: e.seat,
      connected: false,
      deck: null,
    }));
  }

  private acceptClient(conn: DataConnection) {
    conn.on('data', (raw) => {
      const msg = raw as NetMsg;
      if (msg.type === 'hello') {
        const name = msg.name.trim() || 'Player';
        if (msg.spectate) {
          if (!this.begun) {
            conn.send({
              type: 'bye',
              reason: 'no game running yet; join with the code instead',
            } satisfies NetMsg);
            setTimeout(() => conn.close(), 400);
            return;
          }
          const id = this.nextSpectatorId++;
          this.spectators.set(id, conn);
          const dropSpec = () => this.spectators.delete(id);
          conn.on('close', dropSpec);
          conn.on('iceStateChanged', (s) => {
            if (s === 'disconnected' || s === 'failed' || s === 'closed') dropSpec();
          });
          this.cb?.onSpectate(id); // the store answers with beginSpectator
          return;
        }
        if (!this.begun) {
          this.clients.push({
            conn,
            name,
            profileId: msg.profileId ?? null,
            seat: -1,
            connected: true,
            deck: null,
          });
          this.emitLobby();
          return;
        }
        // Mid-game hello: this is a RECONNECT. Match by profile id first,
        // then by name; unknown peers are turned away politely.
        const slot = this.clients.find(
          (c) =>
            !c.connected
            && c.seat >= 0
            && ((msg.profileId && c.profileId === msg.profileId) || c.name === name),
        );
        if (slot) {
          slot.conn = conn;
          slot.connected = true;
          this.cb?.onPresence(slot.seat, true);
          this.cb?.onReattach(slot.seat); // the store answers with a fresh begin
        } else {
          conn.send({ type: 'bye', reason: 'game in progress; no open seat matches you' } satisfies NetMsg);
          setTimeout(() => conn.close(), 400);
        }
        return;
      }
      if (msg.type === 'intent') {
        const slot = this.clients.find((c) => c.conn === conn);
        if (slot && slot.seat >= 0) this.cb?.onIntent(slot.seat, msg.action);
      }
      if (msg.type === 'chatSend') {
        const slot = this.clients.find((c) => c.conn === conn);
        if (slot && slot.seat >= 0) {
          this.cb?.onChatSend(slot.seat, String(msg.text ?? ''), msg.big === true);
        }
      }
      if (msg.type === 'deckPick' && !this.begun) {
        const slot = this.clients.find((c) => c.conn === conn);
        if (slot && Array.isArray(msg.colors) && msg.colors.length >= 1 && msg.colors.length <= 2) {
          slot.deck = { colors: msg.colors.slice(0, 2), cards: msg.cards };
        }
      }
    });
    // Abrupt losses (closed tab, dead wifi) never send a close frame; they
    // only show up as ICE state changes. Handle both paths once.
    let downHandled = false;
    const onDown = () => {
      if (downHandled) return;
      downHandled = true;
      const slot = this.clients.find((c) => c.conn === conn);
      if (!slot) return;
      if (!this.begun || slot.seat < 0) {
        this.clients = this.clients.filter((c) => c !== slot);
        this.emitLobby();
        return;
      }
      // Mid-game drop: hold the seat, tell the table, and wait.
      slot.conn = null;
      slot.connected = false;
      this.cb?.onPresence(slot.seat, false);
    };
    conn.on('close', onDown);
    conn.on('iceStateChanged', (s) => {
      if (s === 'disconnected' || s === 'failed' || s === 'closed') onDown();
    });
  }

  /** Join someone's room (spectate = watch only). Resolves once the host
   *  connection is open. */
  async join(
    code: string,
    name: string,
    profileId: string | null = null,
    spectate = false,
  ): Promise<void> {
    this.leave();
    this.mode = 'client';
    this.roomCode = code;
    const servers = await iceServers();
    return new Promise((resolve, reject) => {
      const peer = new Peer({ config: { iceServers: servers } });
      this.peer = peer;
      let opened = false;
      const CANT_REACH =
        'could not reach the host; one of your networks blocks the connection (retrying sometimes helps)';
      // A join that never opens is a NAT/firewall failure, not a host drop;
      // fail it honestly instead of hanging on the connecting screen.
      const connectTimer = setTimeout(() => {
        if (opened || this.closing) return;
        this.leave();
        reject(new Error(CANT_REACH));
      }, 20_000);
      peer.on('open', () => {
        const conn = peer.connect(roomPeerId(code), { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => {
          opened = true;
          clearTimeout(connectTimer);
          conn.send({ type: 'hello', name, profileId, spectate } satisfies NetMsg);
          resolve();
        });
        conn.on('data', (raw) => {
          const msg = raw as NetMsg;
          if (msg.type === 'lobby') this.cb?.onLobby(msg.players, msg.you ?? -1);
          else if (msg.type === 'begin') this.cb?.onBegin(msg.state, msg.seat, msg.seatKinds);
          else if (msg.type === 'sync') this.cb?.onSync(msg.action, msg.state);
          else if (msg.type === 'meta') this.cb?.onMeta(msg.connected, msg.seatKinds);
          else if (msg.type === 'chat') this.cb?.onChat(msg.seat, msg.text, msg.big === true);
          else if (msg.type === 'bye') this.drop(msg.reason);
        });
        let downHandled = false;
        const onHostDown = () => {
          if (downHandled || this.closing) return;
          downHandled = true;
          clearTimeout(connectTimer);
          if (!opened) {
            // Died during ICE: nothing was ever "lost", the path never existed.
            this.leave();
            reject(new Error(CANT_REACH));
            return;
          }
          this.drop('lost the connection to the host');
        };
        conn.on('close', onHostDown);
        conn.on('iceStateChanged', (s) => {
          if (s === 'disconnected' || s === 'failed' || s === 'closed') onHostDown();
        });
      });
      peer.on('error', (err) => {
        const type = (err as { type?: string }).type;
        const friendly =
          type === 'peer-unavailable' ? `no room ${code} found` : `connection error: ${String(err)}`;
        if (!opened) reject(new Error(friendly));
        else this.drop(friendly);
      });
    });
  }

  /** Host: lock the lobby into a game. Seat 0 is the host; clients get their
   *  seats in join order (the caller built the same order via buildSeats). */
  begin(state: GameState, seatKinds: SeatKind[]) {
    this.begun = true;
    this.clients.forEach((c, i) => {
      c.seat = i + 1;
      c.conn?.send({ type: 'begin', state, seat: c.seat, seatKinds } satisfies NetMsg);
    });
  }

  /** Host: re-sync ONE seat (a reconnecting player). */
  beginSeat(seat: number, state: GameState, seatKinds: SeatKind[]) {
    const slot = this.clients.find((c) => c.seat === seat);
    slot?.conn?.send({ type: 'begin', state, seat, seatKinds } satisfies NetMsg);
  }

  /** Host: hand a fresh spectator the current game (seat -1). */
  beginSpectator(id: number, state: GameState, seatKinds: SeatKind[]) {
    this.spectators.get(id)?.send({ type: 'begin', state, seat: -1, seatKinds } satisfies NetMsg);
  }

  /** Host: after every applied action. */
  sync(action: Action, state: GameState) {
    this.broadcast({ type: 'sync', action, state });
  }

  /** Host: push presence + seat kinds to every client. */
  meta(connected: boolean[], seatKinds: SeatKind[]) {
    this.broadcast({ type: 'meta', connected, seatKinds });
  }

  /** Client: ask the host to play this action. */
  sendIntent(action: Action) {
    this.hostConn?.send({ type: 'intent', action } satisfies NetMsg);
  }

  /** Client: table talk, relayed by the host. */
  sendChat(text: string, big: boolean) {
    this.hostConn?.send({ type: 'chatSend', text, big } satisfies NetMsg);
  }

  /** Client: tell the host which deck this seat plays. */
  sendDeckPick(pick: NetDeckPick) {
    this.hostConn?.send({ type: 'deckPick', colors: pick.colors, cards: pick.cards } satisfies NetMsg);
  }

  /** Host: each lobby client's own deck pick, in join order (null = default). */
  clientDeckPicks(): (NetDeckPick | null)[] {
    return this.clients.map((c) => c.deck);
  }

  /** Host: push a validated chat line to every client. */
  chat(seat: number, text: string, big: boolean) {
    this.broadcast({ type: 'chat', seat, text, big });
  }

  lobbyNames(): string[] {
    return [this.hostName, ...this.clients.map((c) => c.name)];
  }

  /** Client profile ids in join order (seat 1 onward; the host knows its own). */
  clientProfiles(): (string | null)[] {
    return this.clients.map((c) => c.profileId);
  }

  /** Names + ids per client seat, for host-side persistence. */
  seatRoster(): { name: string; profileId: string | null; seat: number }[] {
    return this.clients
      .filter((c) => c.seat >= 0)
      .map((c) => ({ name: c.name, profileId: c.profileId, seat: c.seat }));
  }

  /** Connection truth per seat (host itself is always seat 0 and connected). */
  presence(totalSeats: number): boolean[] {
    const out = Array<boolean>(totalSeats).fill(true); // bots count as present
    for (const c of this.clients) {
      if (c.seat >= 0 && c.seat < totalSeats) out[c.seat] = c.connected;
    }
    return out;
  }

  clientCount(): number {
    return this.clients.length;
  }

  private emitLobby() {
    const players = this.lobbyNames();
    this.cb?.onLobby(players, 0);
    // Personalized: each client learns its own index so it can edit its row.
    this.clients.forEach((c, i) => {
      c.conn?.send({ type: 'lobby', players, you: i + 1 } satisfies NetMsg);
    });
  }

  private broadcast(msg: NetMsg) {
    for (const c of this.clients) c.conn?.send(msg);
    for (const s of this.spectators.values()) s.send(msg); // watchers see everything
  }

  private drop(reason: string) {
    const cb = this.cb;
    this.leave();
    cb?.onDrop(reason);
  }

  /** Tear down every connection; safe to call twice. */
  leave() {
    this.closing = true;
    this.peer?.destroy();
    this.peer = null;
    this.clients = [];
    this.spectators.clear();
    this.hostConn = null;
    this.mode = 'offline';
    this.roomCode = null;
    this.begun = false;
    this.closing = false;
  }
}

export const net = new Net();
