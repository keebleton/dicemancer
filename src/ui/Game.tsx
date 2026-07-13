import { useEffect, useState } from 'react';
import { chooseAction } from '../bot';
import { legalActions, previewNumbers } from '../engine';
import type { Action, AllocationMode, GameState, PlayerState } from '../engine';
import { fxList } from './describe';
import { aggregateEchoEffects, Die, EffectIcons, IconLegend, StatChips } from './icons';
import { useGame } from './store';
import type { StatPulse } from './store';

export function Game() {
  const game = useGame((s) => s.game)!;
  const seatKinds = useGame((s) => s.seatKinds);
  const dispatch = useGame((s) => s.dispatch);
  const reset = useGame((s) => s.reset);
  const log = useGame((s) => s.log);
  const pulses = useGame((s) => s.pulses);
  const [preview, setPreview] = useState<AllocationMode | null>(null);
  const [buyIndex, setBuyIndex] = useState<number | null>(null);

  useEffect(() => {
    setPreview(null);
    setBuyIndex(null);
  }, [game.current, game.phase]);

  // Bot turns auto-play, one action per tick so the log is followable.
  const botTurn = game.winner === null && seatKinds[game.current] === 'bot';
  useEffect(() => {
    if (!botTurn) return;
    const t = setTimeout(() => {
      const g = useGame.getState().game;
      const kinds = useGame.getState().seatKinds;
      if (g && g.winner === null && kinds[g.current] === 'bot') {
        useGame.getState().dispatch(chooseAction(g));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [game, botTurn]);

  const actions = legalActions(game);
  const me = game.players[game.current]!;
  const previewSlots = preview && game.dice ? previewNumbers(game.dice, preview) : [];
  const buys = actions.filter((a): a is Action & { type: 'BUY' } => a.type === 'BUY');
  const buySlots =
    buyIndex === null
      ? []
      : buys.filter((a) => a.shopIndex === buyIndex).map((a) => a.targetSlot);
  const firedSlots =
    game.lastAllocation && game.phase !== 'roll' && game.phase !== 'allocate'
      ? game.lastAllocation.numbers
      : [];

  return (
    <main>
      <header>
        <div className="topbar">
          <h1>Dicemancer</h1>
          <span className="chip">
            round {game.round}/{game.tunables.roundCap}
          </span>
          <span className={`chip turn ${me.color}`}>{me.name}{"'"}s turn</span>
          <button onClick={reset}>quit to setup</button>
        </div>
        <IconLegend />
      </header>

      {game.winner !== null && (
        <div className="winner">
          {game.players[game.winner]!.name} wins by {game.winReason}!{' '}
          <button onClick={reset}>new game</button>
        </div>
      )}

      <Controls
        game={game}
        actions={actions}
        dispatch={dispatch}
        preview={preview}
        setPreview={setPreview}
        buyIndex={buyIndex}
        setBuyIndex={setBuyIndex}
      />

      {game.players.map((p, seat) => (
        <PlayerPanel
          key={seat}
          p={p}
          seat={seat}
          game={game}
          pulses={pulses.filter((x) => x.seat === seat)}
          highlight={seat === game.current ? previewSlots : []}
          fired={seat === game.current ? firedSlots : []}
          buyable={seat === game.current ? buySlots : []}
          onSlotClick={(slot) => {
            if (buyIndex !== null && buySlots.includes(slot)) {
              dispatch({ type: 'BUY', shopIndex: buyIndex, targetSlot: slot });
              setBuyIndex(null);
            }
          }}
        />
      ))}

      <section className="panel">
        <h3>Log</h3>
        <div className="log">
          {[...log].reverse().map((line, i) => (
            <div key={log.length - i}>{line}</div>
          ))}
        </div>
      </section>
    </main>
  );
}

const PHASE_HINT: Record<GameState['phase'], string> = {
  roll: 'roll the dice',
  allocate: 'spend tokens, then pick an allocation',
  chooseTarget: 'choose a target',
  buy: 'buy one card or skip',
  end: 'end your turn',
};

function Controls(props: {
  game: GameState;
  actions: Action[];
  dispatch: (a: Action) => void;
  preview: AllocationMode | null;
  setPreview: (m: AllocationMode | null) => void;
  buyIndex: number | null;
  setBuyIndex: (i: number | null) => void;
}) {
  const { game, actions, dispatch, preview, setPreview, buyIndex, setBuyIndex } = props;
  const seatKinds = useGame((s) => s.seatKinds);
  if (game.winner !== null) return null;
  const me = game.players[game.current]!;
  if (seatKinds[game.current] === 'bot') {
    return (
      <section className="panel active">
        <h3>
          <span className={me.color}>{me.name}</span> is thinking...
        </h3>
      </section>
    );
  }
  const allocs = actions.filter((a): a is Action & { type: 'ALLOCATE' } => a.type === 'ALLOCATE');
  const tokens = actions.filter(
    (a): a is Action & { type: 'SPEND_TOKEN' } => a.type === 'SPEND_TOKEN',
  );
  const targets = actions.filter(
    (a): a is Action & { type: 'CHOOSE_TARGET' } => a.type === 'CHOOSE_TARGET',
  );
  const buyableIndexes = new Set(
    actions.filter((a) => a.type === 'BUY').map((a) => (a.type === 'BUY' ? a.shopIndex : -1)),
  );
  const inBuyPhase = actions.some((a) => a.type === 'SKIP_BUY');

  return (
    <section className="panel active">
      <h3>
        <span className={me.color}>{me.name}</span>: {PHASE_HINT[game.phase]}
      </h3>
      <div className="dicetray">
        <Die key={`a${game.dice?.[0] ?? 'x'}`} value={game.dice?.[0] ?? null} />
        <Die key={`b${game.dice?.[1] ?? 'x'}`} value={game.dice?.[1] ?? null} />
      </div>

      {actions.some((a) => a.type === 'ROLL') && (
        <button className="primary" onClick={() => dispatch({ type: 'ROLL' })}>
          Roll 2d6
        </button>
      )}

      {tokens.map((t) => (
        <button
          key={`${t.kind}-${t.dieIndex}-${t.delta ?? 0}`}
          onClick={() => dispatch(t)}
        >
          {t.kind === 'reroll'
            ? `Reroll die ${t.dieIndex + 1}`
            : `Nudge die ${t.dieIndex + 1} ${t.delta === 1 ? '+1' : '-1'}`}
        </button>
      ))}

      {allocs.map((a) => (
        <button
          key={a.mode}
          className="primary"
          onMouseEnter={() => setPreview(a.mode)}
          onMouseLeave={() => setPreview(null)}
          onClick={() => {
            setPreview(null);
            dispatch(a);
          }}
        >
          {a.mode === 'individual'
            ? `Split the dice (slots ${game.dice![0]} + ${game.dice![1]})`
            : `Take the sum (slot ${game.dice![0] + game.dice![1]})`}
        </button>
      ))}
      {preview && game.dice && (
        <div className="hint">
          would fire:{' '}
          {previewNumbers(game.dice, preview)
            .map((n) => `slot ${n} - ${me.board[n - 1]!.name} (${fxList(me.board[n - 1]!.active)})`)
            .join('; ')}
        </div>
      )}

      {targets.map((t) => (
        <button key={t.playerId} className="primary" onClick={() => dispatch(t)}>
          Hit {game.players[t.playerId]!.name}
        </button>
      ))}

      {me.shop.length > 0 && (
        <div className="shop">
          <b>Shop</b> (money: {me.money})
          <div>
            {me.shop.map((card, i) =>
              card ? (
                <div
                  key={i}
                  className={
                    'shopcard' +
                    (card.rarity === 'rare' ? ' rare' : '') +
                    (buyIndex === i ? ' selected' : '') +
                    (buyableIndexes.has(i) ? '' : ' dead')
                  }
                  onClick={() => {
                    if (buyableIndexes.has(i)) setBuyIndex(buyIndex === i ? null : i);
                  }}
                >
                  <b>{card.name}</b> ({card.cost})<br />
                  <span className={card.color}>{card.color}</span> | slots{' '}
                  {card.legalSlots.length === 12 ? 'any' : card.legalSlots.join(',')}
                  <div className="fxline">
                    <span className="rowlab">roll</span>
                    <EffectIcons effects={card.active} context="active" />
                  </div>
                  <div className="fxline dim">
                    <span className="rowlab">echo</span>
                    <EffectIcons effects={card.echo} context="echo" />
                  </div>
                </div>
              ) : (
                <div key={i} className="shopcard dead">
                  (bought)
                </div>
              ),
            )}
          </div>
          {buyIndex !== null && (
            <div className="hint">
              click a highlighted board slot to install{' '}
              <button onClick={() => setBuyIndex(null)}>cancel</button>
            </div>
          )}
        </div>
      )}

      {inBuyPhase && <button onClick={() => dispatch({ type: 'SKIP_BUY' })}>Skip buy</button>}
      {actions.some((a) => a.type === 'END_TURN') && (
        <button className="primary" onClick={() => dispatch({ type: 'END_TURN' })}>
          End turn
        </button>
      )}
    </section>
  );
}

function PlayerPanel(props: {
  p: PlayerState;
  seat: number;
  game: GameState;
  pulses: StatPulse[];
  highlight: number[];
  fired: number[];
  buyable: number[];
  onSlotClick: (slot: number) => void;
}) {
  const { p, seat, game, highlight, fired, buyable, onSlotClick } = props;
  const isTurn = seat === game.current;
  return (
    <section className={'panel' + (isTurn ? ' active' : '') + (p.eliminated ? ' out' : '')}>
      <h3>
        <span className={p.color}>{p.name}</span> {isTurn ? '(rolling)' : ''}
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
                className={'echotab' + (live ? ' live' : '')}
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
                <div className="slothead">
                  <span className="slotnum">{slot}</span> {card.name}
                </div>
                <div className="fxline">
                  <span className="rowlab">roll</span>
                  <EffectIcons effects={card.active} context="active" />
                </div>
                <div className="fxline dim">
                  <span className="rowlab">echo</span>
                  <EffectIcons effects={card.echo} context="echo" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
