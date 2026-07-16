// Rankings from profile lifetime stats (online games report on finish).
import { useEffect, useState } from 'react';
import { iconError, iconUrl } from './packs';
import { listLeaders } from './rooms';
import type { Profile } from '../supa/client';

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Profile[] | null>(null);
  useEffect(() => {
    void listLeaders().then(setRows);
  }, []);
  return (
    <div className="inspect-overlay" onClick={onClose}>
      <div className="inspect howto friendspanel" onClick={(e) => e.stopPropagation()}>
        <section className="panel">
          <div className="howtohead">
            <h3>Leaderboard</h3>
            <button onClick={onClose}>close</button>
          </div>
          {rows === null && <p className="dimtext">loading...</p>}
          {rows !== null && rows.length === 0 && <p className="dimtext">no games recorded yet</p>}
          {rows !== null && rows.length > 0 && (
            <div className="leaderlist">
              {rows.map((p, i) => (
                <div key={p.id} className="netrow friendrow">
                  <span className={'leadrank' + (i < 3 ? ' top' : '')}>{i + 1}</span>
                  <img className="avatar" src={iconUrl(p.avatar_icon)} alt="" onError={iconError} />
                  <b>{p.username}</b>
                  <span className="dimtext leadstats">
                    {p.games_won} wins / {p.games_played} games (
                    {Math.round((100 * p.games_won) / Math.max(1, p.games_played))}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
