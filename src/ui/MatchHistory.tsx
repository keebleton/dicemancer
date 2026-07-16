// Recent finished games, read from Supabase match_results.
import { useEffect, useState } from 'react';
import { listMatches } from './rooms';
import type { MatchRow } from './rooms';

const REASON_LABEL: Record<string, string> = {
  points: 'on points',
  ko: 'by knockout',
  failsafe: 'at the bell',
  card: 'by destiny',
};

export function MatchHistory({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  useEffect(() => {
    void listMatches().then(setRows);
  }, []);
  return (
    <div className="inspect-overlay" onClick={onClose}>
      <div className="inspect howto" onClick={(e) => e.stopPropagation()}>
        <section className="panel">
          <div className="howtohead">
            <h3>Match history</h3>
            <button onClick={onClose}>close</button>
          </div>
          {rows === null && <p className="dimtext">loading...</p>}
          {rows !== null && rows.length === 0 && (
            <p className="dimtext">No recorded games yet. Online games report here when they end.</p>
          )}
          {rows !== null && rows.length > 0 && (
            <div className="matchlist">
              {rows.map((m) => {
                const players = [...m.players].sort((a, b) => b.points - a.points);
                return (
                  <div key={m.id} className="matchrow">
                    <span className="dimtext matchdate">
                      {new Date(m.created_at).toLocaleDateString()}{' '}
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="matchplayers">
                      {players.map((p, i) => (
                        <span key={i} className={p.color}>
                          {p.won ? '★ ' : ''}
                          {p.name} ({p.points})
                          {i < players.length - 1 ? '  ' : ''}
                        </span>
                      ))}
                    </span>
                    <span className="dimtext">
                      {REASON_LABEL[m.win_reason ?? ''] ?? m.win_reason} in {m.rounds ?? '?'} rounds
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
