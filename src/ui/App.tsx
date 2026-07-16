import { useEffect, useState } from 'react';
import type { BotLevel } from '../bot';
import type { SeatColor } from '../engine';
import { useAccount, validLogin } from './account';
import { Game } from './Game';
import { IconPicker } from './IconPicker';
import { Lab } from './Lab';
import { iconError, iconUrl, loadPacks, savePacks } from './packs';
import { HowToPlay } from './HowToPlay';
import { MatchHistory } from './MatchHistory';
import { listRooms } from './rooms';
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
          <span className="dimtext">optional: profiles, avatars, stats</span>
        </div>
        <span className="dimtext">no email needed; do not forget your password</span>
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

const savedName = () => localStorage.getItem('dicemancer_name') ?? '';
const saveName = (n: string) => localStorage.setItem('dicemancer_name', n);

function Setup({ onLab }: { onLab: () => void }) {
  const start = useGame((s) => s.start);
  const hostRoom = useGame((s) => s.hostRoom);
  const joinRoom = useGame((s) => s.joinRoom);
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
  const togglePack = (id: string) => {
    const next = packs.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
    setPacks(next);
    savePacks(next);
  };
  const myName = () => name.trim() || 'Player';
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
  const profile = useAccount((s) => s.profile);
  useEffect(() => {
    if (profile && !name.trim()) setName(profile.username);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  return (
    <main className="setup">
      <h1>Dicemancer</h1>

      <ResumeBox />
      <AccountBox />

      <section className="netbox">
        <b>Play online</b>
        {netNotice && <div className="err">{netNotice}</div>}
        <div className="netrow">
          your name:{' '}
          <input
            value={name}
            maxLength={16}
            placeholder="Player"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
        <OpenRoomsList disabled={busy !== null} onJoin={(code) => void goJoin(code)} />
        {busy && !err && <div className="dimtext">{busy}</div>}
        {err && <div className="err">{err}</div>}
      </section>

      <p>Or play on this screen. Any mix of humans and bots; multiple humans = hotseat.</p>
      <div>
        players:{' '}
        {[2, 3, 4].map((n) => (
          <button key={n} className={count === n ? 'selected' : ''} onClick={() => setCount(n)}>
            {n}
          </button>
        ))}
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="seatrow">
          seat {i + 1}:{' '}
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
        <div>
          card packs:{' '}
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
      <button className="primary" onClick={() => start(count, 0, undefined, kinds, colors, levels)}>
        Start game
      </button>
      <div className="netrow">
        <button onClick={onLab}>Card Lab</button>
        <button onClick={() => setHelp(true)}>How to play</button>
        <button onClick={() => setHistory(true)}>Match history</button>
      </div>
      {help && <HowToPlay onClose={() => setHelp(false)} />}
      {history && <MatchHistory onClose={() => setHistory(false)} />}
    </main>
  );
}

/** Joinable rooms published by hosts; silent until any exist. */
function OpenRoomsList({ onJoin, disabled }: { onJoin: (code: string) => void; disabled: boolean }) {
  const [rooms, setRooms] = useState<OpenRoom[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void listRooms().then((r) => alive && setRooms(r));
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!rooms || rooms.length === 0) return null;
  return (
    <div className="openrooms">
      <span className="dimtext">open tables:</span>
      {rooms.map((r) => (
        <button key={r.code} disabled={disabled} onClick={() => onJoin(r.code)}>
          {r.host_name}
          {"'"}s table ({r.players}) {r.code}
        </button>
      ))}
    </div>
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
