import { useState } from 'react';
import type { SeatColor } from '../engine';
import { Game } from './Game';
import { Lab } from './Lab';
import { loadPacks, savePacks } from './packs';
import { useGame } from './store';
import type { SeatKind } from './store';

const SEAT_COLORS: SeatColor[] = ['red', 'blue', 'black', 'green', 'yellow'];

export function App() {
  const game = useGame((s) => s.game);
  const [lab, setLab] = useState(false);
  if (game) return <Game />;
  if (lab) return <Lab onClose={() => setLab(false)} />;
  return <Setup onLab={() => setLab(true)} />;
}

function Setup({ onLab }: { onLab: () => void }) {
  const start = useGame((s) => s.start);
  const [count, setCount] = useState(2);
  const [cap, setCap] = useState(25);
  const [kinds, setKinds] = useState<SeatKind[]>(['human', 'bot', 'bot', 'bot']);
  const [colors, setColors] = useState<SeatColor[]>(['red', 'blue', 'green', 'yellow']);
  const [packs, setPacks] = useState(() => loadPacks());
  const togglePack = (id: string) => {
    const next = packs.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
    setPacks(next);
    savePacks(next);
  };
  return (
    <main className="setup">
      <h1>Dicemancer</h1>
      <p>Any mix of humans and bots. Multiple humans = hotseat, pass the mouse.</p>
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
