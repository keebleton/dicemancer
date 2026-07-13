import { useEffect, useState } from 'react';
import { legalActions, previewNumbers } from '../engine';
import type { Action, AllocationMode, GameState, PlayerState } from '../engine';
import { fxList } from './describe';
import { useGame } from './store';

export function Game() {
  const game = useGame((s) => s.game)!;
  const dispatch = useGame((s) => s.dispatch);
  const reset = useGame((s) => s.reset);
  const log = useGame((s) => s.log);
  const [preview, setPreview] = useState<AllocationMode | null>(null);
  const [buyIndex, setBuyIndex] = useState<number | null>(null);

  useEffect(() => {
    setPreview(null);
    setBuyIndex(null);
  }, [game.current, game.phase]);

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
        <h1>Dicemancer</h1>
        <div>
          round {game.round}/{game.tunables.roundCap} | <b className={me.color}>{me.name}</b>
          {"'"}s turn <button onClick={reset}>quit to setup</button>
        </div>
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
  if (game.winner !== null) return null;
  const me = game.players[game.current]!;
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
      <div className="dice">dice: {game.dice ? `${game.dice[0]} + ${game.dice[1]}` : '-'}</div>

      {actions.some((a) => a.type === 'ROLL') && (
        <button onClick={() => dispatch({ type: 'ROLL' })}>Roll 2d6</button>
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
        <button key={t.playerId} onClick={() => dispatch(t)}>
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
                  <div className="fx">A: {fxList(card.active)}</div>
                  <div className="fx">E: {fxList(card.echo)}</div>
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
        <button onClick={() => dispatch({ type: 'END_TURN' })}>End turn</button>
      )}
    </section>
  );
}

function PlayerPanel(props: {
  p: PlayerState;
  seat: number;
  game: GameState;
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
      <div>
        hp {p.hp} | money {p.money} | points {p.points} | tokens: {p.tokens.reroll} reroll,{' '}
        {p.tokens.nudge} nudge
      </div>
      <div className="slots">
        {p.board.map((card, i) => {
          const slot = i + 1;
          const cls =
            'slot' +
            (highlight.includes(slot) ? ' preview' : '') +
            (fired.includes(slot) ? ' fired' : '') +
            (buyable.includes(slot) ? ' buyable' : '');
          return (
            <div key={slot} className={cls} onClick={() => onSlotClick(slot)}>
              <b>{slot}</b> {card.name}
              <div className="fx">A: {fxList(card.active)}</div>
              <div className="fx">E: {fxList(card.echo)}</div>
            </div>
          );
        })}
      </div>
      <div className="echo">
        <b>Echo stack:</b>{' '}
        {p.echoStack.length === 0
          ? 'empty'
          : p.echoStack
              .map((e) => `slot ${e.slot}: ${e.def.name} (${fxList(e.def.echo)})`)
              .join(' | ')}
      </div>
    </section>
  );
}
