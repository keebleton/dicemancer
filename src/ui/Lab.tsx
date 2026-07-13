// The Card Lab: design custom cards, save them into packs, sim-test them.
import { useEffect, useMemo, useState } from 'react';
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import type { CardColor, CardDef, ConditionalWhen, Effect } from '../engine';
import { simulate } from '../sim/sim';
import { fxList } from './describe';
import { EffectIcons } from './icons';
import {
  builtinIds,
  iconUrl,
  loadOverrides,
  loadPacks,
  mergedPools,
  saveOverrides,
  savePacks,
  uniqueId,
  validateCard,
} from './packs';
import type { CardOverrides, CardPack } from './packs';

const CARD_COLORS: CardColor[] = ['red', 'blue', 'black', 'green', 'yellow', 'colorless'];

/** Every shipping card, grouped for the reference catalog. */
const CATALOG: { label: string; cards: CardDef[] }[] = (() => {
  const p = pools();
  return [
    { label: 'red', cards: p.red },
    { label: 'blue', cards: p.blue },
    { label: 'black', cards: p.black },
    { label: 'green', cards: p.green },
    { label: 'yellow', cards: p.yellow },
    { label: 'colorless', cards: p.colorless },
    { label: 'starters', cards: starterBoard() },
  ];
})();
const CATALOG_COUNT = CATALOG.reduce((n, g) => n + g.cards.length, 0);

const blankCard = (): CardDef => ({
  id: 'new-card',
  name: 'New Card',
  color: 'colorless',
  rarity: 'common',
  cost: 3,
  legalSlots: [1],
  active: [{ kind: 'gainMoney', amount: 1 }],
  echo: [{ kind: 'gainMoney', amount: 1 }],
});

export function Lab({ onClose }: { onClose: () => void }) {
  const [packs, setPacks] = useState<CardPack[]>(() => loadPacks());
  const [packId, setPackId] = useState<string | null>(null);
  const [packName, setPackName] = useState('');
  const [draft, setDraft] = useState<CardDef | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  /** Non-null while editing a BUILT-IN card: saves go to the overrides layer. */
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<CardOverrides>(() => loadOverrides());
  const [browsing, setBrowsing] = useState(false);

  const pack = packs.find((p) => p.id === packId) ?? null;

  const persist = (next: CardPack[]) => {
    setPacks(next);
    savePacks(next);
  };

  const newPack = () => {
    const name = packName.trim() || `Pack ${packs.length + 1}`;
    const id = uniqueId(name, new Set(packs.map((p) => p.id)));
    persist([...packs, { id, name, enabled: true, cards: [] }]);
    setPackId(id);
    setPackName('');
  };

  const deletePack = (id: string) => {
    if (!window.confirm('Delete this pack and all its cards?')) return;
    persist(packs.filter((p) => p.id !== id));
    if (packId === id) setPackId(null);
  };

  const exportPack = (p: CardPack) => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p.id}.dicemancer-pack.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importPack = (file: File) => {
    file.text().then((text) => {
      try {
        const raw = JSON.parse(text) as CardPack;
        if (!Array.isArray(raw.cards)) throw new Error('not a pack');
        const id = uniqueId(raw.name ?? 'imported', new Set(packs.map((p) => p.id)));
        persist([...packs, { id, name: raw.name ?? id, enabled: true, cards: raw.cards }]);
        setPackId(id);
      } catch {
        window.alert('That file does not look like a Dicemancer pack.');
      }
    });
  };

  const copyFromCatalog = (c: CardDef) => {
    if (!pack) {
      window.alert('Select or create a pack first, then copy cards into it.');
      return;
    }
    const clone = structuredClone(c);
    if (clone.color === 'starter') clone.color = 'colorless';
    if (clone.rarity === 'starter') clone.rarity = 'common';
    setDraft(clone); // saving re-generates a unique id, so the copy never collides
    setEditIndex(null);
    setOverrideId(null);
  };

  const editFromCatalog = (c: CardDef) => {
    setDraft(structuredClone(c)); // c already has any existing override applied
    setEditIndex(null);
    setOverrideId(c.id);
  };

  const resetOverride = (id: string) => {
    const next = { ...overrides };
    delete next[id];
    setOverrides(next);
    saveOverrides(next);
  };

  const saveDraft = () => {
    if (!draft) return;
    const check = validateCard(draft);
    if (check.errors.length > 0) return;
    if (overrideId) {
      // Built-in edit: the id stays anchored to the original card.
      const next = { ...overrides, [overrideId]: { ...draft, id: overrideId } };
      setOverrides(next);
      saveOverrides(next);
      setDraft(null);
      setOverrideId(null);
      return;
    }
    if (!pack) return;
    const taken = builtinIds();
    for (const p of packs) {
      p.cards.forEach((c, i) => {
        if (p.id === pack.id && i === editIndex) return; // its own old id is fine
        taken.add(c.id);
      });
    }
    const saved: CardDef = { ...draft, id: uniqueId(draft.name, taken) };
    const cards = [...pack.cards];
    if (editIndex === null) cards.push(saved);
    else cards[editIndex] = saved;
    persist(packs.map((p) => (p.id === pack.id ? { ...p, cards } : p)));
    setDraft(null);
    setEditIndex(null);
  };

  return (
    <main className="lab">
      <div className="topbar">
        <h1>Card Lab</h1>
        <span className="dimtext">
          build cards, pack them, test them vs bots; enabled packs join the shop pools
        </span>
        <button onClick={onClose}>back to setup</button>
      </div>

      <div className="labcols">
        <section className="panel labside">
          <h3>Packs</h3>
          {packs.map((p) => (
            <div key={p.id} className={'packrow' + (p.id === packId ? ' current' : '')}>
              <button
                className={p.id === packId && !browsing ? 'selected' : ''}
                onClick={() => {
                  setPackId(p.id);
                  setBrowsing(false);
                  setDraft(null);
                  setEditIndex(null);
                  setOverrideId(null);
                }}
              >
                {p.name} ({p.cards.length})
              </button>
              <button title="export as a file to share" onClick={() => exportPack(p)}>
                export
              </button>
              <button title="delete pack" onClick={() => deletePack(p.id)}>
                x
              </button>
            </div>
          ))}
          <div className="packnew">
            <input
              placeholder="new pack name"
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
            />
            <button onClick={newPack}>create</button>
          </div>
          <label className="importlab">
            import pack file
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importPack(f);
                e.target.value = '';
              }}
            />
          </label>
          <h3 style={{ marginTop: 14 }}>Reference</h3>
          <button
            className={browsing ? 'selected' : ''}
            onClick={() => {
              setBrowsing(true);
              setDraft(null);
              setEditIndex(null);
              setOverrideId(null);
            }}
          >
            browse all cards ({CATALOG_COUNT})
          </button>
        </section>

        <section className="panel labmain">
          {browsing && !draft && (
            <Catalog
              onCopy={copyFromCatalog}
              onEdit={editFromCatalog}
              onReset={resetOverride}
              overrides={overrides}
              copyTarget={pack?.name ?? null}
            />
          )}
          {!pack && !browsing && (
            <p className="dimtext">Create or pick a pack, or browse the existing cards.</p>
          )}
          {pack && !draft && !browsing && (
            <>
              <h3>{pack.name}</h3>
              {pack.cards.length === 0 && <p className="dimtext">No cards yet.</p>}
              <div>
                {pack.cards.map((c, i) => (
                  <div key={c.id} className="shopcard" style={{ cursor: 'default' }}>
                    <CardFace card={c} />
                    <div>
                      <button
                        onClick={() => {
                          setDraft(structuredClone(c));
                          setEditIndex(i);
                          setOverrideId(null);
                        }}
                      >
                        edit
                      </button>
                      <button
                        onClick={() =>
                          persist(
                            packs.map((p) =>
                              p.id === pack.id
                                ? { ...p, cards: p.cards.filter((_, j) => j !== i) }
                                : p,
                            ),
                          )
                        }
                      >
                        delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="primary"
                onClick={() => {
                  setDraft(blankCard());
                  setEditIndex(null);
                  setOverrideId(null);
                }}
              >
                New card
              </button>
            </>
          )}
          {draft && (pack || overrideId) && (
            <CardEditor
              draft={draft}
              setDraft={setDraft}
              packs={packs}
              editingBuiltin={overrideId !== null}
              onSave={saveDraft}
              onCancel={() => {
                setDraft(null);
                setEditIndex(null);
                setOverrideId(null);
              }}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function Catalog({
  onCopy,
  onEdit,
  onReset,
  overrides,
  copyTarget,
}: {
  onCopy: (c: CardDef) => void;
  onEdit: (c: CardDef) => void;
  onReset: (id: string) => void;
  overrides: CardOverrides;
  copyTarget: string | null;
}) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  return (
    <>
      <h3>All existing cards</h3>
      <div className="field">
        <input
          placeholder="filter by name..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />{' '}
        <span className="dimtext">
          edit changes the card for all your games |{' '}
          {copyTarget
            ? `copy puts an editable duplicate into ${copyTarget}`
            : 'select or create a pack to copy cards into it'}
        </span>
      </div>
      {CATALOG.map((group) => {
        const cards = q
          ? group.cards.filter(
              (c) => c.name.toLowerCase().includes(q) || c.id.includes(q),
            )
          : group.cards;
        if (cards.length === 0) return null;
        return (
          <div key={group.label}>
            <h4 className={group.label === 'starters' ? 'starter' : group.label}>
              {group.label} ({cards.length})
            </h4>
            {cards.map((c) => {
              const eff = overrides[c.id] ?? c;
              const edited = c.id in overrides;
              return (
                <div key={c.id} className="shopcard" style={{ cursor: 'default' }}>
                  <CardFace card={eff} />
                  {edited && <div className="editedtag">edited</div>}
                  <div>
                    <button onClick={() => onEdit(eff)}>edit</button>
                    <button onClick={() => onCopy(eff)}>copy</button>
                    {edited && (
                      <button title="restore the original card" onClick={() => onReset(c.id)}>
                        reset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function CardFace({ card }: { card: CardDef }) {
  return (
    <>
      <b>
        {card.icon && (
          <img
            className="cicon"
            src={iconUrl(card.icon)}
            alt=""
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}{' '}
        {card.name}
      </b>{' '}
      ({card.cost})<br />
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
    </>
  );
}

function CardEditor(props: {
  draft: CardDef;
  setDraft: (c: CardDef) => void;
  packs: CardPack[];
  editingBuiltin?: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { draft, setDraft, packs, editingBuiltin, onSave, onCancel } = props;
  const [picking, setPicking] = useState(false);
  const check = validateCard(draft);

  return (
    <div>
      <h3>Card editor</h3>
      {editingBuiltin && (
        <p className="dimtext">
          Editing a built-in card: saving changes it in every new game on this machine (the
          catalog gets a reset button to restore the original).
        </p>
      )}
      <div className="labcols">
        <div className="labform">
          <div className="field">
            name{' '}
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <button onClick={() => setPicking(true)}>
              {draft.icon ? 'change icon' : 'pick icon'}
            </button>
            {draft.icon && (
              <button onClick={() => setDraft({ ...draft, icon: undefined })}>no icon</button>
            )}
          </div>
          <div className="field">
            color{' '}
            <select
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value as CardColor })}
            >
              {draft.color === 'starter' && <option value="starter">starter</option>}
              {CARD_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>{' '}
            rarity{' '}
            <select
              value={draft.rarity}
              onChange={(e) =>
                setDraft({ ...draft, rarity: e.target.value as CardDef['rarity'] })
              }
            >
              {draft.rarity === 'starter' && <option value="starter">starter</option>}
              <option value="common">common</option>
              <option value="rare">rare</option>
            </select>{' '}
            cost{' '}
            <input
              type="number"
              min={0}
              max={20}
              value={draft.cost}
              onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="field">
            slots{' '}
            {Array.from({ length: 12 }, (_, i) => i + 1).map((s) => (
              <button
                key={s}
                className={'slotchip' + (draft.legalSlots.includes(s) ? ' selected' : '')}
                onClick={() =>
                  setDraft({
                    ...draft,
                    legalSlots: draft.legalSlots.includes(s)
                      ? draft.legalSlots.filter((x) => x !== s)
                      : [...draft.legalSlots, s].sort((a, b) => a - b),
                  })
                }
              >
                {s}
              </button>
            ))}
          </div>
          <div className="field">
            <b>Active</b> (fires when its number is rolled)
            <EffectListEditor
              list={draft.active}
              onChange={(active) => setDraft({ ...draft, active })}
            />
          </div>
          <div className="field">
            <b>Echo</b> (fires from the echo stack, about a third the power)
            <EffectListEditor list={draft.echo} onChange={(echo) => setDraft({ ...draft, echo })} />
          </div>
          {check.errors.map((e) => (
            <div key={e} className="err">
              {e}
            </div>
          ))}
          {check.warnings.map((w) => (
            <div key={w} className="warn">
              breaks the design rules: {w}
            </div>
          ))}
          <div className="field">
            <button className="primary" disabled={check.errors.length > 0} onClick={onSave}>
              {editingBuiltin ? 'Save changes to this card' : 'Save card'}
            </button>
            <button onClick={onCancel}>cancel</button>
          </div>
        </div>
        <div className="labside">
          <h3>Preview</h3>
          <div className="shopcard" style={{ cursor: 'default' }}>
            <CardFace card={draft} />
          </div>
          <div className="dimtext" style={{ fontSize: 11, margin: '6px 0' }}>
            active: {fxList(draft.active)}
            <br />
            echo: {fxList(draft.echo)}
          </div>
          <SimTest card={draft} packs={packs} />
        </div>
      </div>
      {picking && (
        <IconPicker
          onPick={(name) => {
            setDraft({ ...draft, icon: name });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

const EFFECT_KINDS = [
  'gainMoney',
  'gainPoints',
  'damage',
  'heal',
  'gainToken',
  'refreshShop',
  'discount',
  'trade',
  'conditional',
] as const;

function defaultEffect(kind: (typeof EFFECT_KINDS)[number]): Effect {
  switch (kind) {
    case 'gainMoney':
      return { kind: 'gainMoney', amount: 1 };
    case 'gainPoints':
      return { kind: 'gainPoints', amount: 1 };
    case 'damage':
      return { kind: 'damage', amount: 1, target: 'chooseOpponent' };
    case 'heal':
      return { kind: 'heal', amount: 1 };
    case 'gainToken':
      return { kind: 'gainToken', token: 'reroll', amount: 1 };
    case 'refreshShop':
      return { kind: 'refreshShop' };
    case 'discount':
      return { kind: 'discount', amount: 1 };
    case 'trade':
      return { kind: 'trade', pay: 2, then: [{ kind: 'gainPoints', amount: 1 }] };
    case 'conditional':
      return { kind: 'conditional', when: { sumAtLeast: 8 }, then: [{ kind: 'gainMoney', amount: 1 }] };
  }
}

function EffectListEditor(props: {
  list: Effect[];
  onChange: (list: Effect[]) => void;
  nested?: boolean;
}) {
  const { list, onChange, nested } = props;
  const kinds = nested
    ? EFFECT_KINDS.filter((k) => k !== 'conditional' && k !== 'trade')
    : EFFECT_KINDS;
  return (
    <div className={nested ? 'fxnest' : ''}>
      {list.map((e, i) => (
        <EffectRow
          key={i}
          e={e}
          nested={nested}
          onChange={(next) => onChange(list.map((old, j) => (j === i ? next : old)))}
          onRemove={() => onChange(list.filter((_, j) => j !== i))}
        />
      ))}
      <select
        value=""
        onChange={(ev) => {
          const k = ev.target.value as (typeof EFFECT_KINDS)[number];
          if (k) onChange([...list, defaultEffect(k)]);
        }}
      >
        <option value="">+ add effect</option>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}

function EffectRow(props: {
  e: Effect;
  nested?: boolean;
  onChange: (e: Effect) => void;
  onRemove: () => void;
}) {
  const { e, nested, onChange, onRemove } = props;
  const num = (value: number, set: (n: number) => void, min = 0) => (
    <input
      type="number"
      min={min}
      max={99}
      className="numin"
      value={value}
      onChange={(ev) => set(Math.max(min, Number(ev.target.value) || 0))}
    />
  );
  return (
    <div className="fxrowedit">
      <span className="fxkind">{e.kind}</span>
      {e.kind === 'gainMoney' && num(e.amount, (n) => onChange({ ...e, amount: n }))}
      {e.kind === 'gainPoints' && num(e.amount, (n) => onChange({ ...e, amount: n }))}
      {e.kind === 'heal' && num(e.amount, (n) => onChange({ ...e, amount: n }))}
      {e.kind === 'discount' && num(e.amount, (n) => onChange({ ...e, amount: n }))}
      {e.kind === 'damage' && (
        <>
          {num(e.amount, (n) => onChange({ ...e, amount: n }))}
          <select
            value={e.target}
            onChange={(ev) => onChange({ ...e, target: ev.target.value as typeof e.target })}
          >
            <option value="chooseOpponent">choose a foe</option>
            <option value="roller">the roller (yourself on your turn)</option>
          </select>
        </>
      )}
      {e.kind === 'gainToken' && (
        <>
          <select
            value={e.token}
            onChange={(ev) => onChange({ ...e, token: ev.target.value as typeof e.token })}
          >
            <option value="reroll">reroll</option>
            <option value="nudge">nudge</option>
          </select>
          {num(e.amount, (n) => onChange({ ...e, amount: n }))}
        </>
      )}
      {e.kind === 'trade' && (
        <>
          pay {num(e.pay, (n) => onChange({ ...e, pay: n }))} money, then:
          <EffectListEditor
            list={e.then}
            nested
            onChange={(then) => onChange({ ...e, then })}
          />
        </>
      )}
      {e.kind === 'conditional' && (
        <>
          <WhenEditor when={e.when} onChange={(when) => onChange({ ...e, when })} />
          then:
          <EffectListEditor list={e.then} nested onChange={(then) => onChange({ ...e, then })} />
        </>
      )}
      {!nested && <span />}
      <button className="fxdel" onClick={onRemove}>
        remove
      </button>
    </div>
  );
}

function WhenEditor({ when, onChange }: { when: ConditionalWhen; onChange: (w: ConditionalWhen) => void }) {
  const numField = (
    label: string,
    key: 'sumAtLeast' | 'hpAtOrBelow' | 'echoStackAtLeast',
  ) => (
    <label className="whenfield">
      {label}
      <input
        type="number"
        className="numin"
        min={0}
        max={30}
        value={when[key] ?? ''}
        onChange={(ev) => {
          const v = ev.target.value === '' ? undefined : Number(ev.target.value);
          onChange({ ...when, [key]: v });
        }}
      />
    </label>
  );
  const boolField = (label: string, key: 'rolledDoubles' | 'bothDiceOdd' | 'bothDiceEven') => (
    <label className="whenfield">
      {label}
      <select
        value={when[key] === undefined ? '' : String(when[key])}
        onChange={(ev) => {
          const v = ev.target.value === '' ? undefined : ev.target.value === 'true';
          onChange({ ...when, [key]: v });
        }}
      >
        <option value="">any</option>
        <option value="true">yes</option>
        <option value="false">no</option>
      </select>
    </label>
  );
  return (
    <div className="wheneditor">
      if: {numField('sum ≥', 'sumAtLeast')}
      {numField('hp ≤', 'hpAtOrBelow')}
      {numField('echoes ≥', 'echoStackAtLeast')}
      {boolField('doubles', 'rolledDoubles')}
      {boolField('both odd', 'bothDiceOdd')}
      {boolField('both even', 'bothDiceEven')}
      <label className="whenfield">
        mode
        <select
          value={when.allocatedIndividually === undefined ? '' : String(when.allocatedIndividually)}
          onChange={(ev) => {
            const v = ev.target.value === '' ? undefined : ev.target.value === 'true';
            onChange({ ...when, allocatedIndividually: v });
          }}
        >
          <option value="">any</option>
          <option value="true">split dice</option>
          <option value="false">took the sum</option>
        </select>
      </label>
    </div>
  );
}

let manifestCache: string[] | null = null;

function IconPicker({ onPick, onClose }: { onPick: (n: string) => void; onClose: () => void }) {
  const [names, setNames] = useState<string[]>(manifestCache ?? []);
  const [ready, setReady] = useState(manifestCache !== null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (manifestCache !== null) return;
    fetch('/wow-icons.json')
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
          <p className="dimtext">
            No icons found. The WoW icon folder is not on this machine (or you are not running the
            dev server).
          </p>
        )}
        <div className="icongrid">
          {matches.map((n) => (
            <img
              key={n}
              src={iconUrl(n)}
              alt={n}
              title={n}
              loading="lazy"
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

function SimTest({ card, packs }: { card: CardDef; packs: CardPack[] }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string[] | null>(null);

  const run = () => {
    setBusy(true);
    setOut(null);
    setTimeout(() => {
      try {
        const testPools = mergedPools(packs);
        if (card.color !== 'starter') {
          const bucket = testPools[card.color];
          const withoutDraft = bucket.filter((c) => c.id !== card.id);
          withoutDraft.push(structuredClone(card));
          testPools[card.color] = withoutDraft;
        }
        const lines: string[] = [];
        for (const players of [2, 4]) {
          const r = simulate({ games: players === 2 ? 500 : 300, players, seed: 7 }, testPools);
          const row = r.cards.find((c) => c.id === card.id);
          const fair = 100 / players;
          if (!row || row.bought === 0) {
            lines.push(`${players}p: the bots never bought it (offered ${row?.offered ?? 0}x)`);
          } else {
            lines.push(
              `${players}p: bought ${row.bought}x (${(100 * row.pickRate).toFixed(1)}% of ${row.offered} offers) | ` +
                `buyers won ${(100 * row.winRate).toFixed(0)}% (fair ~${fair.toFixed(0)}%)`,
            );
          }
        }
        setOut(lines);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return (
    <div className="simtest">
      <button onClick={run} disabled={busy}>
        {busy ? 'running 800 games...' : 'Test vs bots (few seconds)'}
      </button>
      {out?.map((line) => (
        <div key={line} className="dimtext" style={{ fontSize: 12 }}>
          {line}
        </div>
      ))}
      {out && (
        <div className="dimtext" style={{ fontSize: 11 }}>
          buyers winning far above fair = probably OP; never bought = probably weak
        </div>
      )}
    </div>
  );
}
