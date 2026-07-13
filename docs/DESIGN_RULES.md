# DESIGN_RULES.md — Dicemancer card design constraints
<!-- Target location: docs/DESIGN_RULES.md -->
<!-- Compact single source of truth for design agents. Full spec: PLAN.md (do NOT read it unless told to). -->

## Pillars (violations are bugs, not style choices)
1. Slots 1–6 fire often (individual dice) → small effects. Slots 7–12 are sum-only → big effects, scaled inversely to probability (7 most common; 2 and 12 rarest).
2. Neither allocation mode (individual vs. sum) may be strictly correct.
3. Echo effects fire on EVERY opponent's turn (up to 3 at 4p). Keep them small. Each player chooses independently how their stack hears a roll (split dice or the sum), so echo value is higher than passive matching would suggest.
4. Colors own identities. Do not bleed effect styles across colors.

## Card anatomy
```ts
interface CardDef {
  id: string; name: string;
  color: 'red' | 'blue' | 'black' | 'green' | 'yellow' | 'colorless' | 'starter';
  rarity: 'common' | 'rare' | 'starter';
  cost: number;
  legalSlots: number[];        // colorless = [1..12]
  active: Effect[];            // your turn
  echo: Effect[];              // ≈ 1/3 active value, round down; min "gain 1 money" or nothing
  flavor?: string;
}
```

## Effect primitives (the ONLY building blocks — do not invent new ones silently)
gainMoney(n) · gainPoints(n) · damage(n, 'chooseOpponent' | 'roller') · heal(n) ·
gainToken('reroll' | 'nudge', n) · refreshShop ·
discount(n) — owner's next buy this turn costs n less (stacks, floors at 0, expires at turn end) ·
trade(pay, then) — if the owner can pay that much money, spend it and apply `then`; else nothing ·
conditional({ sumAtLeast? | allocatedIndividually? | hpAtOrBelow? | rolledDoubles? | bothDiceOdd? | bothDiceEven? | echoStackAtLeast? }, then: Effect[])

If a design needs a new primitive: STOP, flag it in your summary with the proposed primitive, do not ship the card.

## Cost & power
- Common: 3–5 money. Rare: 7–10 money.
- +1–2 cost per legal slot beyond the first.
- Slot 7–12 cards: ~2× power of a comparable 1–6 card.
- Baseline reference: starters give ~1 money per trigger (1–6) up to 3 money (10–11).
- Echo lines: ≈ 1/3 of active value. Echo damage always targets the roller.

## Color identities
- RED "Emberkin": legal slots from {4,5,6} and sums {9–12}. Direct damage, self-risk (pay HP for power), "sumAtLeast 10" bonuses. Echo flavor: chip damage to roller. Win lean: KO / burst points.
- BLUE "Tideweaver": legal slots from {1,2,3} and sums {2–5,7}. Reroll/nudge tokens, shop manipulation, consistency payoffs (allocatedIndividually). Echo flavor: trickle money/points. Win lean: steady points.
- BLACK "Gravebound": legal slots from {1,6} and sums {2,12} (the doubles-only sums). rolledDoubles payoffs and echoStackAtLeast (graveyard) scaling — black WANTS to retire cards. Echo flavor: points from the grave. Win lean: snowballing echo engine + doubles jackpots.
- GREEN "Wildgrove": legal slots from {1,3,5} and sums {3,5,9} (all odd). bothDiceOdd payoffs and shop economy (discount, refreshShop). Note: bothDiceOdd can only pay on green's INDIVIDUAL slots (odd sums need mixed dice) — that tension is intentional. Echo flavor: money trickle. Win lean: value engine.
- YELLOW "Gildmint": legal slots from {2,4} and sums {6,8}. Raw coin generation plus trade() conversions flipping money into points or HP. Echo flavor: money trickle. Win lean: outspend, then convert.
- COLORLESS: any slot (player picks at purchase). Money + generic utility only. No damage, no tokens.

## Output contract for content
- Cards live in src/content/cards.ts as CardDef data. Valid TypeScript. Unique ids (kebab-case name).
- Pool targets: ~15/color (≈10 common, 5 rare, ≥3 cards touching slots 7–12) + ~10 colorless.
- Placeholder numbers are fine; balance comes from the Phase 5 sim, not intuition. Flag anything you suspect is degenerate rather than pre-nerfing it.
