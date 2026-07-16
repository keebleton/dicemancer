// The travel/impact fx layer: pure presentation over the table. Coins arc
// from the dice stage into the earning seat's mat, damage numbers fly in and
// slam with a shockwave ring, heals rise green, points send a star, and a
// knockout flashes the whole room red (the table shake lives in Game.tsx).
// Positions come from DOM anchors measured at spawn time: [data-fxstage] is
// the dice, [data-fxseat="N"] each seat's mat. Everything is fixed-position,
// so nothing here can ever shift the table layout.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FxEvent } from './store';

interface Burst extends FxEvent {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

/** Center of an anchor element, biased toward its head so impacts land on
 *  the name/stat strip rather than covering the whole board. */
function anchorPoint(selector: string): { x: number; y: number } | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + Math.min(r.height * 0.35, 70) };
}

export function FxLayer({ fx }: { fx: FxEvent[] }) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  // null until mount: whatever the store already holds is history, not news
  // (a fresh mount after resume/rejoin must not replay old events).
  const seen = useRef<number | null>(null);

  useEffect(() => {
    const last = fx.length > 0 ? fx[fx.length - 1]!.id : 0;
    if (seen.current === null) {
      seen.current = last;
      return;
    }
    const fresh = fx.filter((e) => e.id > seen.current!);
    if (fresh.length === 0) return;
    seen.current = last;
    const src = anchorPoint('[data-fxstage]') ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.4,
    };
    const spawned: Burst[] = [];
    for (const e of fresh) {
      const dest = anchorPoint(`[data-fxseat="${e.seat}"]`);
      if (!dest) continue;
      spawned.push({ ...e, sx: src.x, sy: src.y, tx: dest.x - src.x, ty: dest.y - src.y });
    }
    if (spawned.length === 0) return;
    setBursts((b) => [...b, ...spawned].slice(-14));
    const ids = new Set(spawned.map((s) => s.id));
    setTimeout(() => setBursts((b) => b.filter((x) => !ids.has(x.id))), 2200);
  }, [fx]);

  return (
    <div className="fxlayer" aria-hidden="true">
      {bursts.map((b) => (
        <BurstView key={b.id} b={b} />
      ))}
    </div>
  );
}

function BurstView({ b }: { b: Burst }) {
  const vars: CSSProperties = {
    left: b.sx,
    top: b.sy,
    ['--tx' as string]: `${b.tx}px`,
    ['--ty' as string]: `${b.ty}px`,
  };
  const at = (x: number, y: number): CSSProperties => ({ left: x, top: y });
  switch (b.kind) {
    case 'damage':
      return (
        <>
          <div className="fxfly fxdmg" style={vars}>
            -{b.amount}
          </div>
          <div className="fxring" style={at(b.sx + b.tx, b.sy + b.ty)} />
        </>
      );
    case 'coins':
      return (
        <>
          {Array.from({ length: Math.min(b.amount, 5) }, (_, k) => (
            <span
              key={k}
              className="fxfly fxcoin"
              style={{ ...vars, animationDelay: `${k * 0.07}s` }}
            />
          ))}
        </>
      );
    case 'points':
      return (
        <div className="fxfly fxpts" style={vars}>
          {'★'}
        </div>
      );
    case 'heal':
      return (
        <div className="fxheal" style={at(b.sx + b.tx, b.sy + b.ty)}>
          +{b.amount}
        </div>
      );
    case 'ko':
      return <div className="fxko" />;
  }
}
