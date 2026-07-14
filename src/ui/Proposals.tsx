// The proposed-cards log: friends submit designs from the Card Lab, the admin
// (Jake) edits, approves, or rejects them. Approved cards become the shared
// community pack that loads into every game.
import { useEffect, useState } from 'react';
import type { CardDef } from '../engine';
import { supa } from '../supa/client';
import type { ProposedCardRow } from '../supa/client';
import { useAccount } from './account';
import { CardFace } from './CardFace';

export function Proposals({ onEdit }: { onEdit: (card: CardDef, proposalId: string) => void }) {
  const profile = useAccount((s) => s.profile);
  const userId = useAccount((s) => s.userId);
  const refreshCommunity = useAccount((s) => s.refreshCommunity);
  const [rows, setRows] = useState<ProposedCardRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const admin = profile?.is_admin === true;

  const load = async () => {
    const { data, error } = await supa
      .from('proposed_cards')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setErr(error.message);
    else setRows(data as ProposedCardRow[]);
  };
  useEffect(() => {
    void load();
  }, []);

  const setStatus = async (id: string, status: 'approved' | 'rejected' | 'proposed') => {
    const { error } = await supa
      .from('proposed_cards')
      .update({
        status,
        reviewer_notes: notes[id]?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) setErr(error.message);
    await load();
    await refreshCommunity();
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this proposal?')) return;
    const { error } = await supa.from('proposed_cards').delete().eq('id', id);
    if (error) setErr(error.message);
    await load();
    await refreshCommunity();
  };

  if (err) return <p className="err">{err}</p>;
  if (rows === null) return <p className="dimtext">loading proposals...</p>;
  if (rows.length === 0) {
    return (
      <p className="dimtext">
        No proposed cards yet. Design a card in a pack and hit Propose to the table.
      </p>
    );
  }
  return (
    <>
      <h3>Proposed cards</h3>
      {!userId && <p className="dimtext">Sign in on the setup screen to propose cards.</p>}
      <div className="proposals">
        {rows.map((r) => {
          const card = r.card as CardDef;
          const mine = r.author !== null && r.author === userId;
          return (
            <div key={r.id} className="proposalrow">
              <div className="shopcard" style={{ cursor: 'default' }}>
                <CardFace card={card} showCost />
              </div>
              <div className="proposalmeta">
                <div>
                  <b>{card.name}</b> <span className={'statuschip st-' + r.status}>{r.status}</span>
                </div>
                <div className="dimtext">
                  by {r.author_name} on {new Date(r.created_at).toLocaleDateString()}
                </div>
                {r.reviewer_notes && <div className="dimtext">notes: {r.reviewer_notes}</div>}
                {admin && (
                  <div className="proposalactions">
                    <input
                      placeholder="notes to the author (optional)"
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                    />
                    <div>
                      <button onClick={() => onEdit(structuredClone(card), r.id)}>edit</button>
                      {r.status !== 'approved' && (
                        <button className="primary" onClick={() => setStatus(r.id, 'approved')}>
                          approve
                        </button>
                      )}
                      {r.status !== 'rejected' && (
                        <button onClick={() => setStatus(r.id, 'rejected')}>reject</button>
                      )}
                      {r.status !== 'proposed' && (
                        <button onClick={() => setStatus(r.id, 'proposed')}>back to pending</button>
                      )}
                      <button onClick={() => remove(r.id)}>delete</button>
                    </div>
                  </div>
                )}
                {!admin && mine && r.status === 'proposed' && (
                  <div className="proposalactions">
                    <button onClick={() => remove(r.id)}>withdraw</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
