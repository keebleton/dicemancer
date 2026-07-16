import { useEffect, useState } from 'react';
import type { BotLevel } from '../bot';
import type { SeatColor } from '../engine';
import { useAccount, validLogin } from './account';
import { acceptFriend, addFriend, fetchFriends, removeFriend } from './friends';
import type { FriendEntry } from './friends';
import { Game } from './Game';
import { Die } from './icons';
import { IconPicker } from './IconPicker';
import { Lab } from './Lab';
import { iconError, iconUrl, loadPacks, savePacks } from './packs';
import { HowToPlay } from './HowToPlay';
import { MatchHistory } from './MatchHistory';
import { listLiveGames, listRooms } from './rooms';
import type { OpenRoom } from './rooms';
import { clearSavedSession, loadSavedSession, useGame } from './store';
import type { SavedSession, SeatKind } from './store';

const SEAT_COLORS: SeatColor[] = ['red', 'blue', 'black', 'green', 'yellow'];

export function App() {
  const game = useGame((s) => s.game);
  const mode = useGame((s) => s.mode);
  const [lab, setLab] = useState(false);
  useEffect(() => {
    useAccount.getState().init();
  }, []);
  if (game) return <Game />;
  if (mode !== 'offline') return <OnlineLobby />;
  if (lab) return <Lab onClose={() => setLab(false)} />;
  return <Setup onLab={() => setLab(true)} />;
}

/** A crashed or refreshed session leaves a save behind; offer the way back. */
function ResumeBox() {
  const [saved, setSaved] = useState<SavedSession | null>(() => loadSavedSession());
  const resumeOffline = useGame((s) => s.resumeOffline);
  const resumeHost = useGame((s) => s.resumeHost);
  const joinRoom = useGame((s) => s.joinRoom);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!saved) return null;
  const discard = () => {
    clearSavedSession();
    setSaved(null);
  };
  return (
    <section className="netbox resumebox">
      <b>Game in progress</b>
      <div className="netrow">
        {saved.mode === 'offline' && (
          <button className="primary" onClick={resumeOffline}>
            Resume game (round {saved.game?.round ?? '?'})
          </button>
        )}
        {saved.mode === 'host' && (
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await resumeHost();
              } catch (e) {
                setErr(String(e instanceof Error ? e.message : e));
                setBusy(false);
              }
            }}
          >
            Reopen room {saved.roomCode} and resume
          </button>
        )}
        {saved.mode === 'client' && (
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await joinRoom(saved.roomCode!, saved.myName ?? 'Player');
              } catch (e) {
                setErr(String(e instanceof Error ? e.message : e));
                setBusy(false);
              }
            }}
          >
            Rejoin room {saved.roomCode}
          </button>
        )}
        <button onClick={discard}>discard</button>
      </div>
      {saved.mode === 'host' && (
        <span className="dimtext">your players rejoin with the room code; their seats are held</span>
      )}
      {err && <div className="err">{err}</div>}
    </section>
  );
}

/** Sign in, profile (username + WoW-icon avatar), and lifetime stats. */
function AccountBox() {
  const acc = useAccount();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [editing, setEditing] = useState(false);
  const [uname, setUname] = useState('');
  const [avatar, setAvatar] = useState('INV_Misc_Dice_01.PNG');
  const [picking, setPicking] = useState(false);

  const openEditor = () => {
    setUname(acc.profile?.username ?? '');
    setAvatar(acc.profile?.avatar_icon ?? 'INV_Misc_Dice_01.PNG');
    setEditing(true);
  };

  // First profile setup: default the display name to the sign-up username.
  useEffect(() => {
    if (acc.needsProfile && !uname && acc.pendingName) setUname(acc.pendingName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acc.needsProfile, acc.pendingName]);

  if (!acc.userId) {
    const ok = validLogin(email) && pw.length >= 6;
    return (
      <section className="netbox">
        <b>Account</b>
        <div className="netrow">
          <input
            placeholder="username"
            maxLength={40}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="password (6+ chars)"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        <div className="netrow">
          <button className="primary" disabled={acc.busy || !ok} onClick={() => acc.signIn(email, pw)}>
            Sign in
          </button>
          <button disabled={acc.busy || !ok} onClick={() => acc.signUp(email, pw)}>
            Create account
          </button>
        </div>
        {acc.error && <div className="err">{acc.error}</div>}
        {acc.notice && <div className="dimtext">{acc.notice}</div>}
      </section>
    );
  }

  if (acc.needsProfile || editing) {
    return (
      <section className="netbox">
        <b>{acc.needsProfile ? 'Set up your profile' : 'Edit profile'}</b>
        <div className="netrow">
          <img className="avatar" src={iconUrl(avatar)} alt="" onError={iconError} />
          <button onClick={() => setPicking(true)}>pick avatar</button>
          <input
            placeholder="username"
            maxLength={24}
            value={uname}
            onChange={(e) => setUname(e.target.value)}
          />
          <button
            className="primary"
            disabled={acc.busy || uname.trim().length < 2}
            onClick={async () => {
              await acc.saveProfile(uname, avatar);
              setEditing(false);
            }}
          >
            Save
          </button>
          {!acc.needsProfile && <button onClick={() => setEditing(false)}>cancel</button>}
        </div>
        {acc.error && <div className="err">{acc.error}</div>}
        {picking && (
          <IconPicker
            onPick={(n) => {
              setAvatar(n);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </section>
    );
  }

  // Signed in but the profile row is still on its way (or failed to load).
  if (!acc.profile) {
    return (
      <section className="netbox">
        <div className="netrow">
          <span className="dimtext">loading account...</span>
          <button onClick={() => acc.signOut()}>sign out</button>
        </div>
        {acc.error && <div className="err">{acc.error}</div>}
      </section>
    );
  }

  return (
    <section className="netbox">
      <div className="netrow">
        <img className="avatar" src={iconUrl(acc.profile.avatar_icon)} alt="" onError={iconError} />
        <b>{acc.profile.username}</b>
        <span className="dimtext">
          {acc.profile.games_won} wins / {acc.profile.games_played} games
        </span>
        <button onClick={openEditor}>edit</button>
        <button onClick={() => acc.signOut()}>sign out</button>
      </div>
    </section>
  );
}

/** Friends overlay: add by username, accept or decline requests, the roster. */
function FriendsOverlay({ onClose }: { onClose: () => void }) {
  const myId = useAccount((s) => s.profile?.id);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [adding, setAdding] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => {
    if (myId) void fetchFriends(myId).then(setFriends);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [myId]);

  const accepted = friends.filter((f) => f.status === 'accepted');
  const incoming = friends.filter((f) => f.status === 'pending' && f.direction === 'in');
  const outgoing = friends.filter((f) => f.status === 'pending' && f.direction === 'out');
  if (!myId) return null;

  return (
    <div className="inspect-overlay" onClick={onClose}>
      <div className="inspect howto friendspanel" onClick={(e) => e.stopPropagation()}>
        <section className="panel">
          <div className="howtohead">
            <h3>Friends</h3>
            <button onClick={onClose}>close</button>
          </div>
          <div className="netrow">
        <input
          placeholder="add by username"
          maxLength={24}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            void addFriend(myId, adding).then((err) => {
              setNote(err ?? 'request sent');
              if (!err) setAdding('');
              refresh();
            });
          }}
        />
        <button
          disabled={!adding.trim()}
          onClick={() =>
            void addFriend(myId, adding).then((err) => {
              setNote(err ?? 'request sent');
              if (!err) setAdding('');
              refresh();
            })
          }
        >
          add
        </button>
        {note && <span className="dimtext">{note}</span>}
      </div>
      {incoming.map((f) => (
        <div key={f.id} className="netrow friendrow">
          <img className="avatar" src={iconUrl(f.profile.avatar_icon)} alt="" onError={iconError} />
          <b>{f.profile.username}</b>
          <span className="dimtext">wants to be friends</span>
          <button
            className="primary"
            onClick={() => void acceptFriend(f.id).then(refresh)}
          >
            accept
          </button>
          <button onClick={() => void removeFriend(f.id).then(refresh)}>decline</button>
        </div>
      ))}
      {accepted.map((f) => (
        <div key={f.id} className="netrow friendrow">
          <img className="avatar" src={iconUrl(f.profile.avatar_icon)} alt="" onError={iconError} />
          <b>{f.profile.username}</b>
          <span className="dimtext">
            {f.profile.games_won} wins / {f.profile.games_played} games
          </span>
          <button title="remove friend" onClick={() => void removeFriend(f.id).then(refresh)}>
            remove
          </button>
        </div>
      ))}
          {outgoing.map((f) => (
            <div key={f.id} className="netrow friendrow">
              <img
                className="avatar"
                src={iconUrl(f.profile.avatar_icon)}
                alt=""
                onError={iconError}
              />
              <b>{f.profile.username}</b>
              <span className="dimtext">request pending</span>
              <button onClick={() => void removeFriend(f.id).then(refresh)}>cancel</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

const savedName = () => localStorage.getItem('dicemancer_name') ?? '';
const saveName = (n: string) => localStorage.setItem('dicemancer_name', n);

function Setup({ onLab }: { onLab: () => void }) {
  const start = useGame((s) => s.start);
  const hostRoom = useGame((s) => s.hostRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const spectateRoom = useGame((s) => s.spectateRoom);
  const netNotice = useGame((s) => s.netNotice);
  const [count, setCount] = useState(2);
  const [kinds, setKinds] = useState<SeatKind[]>(['human', 'bot', 'bot', 'bot']);
  const [levels, setLevels] = useState<BotLevel[]>(['normal', 'normal', 'normal', 'normal']);
  const [colors, setColors] = useState<SeatColor[]>(['red', 'blue', 'green', 'yellow']);
  const [packs, setPacks] = useState(() => loadPacks());
  const [name, setName] = useState(savedName);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [history, setHistory] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const togglePack = (id: string) => {
    const next = packs.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
    setPacks(next);
    savePacks(next);
  };
  const profile = useAccount((s) => s.profile);
  // Signed in = you play under your profile name; the field only exists for
  // guests.
  const myName = () => (profile?.username ?? name.trim()) || 'Player';
  const goHost = async () => {
    saveName(myName());
    setBusy('opening a room...');
    setErr(null);
    try {
      await hostRoom(myName());
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
      setBusy(null);
    }
  };
  const goJoin = async (codeArg?: string) => {
    const code = (codeArg ?? joinCode).trim().toUpperCase();
    saveName(myName());
    setBusy(`joining ${code}...`);
    setErr(null);
    try {
      await joinRoom(code, myName());
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
      setBusy(null);
    }
  };
  const goWatch = async (code: string) => {
    setBusy(`joining ${code} as a spectator...`);
    setErr(null);
    try {
      await spectateRoom(code, myName());
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
      setBusy(null);
    }
  };
  return (
    <main className="setup">
      <header className="herotitle">
        <span className="herodie a">
          <Die value={5} />
        </span>
        <h1>Dicemancer</h1>
        <span className="herodie b">
          <Die value={6} />
        </span>
      </header>

      <ResumeBox />
      <AccountBox />

      <section className="netbox">
        <b>Play online</b>
        {netNotice && <div className="err">{netNotice}</div>}
        {!profile && (
          <div className="netrow">
            <span className="seatlab">your name</span>
            <input
              value={name}
              maxLength={16}
              placeholder="Player"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <div className="netrow">
          <button className="primary" disabled={busy !== null} onClick={goHost}>
            Host a room
          </button>
          <span className="dimtext"> or </span>
          <input
            value={joinCode}
            maxLength={4}
            placeholder="CODE"
            className="codein"
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button disabled={busy !== null || joinCode.trim().length !== 4} onClick={() => goJoin()}>
            Join
          </button>
        </div>
        <OpenRoomsList
          disabled={busy !== null}
          onJoin={(code) => void goJoin(code)}
          onWatch={(code) => void goWatch(code)}
        />
        {busy && !err && <div className="dimtext">{busy}</div>}
        {err && <div className="err">{err}</div>}
      </section>

      <section className="netbox localbox">
      <b>Local table</b>
      <div className="netrow">
        <span className="seatlab">players</span>
        {[2, 3, 4].map((n) => (
          <button key={n} className={count === n ? 'selected' : ''} onClick={() => setCount(n)}>
            {n}
          </button>
        ))}
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="seatrow">
          <span className="seatlab">seat {i + 1}</span>{' '}
          {(['human', 'bot'] as const).map((k) => (
            <button
              key={k}
              className={kinds[i] === k ? 'selected' : ''}
              onClick={() => setKinds(kinds.map((old, j) => (j === i ? k : old)))}
            >
              {k}
            </button>
          ))}
          {SEAT_COLORS.map((c) => (
            <button
              key={c}
              className={'swatch sw-' + c + (colors[i] === c ? ' selected' : '')}
              title={c}
              aria-label={`seat ${i + 1} plays ${c}`}
              onClick={() => setColors(colors.map((old, j) => (j === i ? c : old)))}
            />
          ))}
          {kinds[i] === 'bot' && (
            <span className="botlevels">
              {(['easy', 'normal', 'hard'] as const).map((lv) => (
                <button
                  key={lv}
                  className={levels[i] === lv ? 'selected' : ''}
                  title={`${lv} bot`}
                  onClick={() => setLevels(levels.map((old, j) => (j === i ? lv : old)))}
                >
                  {lv[0]!.toUpperCase()}
                </button>
              ))}
            </span>
          )}
        </div>
      ))}
      {packs.length > 0 && (
        <div className="netrow">
          <span className="seatlab">card packs</span>
          {packs.map((p) => (
            <button
              key={p.id}
              className={p.enabled ? 'selected' : ''}
              title={p.enabled ? 'in the shop pools; click to bench' : 'benched; click to include'}
              onClick={() => togglePack(p.id)}
            >
              {p.name} ({p.cards.length})
            </button>
          ))}
        </div>
      )}
      <button
        className="primary big"
        onClick={() => start(count, 0, undefined, kinds, colors, levels)}
      >
        Start game
      </button>
      </section>

      <div className="netrow setupfoot">
        <button onClick={onLab}>Card Lab</button>
        <button onClick={() => setHelp(true)}>How to play</button>
        <button onClick={() => setHistory(true)}>Match history</button>
        {profile && <button onClick={() => setShowFriends(true)}>Friends</button>}
      </div>
      {help && <HowToPlay onClose={() => setHelp(false)} />}
      {history && <MatchHistory onClose={() => setHistory(false)} />}
      {showFriends && <FriendsOverlay onClose={() => setShowFriends(false)} />}
    </main>
  );
}

/** Joinable lobbies + live games to spectate; silent until any exist. */
function OpenRoomsList(props: {
  onJoin: (code: string) => void;
  onWatch: (code: string) => void;
  disabled: boolean;
}) {
  const [rooms, setRooms] = useState<OpenRoom[] | null>(null);
  const [live, setLive] = useState<OpenRoom[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      void listRooms().then((r) => alive && setRooms(r));
      void listLiveGames().then((r) => alive && setLive(r));
    };
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const anyRooms = rooms !== null && rooms.length > 0;
  const anyLive = live !== null && live.length > 0;
  if (!anyRooms && !anyLive) return null;
  return (
    <>
      {anyRooms && (
        <div className="openrooms">
          <span className="dimtext">open tables:</span>
          {rooms!.map((r) => (
            <button key={r.code} disabled={props.disabled} onClick={() => props.onJoin(r.code)}>
              {r.host_name}
              {"'"}s table ({r.players}) {r.code}
            </button>
          ))}
        </div>
      )}
      {anyLive && (
        <div className="openrooms">
          <span className="dimtext">live games:</span>
          {live!.map((r) => (
            <button key={r.code} disabled={props.disabled} onClick={() => props.onWatch(r.code)}>
              watch {r.host_name}
              {"'"}s game ({r.players})
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** The pre-game room: host sees start controls, everyone sees the roster. */
function OnlineLobby() {
  const mode = useGame((s) => s.mode);
  const roomCode = useGame((s) => s.roomCode);
  const lobby = useGame((s) => s.lobby);
  const startOnline = useGame((s) => s.startOnline);
  const leaveOnline = useGame((s) => s.leaveOnline);
  const [bots, setBots] = useState(0);
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const [colors, setColors] = useState<SeatColor[]>(['red', 'blue', 'green', 'yellow']);
  const humans = Math.max(1, lobby.length);
  const maxBots = Math.max(0, 4 - humans);
  const botCount = Math.min(bots, maxBots);
  const total = humans + botCount;
  useEffect(() => {
    if (bots > maxBots) setBots(maxBots);
  }, [bots, maxBots]);
  const seatNames = [...lobby, ...Array.from({ length: botCount }, (_, b) => `Bot ${b + 1}`)];
  return (
    <main className="setup">
      <h1>Dicemancer</h1>
      <div className="roomcode">
        room code: <b>{roomCode}</b>
      </div>
      {mode === 'host' ? (
        <p>Friends open the game, type this code, and hit Join. Start when everyone is in.</p>
      ) : (
        <p>You are in. Waiting for the host to start the game.</p>
      )}
      <div>
        {seatNames.map((n, i) => (
          <div key={i} className="seatrow">
            seat {i + 1}: <b>{n}</b>
            {mode === 'host' && (
              <>
                {SEAT_COLORS.map((c) => (
                  <button
                    key={c}
                    className={'swatch sw-' + c + (colors[i] === c ? ' selected' : '')}
                    title={c}
                    aria-label={`seat ${i + 1} plays ${c}`}
                    onClick={() => setColors(colors.map((old, j) => (j === i ? c : old)))}
                  />
                ))}
              </>
            )}
          </div>
        ))}
      </div>
      {mode === 'host' && (
        <>
          <div>
            bots:{' '}
            {Array.from({ length: maxBots + 1 }, (_, n) => (
              <button key={n} className={botCount === n ? 'selected' : ''} onClick={() => setBots(n)}>
                {n}
              </button>
            ))}
            {botCount > 0 && (
              <>
                {' '}
                {(['easy', 'normal', 'hard'] as const).map((lv) => (
                  <button
                    key={lv}
                    className={botLevel === lv ? 'selected' : ''}
                    onClick={() => setBotLevel(lv)}
                  >
                    {lv}
                  </button>
                ))}
              </>
            )}
          </div>
          <button
            className="primary"
            disabled={total < 2}
            onClick={() => startOnline(botCount, 0, colors, botLevel)}
          >
            {total < 2 ? 'waiting for players...' : `Start game (${total} players)`}
          </button>
        </>
      )}
      <button onClick={() => leaveOnline()}>Leave</button>
    </main>
  );
}
