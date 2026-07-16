import { useEffect, useRef, useState } from 'react';
import { chooseAction } from '../bot';
import { RELIC_BY_ID, actingSeat, legalActions, previewNumbers } from '../engine';
import type { Action, AllocationMode, GameState, PlayerState, WinReason } from '../engine';
import { CardFace, TINT } from './CardFace';
import { fxList } from './describe';
import { FxLayer } from './Fx';
import { HowToPlay } from './HowToPlay';
import { aggregateEchoEffects, Die, EffectIcons, IconLegend, StatChips } from './icons';
import { iconError, iconLoaded, iconUrl } from './packs';
import { isMuted, setMuted } from './sfx';
import { useGame } from './store';
import type { StatPulse } from './store';

const WIN_HOW: Record<WinReason, string> = {
  points: 'wins on points',
  ko: 'wins by knockout',
  failsafe: 'wins at the round cap',
  card: 'wins by destiny',
};
const CONFETTI = ['#f0b429', '#ff8272', '#7ab5ff', '#7fd97f', '#c0a9f0'];

export function Game() {
  const game = useGame((s) => s.game)!;
  const seatKinds = useGame((s) => s.seatKinds);
  const dispatch = useGame((s) => s.dispatch);
  const reset = useGame((s) => s.reset);
  const log = useGame((s) => s.log);
  const pulses = useGame((s) => s.pulses);
  const mode = useGame((s) => s.mode);
  const mySeat = useGame((s) => s.mySeat);
  const roomCode = useGame((s) => s.roomCode);
  const connectedSeats = useGame((s) => s.connectedSeats);
  const replaceWithBot = useGame((s) => s.replaceWithBot);
  const bubbles = useGame((s) => s.bubbles);
  const sendChat = useGame((s) => s.sendChat);
  const fx = useGame((s) => s.fx);
  const [chatDraft, setChatDraft] = useState('');
  const [winHidden, setWinHidden] = useState(false);
  // A knockout rattles the whole table for half a second. Pre-mount history
  // is recorded, not replayed (same rule as the fx layer).
  const [quake, setQuake] = useState(false);
  const quakeSeen = useRef<number | null>(null);
  useEffect(() => {
    let ko = 0;
    for (const e of fx) if (e.kind === 'ko') ko = e.id;
    if (quakeSeen.current === null || ko <= quakeSeen.current) {
      quakeSeen.current = ko;
      return;
    }
    quakeSeen.current = ko;
    setQuake(true);
    const t = setTimeout(() => setQuake(false), 700);
    return () => clearTimeout(t);
  }, [fx]);
  useEffect(() => setWinHidden(false), [game.winner]);
  const [preview, setPreview] = useState<AllocationMode | null>(null);
  const [buySel, setBuySel] = useState<{ src: 'shop' | 'market' | 'relic'; i: number } | null>(
    null,
  );
  const [muted, setMutedState] = useState(isMuted());
  const [showLegend, setShowLegend] = useState(false);
  const [help, setHelp] = useState(false);
  const [inspect, setInspect] = useState<number | null>(null);

  useEffect(() => {
    if (inspect === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInspect(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [inspect]);

  useEffect(() => {
    setPreview(null);
    setBuySel(null);
  }, [game.current, game.phase]);

  // Online, the seat I sit in is the only one I control; offline hotseat
  // controls every human seat.
  const iControl = (seat: number) =>
    mode === 'offline' ? seatKinds[seat] === 'human' : seat === mySeat;

  // Whoever must decide next (roller, or an echo chooser) auto-plays if a
  // bot. Bots only ever run where the rng lives: never on online clients.
  const acting = actingSeat(game);
  const botTurn = game.winner === null && mode !== 'client' && seatKinds[acting] === 'bot';
  useEffect(() => {
    if (!botTurn) return;
    const t = setTimeout(() => {
      const g = useGame.getState().game;
      const kinds = useGame.getState().seatKinds;
      if (
        g
        && g.winner === null
        && useGame.getState().mode !== 'client'
        && kinds[actingSeat(g)] === 'bot'
      ) {
        const level = useGame.getState().botLevels[actingSeat(g)] ?? 'normal';
        useGame.getState().dispatch(chooseAction(g, level));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [game, botTurn]);

  const actions = legalActions(game);
  const me = game.players[game.current]!;
  const previewSlots = preview && game.dice ? previewNumbers(game.dice, preview) : [];
  const shopBuys = actions.filter((a): a is Action & { type: 'BUY' } => a.type === 'BUY');
  const marketBuys = actions.filter(
    (a): a is Action & { type: 'BUY_MARKET' } => a.type === 'BUY_MARKET',
  );
  const relicBuys = actions.filter(
    (a): a is Action & { type: 'BUY_RELIC' } => a.type === 'BUY_RELIC',
  );
  const buySlots =
    buySel === null
      ? []
      : buySel.src === 'shop'
        ? shopBuys.filter((a) => a.shopIndex === buySel.i).map((a) => a.targetSlot)
        : buySel.src === 'market'
          ? marketBuys.filter((a) => a.marketIndex === buySel.i).map((a) => a.targetSlot)
          : relicBuys
              .filter((a) => a.index === buySel.i && a.slotPick !== undefined)
              .map((a) => a.slotPick!);
  const firedSlots =
    game.lastAllocation && game.phase !== 'roll' && game.phase !== 'allocate'
      ? game.lastAllocation.numbers
      : [];
  const humanRoller = iControl(game.current);
  // Who the stage is waiting on (null = it is waiting on me, show buttons).
  const actingConnected = mode === 'offline' || (connectedSeats[acting] ?? true);
  const waitLabel =
    game.winner !== null || iControl(acting)
      ? null
      : seatKinds[acting] === 'bot'
        ? 'thinking...'
        : actingConnected
          ? `waiting for ${game.players[acting]!.name}...`
          : `${game.players[acting]!.name} is disconnected; their seat is held...`;

  // Seating: you sit at the bottom. Online that is simply my seat; in hotseat
  // the table rotates so the current human is always the bottom seat.
  const n = game.players.length;
  const humanSeats = seatKinds.flatMap((k, i) => (k === 'human' ? [i] : []));
  const perspective =
    mode !== 'offline'
      ? (mySeat ?? 0)
      : seatKinds[game.current] === 'human'
        ? game.current
        : (humanSeats[0] ?? 0);
  const opp = Array.from({ length: n - 1 }, (_, k) => (perspective + k + 1) % n);
  let leftSeat: number | null = null;
  let topSeat: number | null = null;
  let rightSeat: number | null = null;
  if (opp.length === 1) topSeat = opp[0]!;
  else if (opp.length === 2) {
    leftSeat = opp[0]!;
    rightSeat = opp[1]!;
  } else if (opp.length >= 3) {
    leftSeat = opp[0]!;
    topSeat = opp[1]!;
    rightSeat = opp[2]!;
  }
  const oppMat = (seat: number) => (
    <OppMat
      p={game.players[seat]!}
      seat={seat}
      game={game}
      pulses={pulses.filter((x) => x.seat === seat)}
      fired={seat === game.current ? firedSlots : []}
      onInspect={() => setInspect(seat)}
      disconnected={mode !== 'offline' && seatKinds[seat] === 'human' && !(connectedSeats[seat] ?? true)}
      onReplaceBot={mode === 'host' ? () => replaceWithBot(seat) : undefined}
      bubble={bubbles[seat]}
    />
  );

  return (
    <main className="game">
      <header>
        <div className="topbar">
          <h1>Dicemancer</h1>
          <span className="chip">
            round {game.round}
            {game.tunables.roundCap > 0 ? `/${game.tunables.roundCap}` : ''}
          </span>
          <span className={`chip turn ${me.color}`}>{me.name}{"'"}s turn</span>
          {mode !== 'offline' && roomCode && <span className="chip">room {roomCode}</span>}
          <button onClick={() => setShowLegend(!showLegend)}>
            {showLegend ? 'hide icon key' : 'icon key'}
          </button>
          <button onClick={() => setHelp(true)}>how to play</button>
          <button
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            sound: {muted ? 'off' : 'on'}
          </button>
          <button onClick={reset}>quit to setup</button>
        </div>
        {showLegend && <IconLegend />}
      </header>

      {game.winner === null && (
        <div key={`toast-${game.round}-${game.current}`} className="turntoast">
          <span className={me.color}>{me.name}</span>
          {"'"}s turn
        </div>
      )}

      {game.winner !== null && !winHidden && (
        <div className="winoverlay">
          <div className="winrays" />
          {Array.from({ length: 26 }, (_, i) => (
            <span
              key={i}
              className="confetti"
              style={{
                left: `${(i * 39) % 100}%`,
                animationDelay: `${(i % 9) * 0.14}s`,
                animationDuration: `${2.4 + (i % 5) * 0.35}s`,
                background: CONFETTI[i % CONFETTI.length],
              }}
            />
          ))}
          <div className="wincard">
            <div className="winkicker">Victory</div>
            <div className={'winname ' + game.players[game.winner]!.color}>
              {game.players[game.winner]!.name}
            </div>
            <div className="winhow">{WIN_HOW[game.winReason ?? 'points']}</div>
            <div>
              <button className="primary" onClick={reset}>
                new game
              </button>
              <button onClick={() => setWinHidden(true)}>view the table</button>
            </div>
          </div>
        </div>
      )}
      {game.winner !== null && winHidden && (
        <div className="winner">
          {game.players[game.winner]!.name} {WIN_HOW[game.winReason ?? 'points']}!{' '}
          <button onClick={reset}>new game</button>
        </div>
      )}

      <div className={'table' + (quake ? ' quake' : '')}>
        {topSeat !== null && <div className="topzone">{oppMat(topSeat)}</div>}

        <div className="midrow">
          {leftSeat !== null && <div className="sidezone">{oppMat(leftSeat)}</div>}

          <div className="centerzone">
            <div className="centerrow">
            {game.winner === null && game.market.length > 0 && (
              <section className="panel marketpanel">
                <div className="shoprowcards">
                  {game.market.map((card, i) => {
                    const buyable = humanRoller && marketBuys.some((a) => a.marketIndex === i);
                    const sel = buySel?.src === 'market' && buySel.i === i;
                    return card ? (
                      <div
                        key={`${card.id}-${i}`}
                        className={
                          'shopcard market' + (sel ? ' selected' : '') + (buyable ? '' : ' dead')
                        }
                        onClick={() => {
                          if (buyable) setBuySel(sel ? null : { src: 'market', i });
                        }}
                      >
                        <CardFace card={card} showCost />
                      </div>
                    ) : (
                      <div key={i} className="shopcard dead placeholder">
                        (sold out)
                      </div>
                    );
                  })}
                </div>
                {game.reliquary.length > 0 && (
                  <div className="reliquary">
                    {game.reliquary.map((id, i) => {
                      if (!id) {
                        return (
                          <span key={i} className="relicchip dead">
                            claimed
                          </span>
                        );
                      }
                      const def = RELIC_BY_ID[id]!;
                      const buyable = humanRoller && relicBuys.some((a) => a.index === i);
                      const sel = buySel?.src === 'relic' && buySel.i === i;
                      return (
                        <button
                          key={id}
                          className={'relicchip' + (sel ? ' selected' : '') + (buyable ? '' : ' dead')}
                          title={def.text + (def.needsSlotPick ? ' (you will pick a slot)' : '')}
                          onClick={() => {
                            if (!buyable) return;
                            if (def.needsSlotPick) setBuySel(sel ? null : { src: 'relic', i });
                            else dispatch({ type: 'BUY_RELIC', index: i });
                          }}
                        >
                          <img src={iconUrl(def.icon ?? '')} alt="" onError={iconError} />
                          {def.name}
                          <b>{def.cost}</b>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            <Stage
              game={game}
              actions={actions}
              dispatch={dispatch}
              setPreview={setPreview}
              waitLabel={waitLabel}
            />

            {game.winner === null && me.shop.length > 0 && (
              <section className={'panel shoppanel' + (me.shopFrozen ? ' shopfrozen' : '')}>
                <div className="shoprowcards">
                  {me.shop.map((card, i) => {
                    const buyable = humanRoller && shopBuys.some((a) => a.shopIndex === i);
                    const sel = buySel?.src === 'shop' && buySel.i === i;
                    return card ? (
                      <div
                        key={`${card.id}-${i}`}
                        className={
                          'shopcard' +
                          (card.rarity === 'rare' ? ' rare' : '') +
                          (sel ? ' selected' : '') +
                          (buyable ? '' : ' dead')
                        }
                        onClick={() => {
                          if (buyable) setBuySel(sel ? null : { src: 'shop', i });
                        }}
                      >
                        <CardFace card={card} showCost />
                      </div>
                    ) : (
                      <div key={i} className="shopcard dead placeholder">
                        (bought)
                      </div>
                    );
                  })}
                </div>
                <div className="buyrow">
                  {buySel !== null ? (
                    <button onClick={() => setBuySel(null)}>cancel</button>
                  ) : humanRoller && actions.some((a) => a.type === 'FREEZE_SHOP') ? (
                    <button onClick={() => dispatch({ type: 'FREEZE_SHOP' })}>
                      {me.shopFrozen ? '❄ unfreeze shop' : '❄ freeze shop'}
                    </button>
                  ) : null}
                </div>
              </section>
            )}
            </div>
          </div>

          {rightSeat !== null && <div className="sidezone">{oppMat(rightSeat)}</div>}
        </div>

        <SelfMat
          p={game.players[perspective]!}
          seat={perspective}
          game={game}
          fxAnchor
          bubble={bubbles[perspective]}
          pulses={pulses.filter((x) => x.seat === perspective)}
          highlight={perspective === game.current ? previewSlots : []}
          fired={perspective === game.current ? firedSlots : []}
          buyable={perspective === game.current ? buySlots : []}
          onSlotClick={(slot) => {
            if (buySel !== null && buySlots.includes(slot)) {
              dispatch(
                buySel.src === 'shop'
                  ? { type: 'BUY', shopIndex: buySel.i, targetSlot: slot }
                  : buySel.src === 'market'
                    ? { type: 'BUY_MARKET', marketIndex: buySel.i, targetSlot: slot }
                    : { type: 'BUY_RELIC', index: buySel.i, slotPick: slot },
              );
              setBuySel(null);
            }
          }}
        />

        <section className="panel logpanel">
          <div className="loghead">
            <h3>Log</h3>
            {mode !== 'offline' && (
              <div className="chatbar">
                <input
                  placeholder="say something..."
                  maxLength={140}
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && chatDraft.trim()) {
                      sendChat(chatDraft.trim());
                      setChatDraft('');
                    }
                  }}
                />
                {['Nice!', 'Ouch!', 'Wow!', 'Hmm...', 'GG'].map((emote) => (
                  <button key={emote} className="emotebtn" onClick={() => sendChat(emote, true)}>
                    {emote}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="log">
            {[...log].reverse().map((line, i) => (
              <div key={log.length - i}>{line}</div>
            ))}
          </div>
        </section>
      </div>

      <FxLayer fx={fx} />

      {help && <HowToPlay onClose={() => setHelp(false)} />}

      {inspect !== null && (
        <div className="inspect-overlay" onClick={() => setInspect(null)}>
          <div className="inspect" onClick={(e) => e.stopPropagation()}>
            <SelfMat
              p={game.players[inspect]!}
              seat={inspect}
              game={game}
              pulses={pulses.filter((x) => x.seat === inspect)}
              highlight={[]}
              fired={inspect === game.current ? firedSlots : []}
              buyable={[]}
              onSlotClick={() => {}}
            />
            <div className="dimtext inspecthint">click outside or press Esc to close</div>
          </div>
        </div>
      )}
    </main>
  );
}

/** The shared table center: everyone watches the same dice; whoever must act
 *  (the roller, or an opponent picking an echo interpretation) acts here. */
function Stage(props: {
  game: GameState;
  actions: Action[];
  dispatch: (a: Action) => void;
  setPreview: (m: AllocationMode | null) => void;
  /** Non-null = someone else must act; show who instead of the buttons. */
  waitLabel: string | null;
}) {
  const { game, actions, dispatch, setPreview, waitLabel } = props;
  if (game.winner !== null) return null;
  const acting = actingSeat(game);
  const actor = game.players[acting]!;
  const roller = game.players[game.current]!;
  const dice = game.dice;

  const allocs = actions.filter((a): a is Action & { type: 'ALLOCATE' } => a.type === 'ALLOCATE');
  const tokens = actions.filter(
    (a): a is Action & { type: 'SPEND_TOKEN' } => a.type === 'SPEND_TOKEN',
  );
  const targets = actions.filter(
    (a): a is Action & { type: 'CHOOSE_TARGET' } => a.type === 'CHOOSE_TARGET',
  );
  const echoChoices = actions.filter(
    (a): a is Action & { type: 'ECHO_CHOICE' } => a.type === 'ECHO_CHOICE',
  );
  return (
    <section className="panel stage">
      <div className="stageinfo">
        <span className={actor.color}>{actor.name}</span>
        {"'"}s turn
      </div>
      <div className="stagedice" data-fxstage>
        <Die key={`a${dice?.[0] ?? 'x'}`} value={dice?.[0] ?? null} />
        <Die key={`b${dice?.[1] ?? 'x'}`} value={dice?.[1] ?? null} />
      </div>

      {waitLabel && <div className="dimtext">{waitLabel}</div>}

      {!waitLabel && (
        <div className="stagebtns">
          {actions.some((a) => a.type === 'ROLL') && (
            <button className="primary" onClick={() => dispatch({ type: 'ROLL' })}>
              Roll 2d6
            </button>
          )}

          {tokens.map((t) => (
            <button key={`${t.kind}-${t.dieIndex}-${t.delta ?? 0}`} onClick={() => dispatch(t)}>
              {t.kind === 'reroll'
                ? `Reroll die ${t.dieIndex + 1}`
                : `Nudge die ${t.dieIndex + 1} ${t.delta === 1 ? '+1' : '-1'}`}
            </button>
          ))}

          {actions.some((a) => a.type === 'REROLL_BOTH') && (
            <button onClick={() => dispatch({ type: 'REROLL_BOTH' })}>Destiny: reroll both</button>
          )}
          {([0, 1] as const).map((di) => {
            const faces = actions.filter(
              (a): a is Action & { type: 'SET_DIE' } => a.type === 'SET_DIE' && a.dieIndex === di,
            );
            if (faces.length === 0) return null;
            return (
              <span key={di} className="loadrow">
                <span className="dimtext">load die {di + 1}:</span>
                {faces.map((a) => (
                  <button key={a.face} className="facebtn" onClick={() => dispatch(a)}>
                    {a.face}
                  </button>
                ))}
              </span>
            );
          })}

          {allocs.map((a) => {
            const nums = previewNumbers(dice!, a.mode);
            return (
              <button
                key={a.mode}
                className="choicebtn"
                onMouseEnter={() => setPreview(a.mode)}
                onMouseLeave={() => setPreview(null)}
                onClick={() => {
                  setPreview(null);
                  dispatch(a);
                }}
                title={nums
                  .map((n) => `slot ${n}: ${fxList(roller.board[n - 1]!.active)}`)
                  .join(' | ')}
              >
                <span className="choicelabel">
                  {a.mode === 'individual'
                    ? `Split: ${dice![0]} + ${dice![1]}`
                    : `Sum: ${dice![0] + dice![1]}`}
                </span>
                <span className="choicefx">
                  {nums.map((n, idx) => (
                    <span key={idx} className="choiceslot">
                      <span className="slotnum">{n}</span>
                      <EffectIcons effects={roller.board[n - 1]!.active} context="active" />
                    </span>
                  ))}
                </span>
              </button>
            );
          })}

          {echoChoices.length > 0 &&
            dice &&
            (
              [
                ['individual', `Hear ${dice[0]} + ${dice[1]}`, [dice[0], dice[1]]],
                ['sum', `Hear ${dice[0] + dice[1]}`, [dice[0] + dice[1]]],
              ] as [AllocationMode, string, number[]][]
            ).map(([mode, label, numbers]) => {
              const lines = numbers.flatMap((n) =>
                actor.echoStack.filter((e) => e.slot === n).map((e) => e.def.echo),
              );
              // High echoes (7-12) hear the sum under either choice.
              const sum = dice[0] + dice[1];
              if (game.tunables.highEchoHearsSum && sum >= 7 && !numbers.includes(sum)) {
                lines.push(
                  ...actor.echoStack.filter((e) => e.slot === sum).map((e) => e.def.echo),
                );
              }
              return (
                <button
                  key={mode}
                  className="choicebtn"
                  onClick={() => dispatch({ type: 'ECHO_CHOICE', mode })}
                >
                  <span className="choicelabel">{label}</span>
                  <span className="choicefx">
                    {lines.length === 0 ? (
                      <span className="dimtext">nothing</span>
                    ) : (
                      <EffectIcons effects={aggregateEchoEffects(lines)} context="echo" />
                    )}
                  </span>
                </button>
              );
            })}

          {targets.map((t) => (
            <button key={t.playerId} className="primary" onClick={() => dispatch(t)}>
              Hit {game.players[t.playerId]!.name}
            </button>
          ))}

          {actions.some((a) => a.type === 'SKIP_BUY') && (
            <button onClick={() => dispatch({ type: 'SKIP_BUY' })}>Skip buy</button>
          )}
          {actions.some((a) => a.type === 'END_TURN') && (
            <button className="primary" onClick={() => dispatch({ type: 'END_TURN' })}>
              End turn
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Your seat at the bottom of the table: the full board with real card faces. */
function SelfMat(props: {
  p: PlayerState;
  seat: number;
  game: GameState;
  pulses: StatPulse[];
  highlight: number[];
  fired: number[];
  buyable: number[];
  onSlotClick: (slot: number) => void;
  bubble?: { id: number; text: string; big: boolean };
  /** Set on the table instance only: the fx layer flies coins/damage here.
   *  The inspect-overlay copy must NOT anchor or fx would land on it. */
  fxAnchor?: boolean;
}) {
  const { p, seat, game, highlight, fired, buyable, onSlotClick, bubble } = props;
  const isTurn = seat === game.current;
  // Echo tabs flash on the numbers this seat chose to hear this turn.
  const paidSlots = game.echoNumbers[seat] ?? [];
  return (
    <section
      className={'panel selfmat' + (isTurn ? ' active' : '') + (p.eliminated ? ' out' : '')}
      data-fxseat={props.fxAnchor ? seat : undefined}
    >
      {bubble && (
        <div key={bubble.id} className={'chatbubble' + (bubble.big ? ' big' : '')}>
          {bubble.text}
        </div>
      )}
      <div className="mathead selfhead">
        <h3>
          <span className={p.color}>{p.name}</span>
          {p.eliminated ? ' - ELIMINATED' : ''}
        </h3>
        <StatChips
          hp={p.hp}
          money={p.money}
          points={p.points}
          reroll={p.tokens.reroll}
          nudge={p.tokens.nudge}
          pulses={props.pulses}
        />
        <RelicChips p={p} />
      </div>
      <div className="slots">
        {p.board.map((card, i) => {
          const slot = i + 1;
          const echoesHere = p.echoStack.filter((e) => e.slot === slot);
          const cls =
            'slot' +
            (highlight.includes(slot) ? ' preview' : '') +
            (fired.includes(slot) ? ' fired' : '') +
            (buyable.includes(slot) ? ' buyable' : '');
          const tip =
            `${card.name}\nwhen rolled: ${fxList(card.active)}\necho if retired: ${fxList(card.echo)}` +
            (echoesHere.length > 0
              ? `\nechoing now: ${echoesHere
                  .map((e) => `${e.def.name} (${fxList(e.def.echo)})`)
                  .join(', ')}`
              : '');
          const live = echoesHere.length > 0;
          return (
            <div key={slot} className="slotwrap">
              <div
                className={
                  'echotab' +
                  (live ? ' live' : '') +
                  (live && paidSlots.includes(slot) ? ' paid' : '')
                }
                title={
                  live
                    ? `echoing in slot ${slot}: ${echoesHere
                        .map((e) => `${e.def.name} (${fxList(e.def.echo)})`)
                        .join(', ')}`
                    : undefined
                }
              >
                {live && (
                  <>
                    <span className="rowlab">
                      echo{echoesHere.length > 1 ? ` ×${echoesHere.length}` : ''}
                    </span>
                    <EffectIcons
                      effects={aggregateEchoEffects(echoesHere.map((e) => e.def.echo))}
                      context="echo"
                    />
                  </>
                )}
              </div>
              <div className={cls} onClick={() => onSlotClick(slot)} title={tip}>
                <CardFace card={card} slotBadge={slot} />
                {(p.charges[i] ?? 0) > 0 && (
                  <span className="chargebadge" title={`${p.charges[i]} charge(s) built up`}>
                    {p.charges[i]}×
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Owned relics as small icon chips (tooltip carries the rules text). */
function RelicChips({ p }: { p: PlayerState }) {
  if (p.relics.length === 0) return null;
  return (
    <span className="relicowned">
      {p.relics.map((id) => {
        const d = RELIC_BY_ID[id]!;
        const pick = p.relicPicks[id];
        return (
          <img
            key={id}
            src={iconUrl(d.icon ?? '')}
            alt={d.name}
            title={`${d.name}: ${d.text}${pick !== undefined ? ` (slot ${pick})` : ''}`}
            onError={iconError}
          />
        );
      })}
    </span>
  );
}

/** An opponent's seat: compact mat of icon tiles. Hover a tile for the full
 *  card; the purple corner counts echoes waiting in that slot. Click the mat
 *  to open the full-size board. */
function OppMat(props: {
  p: PlayerState;
  seat: number;
  game: GameState;
  pulses: StatPulse[];
  fired: number[];
  onInspect: () => void;
  disconnected?: boolean;
  /** Host-only: hand this seat to a bot (shown while disconnected). */
  onReplaceBot?: () => void;
  bubble?: { id: number; text: string; big: boolean };
}) {
  const { p, seat, game, fired, disconnected, bubble } = props;
  const isTurn = seat === game.current;
  const paidSlots = game.echoNumbers[seat] ?? [];
  return (
    <section
      className={'panel oppmat' + (isTurn ? ' active' : '') + (p.eliminated ? ' out' : '')}
      data-fxseat={seat}
      onClick={props.onInspect}
    >
      {bubble && (
        <div key={bubble.id} className={'chatbubble' + (bubble.big ? ' big' : '')}>
          {bubble.text}
        </div>
      )}
      <div className="mathead">
        <h3>
          <span className={p.color}>{p.name}</span> {isTurn ? '(rolling)' : ''}
          {p.eliminated ? ' - ELIMINATED' : ''}
          {disconnected && <span className="offlinetag">offline</span>}
        </h3>
        {disconnected && props.onReplaceBot && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              props.onReplaceBot!();
            }}
          >
            hand seat to a bot
          </button>
        )}
        <StatChips
          hp={p.hp}
          money={p.money}
          points={p.points}
          reroll={p.tokens.reroll}
          nudge={p.tokens.nudge}
          pulses={props.pulses}
        />
        <RelicChips p={p} />
        <span className="zoomhint">click to enlarge</span>
      </div>
      <div className="minislots">
        {p.board.map((card, i) => {
          const slot = i + 1;
          const echoesHere = p.echoStack.filter((e) => e.slot === slot);
          const tip =
            `slot ${slot}: ${card.name}\nwhen rolled: ${fxList(card.active)}\necho if retired: ${fxList(card.echo)}` +
            (echoesHere.length > 0
              ? `\nechoing now: ${echoesHere
                  .map((e) => `${e.def.name} (${fxList(e.def.echo)})`)
                  .join(', ')}`
              : '');
          const cls =
            'mini' +
            (fired.includes(slot) ? ' fired' : '') +
            (echoesHere.length > 0 && paidSlots.includes(slot) ? ' paid' : '');
          return (
            <div
              key={slot}
              className={cls}
              style={{ background: TINT[card.color] ?? '#555' }}
              title={tip}
            >
              {card.icon && (
                <img src={iconUrl(card.icon)} alt="" onError={iconError} onLoad={iconLoaded} />
              )}
              <span className="mininum">{slot}</span>
              {echoesHere.length > 0 && <span className="miniecho">{echoesHere.length}</span>}
              {(p.charges[i] ?? 0) > 0 && <span className="minicharge">{p.charges[i]}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
