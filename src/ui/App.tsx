import { useEffect, useState } from 'react';
import type { SeatColor } from '../engine';
import { useAccount } from './account';
import { Game } from './Game';
import { IconPicker } from './IconPicker';
import { Lab } from './Lab';
import { iconError, iconUrl, loadPacks, savePacks } from './packs';
import { useGame } from './store';
import type { SeatKind } from './store';

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

  if (!acc.userId) {
    return (
      <section className="netbox">
        <b>Account</b>
        <div className="netrow">
          <input
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="password"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        <div className="netrow">
          <button
            className="primary"
            disabled={acc.busy || !email.includes('@') || pw.length < 6}
            onClick={() => acc.signIn(email, pw)}
          >
            Sign in
          </button>
          <button
            disabled={acc.busy || !email.includes('@') || pw.length < 6}
            onClick={() => acc.signUp(email, pw)}
          >
            Create account
          </button>
          <span className="dimtext">optional: profiles, avatars, stats</span>
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

  return (
    <section className="netbox">
      <div className="netrow">
        <img className="avatar" src={iconUrl(acc.profile!.avatar_icon)} alt="" onError={iconError} />
        <b>{acc.profile!.username}</b>
        <span className="dimtext">
          {acc.profile!.games_won} wins / {acc.profile!.games_played} games
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
  const [cap, setCap] = useState(25);
  const [kinds, setKinds] = useState<SeatKind[]>(['human', 'bot', 'bot', 'bot']);
  const [colors, setColors] = useState<SeatColor[]>(['red', 'blue', 'green', 'yellow']);
  const [packs, setPacks] = useState(() => loadPacks());
  const [name, setName] = useState(savedName);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
  const goJoin = async () => {
    saveName(myName());
    setBusy(`joining ${joinCode.toUpperCase()}...`);
    setErr(null);
    try {
      await joinRoom(joinCode.trim().toUpperCase(), myName());
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
          <button disabled={busy !== null || joinCode.trim().length !== 4} onClick={goJoin}>
            Join
          </button>
        </div>
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
        </div>
      ))}
      <div>
        round cap:{' '}
        <input
          type="number"
          min={1}
          max={99}
          value={cap}
          onChange={(e) => setCap(Number(e.target.value) || 25)}
        />
      </div>
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
      <button className="primary" onClick={() => start(count, cap, undefined, kinds, colors)}>
        Start game
      </button>
      <button onClick={onLab}>Card Lab</button>
    </main>
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
  const [cap, setCap] = useState(25);
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
          </div>
          <div>
            round cap:{' '}
            <input
              type="number"
              min={1}
              max={99}
              value={cap}
              onChange={(e) => setCap(Number(e.target.value) || 25)}
            />
          </div>
          <button
            className="primary"
            disabled={total < 2}
            onClick={() => startOnline(botCount, cap, colors)}
          >
            {total < 2 ? 'waiting for players...' : `Start game (${total} players)`}
          </button>
        </>
      )}
      <button onClick={() => leaveOnline()}>Leave</button>
    </main>
  );
}
