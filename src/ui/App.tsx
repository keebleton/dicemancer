import { useState } from 'react';
import { Game } from './Game';
import { useGame } from './store';
import type { SeatKind } from './store';

export function App() {
  const game = useGame((s) => s.game);
  return game ? <Game /> : <Setup />;
}

function Setup() {
  const start = useGame((s) => s.start);
  const [count, setCount] = useState(2);
  const [cap, setCap] = useState(25);
  const [kinds, setKinds] = useState<SeatKind[]>(['human', 'bot', 'bot', 'bot']);
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
        <div key={i}>
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
      <button className="start" onClick={() => start(count, cap, undefined, kinds)}>
        Start game
      </button>
    </main>
  );
}
