// PeerJS wiring for online play. One singleton; the store subscribes to the
// callbacks. Topology: the HOST's browser is the server (it owns the real
// GameState and the rng); clients connect over WebRTC using a 4-letter room
// code, brokered by the public PeerJS cloud (signaling only, game data is
// peer to peer). No backend of ours anywhere.
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Action, GameState } from '../engine';
import { makeRoomCode, roomPeerId } from './protocol';
import type { NetMsg, SeatKind } from './protocol';

export type NetMode = 'offline' | 'host' | 'client';

interface Callbacks {
  /** Lobby roster changed (both sides; host includes itself first). */
  onLobby: (players: string[]) => void;
  /** Client only: the host started the game; here is your seat. */
  onBegin: (state: GameState, seat: number, seatKinds: SeatKind[]) => void;
  /** Client only: the host applied an action. */
  onSync: (action: Action, state: GameState) => void;
  /** Host only: a client wants to act. seat = their seat once begun. */
  onIntent: (seat: number, action: Action) => void;
  /** The session died (peer error, host gone, connection lost). */
  onDrop: (reason: string) => void;
}

interface ClientSlot {
  conn: DataConnection;
  name: string;
  /** Supabase profile id, when the client is signed in. */
  profileId: string | null;
  /** Assigned at begin(); -1 while in the lobby. */
  seat: number;
}

class Net {
  mode: NetMode = 'offline';
  roomCode: string | null = null;
  private peer: Peer | null = null;
  private clients: ClientSlot[] = []; // host side, join order
  private hostConn: DataConnection | null = null; // client side
  private hostName = '';
  private cb: Callbacks | null = null;
  private closing = false;

  setCallbacks(cb: Callbacks) {
    this.cb = cb;
  }

  /** Open a room. Resolves with the code once the broker accepts the id. */
  host(name: string): Promise<string> {
    this.leave();
    this.mode = 'host';
    this.hostName = name;
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt: number) => {
        const code = makeRoomCode();
        const peer = new Peer(roomPeerId(code));
        this.peer = peer;
        peer.on('open', () => {
          this.roomCode = code;
          this.emitLobby();
          resolve(code);
        });
        peer.on('error', (err) => {
          // Code collision on the broker: roll a new one.
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
          // try to get back so new joins still work in the lobby.
          if (!this.closing) peer.reconnect();
        });
      };
      tryOpen(0);
    });
  }

  private acceptClient(conn: DataConnection) {
    conn.on('data', (raw) => {
      const msg = raw as NetMsg;
      if (msg.type === 'hello') {
        this.clients.push({
          conn,
          name: msg.name.trim() || 'Player',
          profileId: msg.profileId ?? null,
          seat: -1,
        });
        this.emitLobby();
        return;
      }
      if (msg.type === 'intent') {
        const slot = this.clients.find((c) => c.conn === conn);
        if (slot && slot.seat >= 0) this.cb?.onIntent(slot.seat, msg.action);
      }
    });
    conn.on('close', () => {
      const slot = this.clients.find((c) => c.conn === conn);
      this.clients = this.clients.filter((c) => c.conn !== conn);
      if (slot && slot.seat >= 0) {
        // Mid-game loss is fatal for now: tell everyone and fold the table.
        this.broadcast({ type: 'bye', reason: `${slot.name} disconnected` });
        this.drop(`${slot.name} disconnected`);
      } else {
        this.emitLobby();
      }
    });
  }

  /** Join someone's room. Resolves once the host connection is open. */
  join(code: string, name: string, profileId: string | null = null): Promise<void> {
    this.leave();
    this.mode = 'client';
    this.roomCode = code;
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      this.peer = peer;
      let opened = false;
      peer.on('open', () => {
        const conn = peer.connect(roomPeerId(code), { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => {
          opened = true;
          conn.send({ type: 'hello', name, profileId } satisfies NetMsg);
          resolve();
        });
        conn.on('data', (raw) => {
          const msg = raw as NetMsg;
          if (msg.type === 'lobby') this.cb?.onLobby(msg.players);
          else if (msg.type === 'begin') this.cb?.onBegin(msg.state, msg.seat, msg.seatKinds);
          else if (msg.type === 'sync') this.cb?.onSync(msg.action, msg.state);
          else if (msg.type === 'bye') this.drop(msg.reason);
        });
        conn.on('close', () => {
          if (!this.closing) this.drop('lost the connection to the host');
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
    this.clients.forEach((c, i) => {
      c.seat = i + 1;
      c.conn.send({ type: 'begin', state, seat: c.seat, seatKinds } satisfies NetMsg);
    });
  }

  /** Host: after every applied action. */
  sync(action: Action, state: GameState) {
    this.broadcast({ type: 'sync', action, state });
  }

  /** Client: ask the host to play this action. */
  sendIntent(action: Action) {
    this.hostConn?.send({ type: 'intent', action } satisfies NetMsg);
  }

  lobbyNames(): string[] {
    return [this.hostName, ...this.clients.map((c) => c.name)];
  }

  /** Client profile ids in join order (seat 1 onward; the host knows its own). */
  clientProfiles(): (string | null)[] {
    return this.clients.map((c) => c.profileId);
  }

  clientCount(): number {
    return this.clients.length;
  }

  private emitLobby() {
    const players = this.lobbyNames();
    this.cb?.onLobby(players);
    this.broadcast({ type: 'lobby', players });
  }

  private broadcast(msg: NetMsg) {
    for (const c of this.clients) c.conn.send(msg);
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
    this.hostConn = null;
    this.mode = 'offline';
    this.roomCode = null;
    this.closing = false;
  }
}

export const net = new Net();
