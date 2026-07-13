import { useState } from 'react';
import { Game } from './Game';
import { useGame } from './store';

export function App() {
  const game = useGame((s) => s.game);
  return game ? <Game /> : <Setup />;
}

function Setup() {
  const start = useGame((s) => s.start);
  const [count, setCount] = useState(2);
  const [cap, setCap] = useState(25);
  return (
    <main className="setup">
      <h1>Dicemancer</h1>
      <p>Hotseat: one device, every seat is human. Pass the mouse.</p>
      <div>
        players:{' '}
        {[2, 3, 4].map((n) => (
          <button key={n} className={count === n ? 'selected' : ''} onClick={() => setCount(n)}>
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
      <button className="start" onClick={() => start(count, cap)}>
        Start game
      </button>
    </main>
  );
}
