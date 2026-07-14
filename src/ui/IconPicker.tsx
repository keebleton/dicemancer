// Search-and-pick over the WoW icon catalog. Used by the Card Lab (card art)
// and the profile editor (avatars). The manifest lists the whole catalog;
// icons not shipped with the site load from the CDN via iconError.
import { useEffect, useMemo, useState } from 'react';
import { iconError, iconUrl } from './packs';

let manifestCache: string[] | null = null;

export function IconPicker({
  onPick,
  onClose,
}: {
  onPick: (n: string) => void;
  onClose: () => void;
}) {
  const [names, setNames] = useState<string[]>(manifestCache ?? []);
  const [ready, setReady] = useState(manifestCache !== null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (manifestCache !== null) return;
    fetch(`${import.meta.env.BASE_URL}wow-icons.json`)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .then((list) => {
        manifestCache = list;
        setNames(list);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = s ? names.filter((n) => n.toLowerCase().includes(s)) : names;
    return filtered.slice(0, 120);
  }, [q, names]);

  return (
    <div className="iconpick-overlay" onClick={onClose}>
      <div className="iconpick" onClick={(e) => e.stopPropagation()}>
        <div className="field">
          <input
            autoFocus
            placeholder="search 23k icons... (sword, fire, coin, skull)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button onClick={onClose}>close</button>
        </div>
        {!ready && <p className="dimtext">loading icon list...</p>}
        {ready && names.length === 0 && (
          <p className="dimtext">No icons found (the icon manifest did not load).</p>
        )}
        <div className="icongrid">
          {matches.map((n) => (
            <img
              key={n}
              src={iconUrl(n)}
              alt={n}
              title={n}
              loading="lazy"
              onError={iconError}
              onClick={() => onPick(n)}
            />
          ))}
        </div>
        {ready && names.length > 0 && (
          <p className="dimtext">
            showing {matches.length} of{' '}
            {q ? names.filter((n) => n.toLowerCase().includes(q.toLowerCase())).length : names.length}
          </p>
        )}
      </div>
    </div>
  );
}
