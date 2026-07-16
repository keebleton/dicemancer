# Relics (design spec, 2026-07-14 - SHIPPED same day)

STATUS: implemented in src/engine/relics.ts + reducer/effects hooks; 15 hook
tests in relics.test.ts. One deviation: #11 "Third Die" would have meant
rewriting the two-dice model everywhere, so it shipped as **Destiny Stone**
(22): once per turn, reroll both dice. Same fantasy, sane engine.
Sim result: 4p hit its best balance yet (all colors 22-29 percent) and games
run ~2.5 rounds faster - the sink converts hoards into engine power.

Jake's brief: 4p games drown players in coins with nothing to spend them on.
Relics are the sink: expensive, powerful, personal augments that bend the
rules. Not board cards - they sit in a small relic row above your mat and are
always on (or one-shot). This is the spec; implementation is its own phase.

## System shape

- New shared **Reliquary**: 3 face-up relics from a shuffled relic deck,
  market-style (first come first served, refills on purchase).
- `PlayerState.relics: RelicId[]` (data-driven defs like cards). Max 3 owned.
- Buying a relic is a new `BUY_RELIC` action in the buy phase and **does not
  consume the turn's card purchase** (it competes for money, not tempo -
  that is what makes it a sink).
- Costs run 12-25: late-game money, deliberately above card prices.
- Each relic is one rule hook. The engine gets a tiny set of hook points
  (fire multiplicity, buy rules, dice rules, income taps, turn taps) that
  relic defs reference; no relic gets bespoke reducer code.

## The twenty

Economy sinks and engines:
1. **Echo Prism** (16) - pick a slot when you buy this; that slot's card
   fires TWICE when it fires. (Jake's "trigger twice" ask.)
2. **Merchant Crown** (14) - no buy limit: any number of card purchases per
   turn (each still costs money). (Jake's "buy whatever you want" ask.)
3. **Golden Scales** (12) - your coins over 15 convert to points at end of
   your turn, 3 coins per point. (The overflow valve.)
4. **Interest Ledger** (12) - gain 1 coin per 5 coins held at turn start.
   (For hoarders who want to hoard harder.)
5. **Bottomless Purse** (10) - your trades cost 1 less (min 1).
6. **Auctioneer's Gavel** (14) - your shop shows 5 cards instead of 4.
7. **Collector's Case** (15) - your buys cost 1 less, always.

Dice and fate:
8. **Loaded Die** (18) - once per turn, set one die to any face after
   rolling (a free super-nudge).
9. **Fate's Hourglass** (14) - start every turn with a reroll token.
10. **Weighted Dice** (16) - your doubles count as rolled one pip higher
    (6+6 hears 13... no: doubles fire their slot one extra time).
11. **Third Die** (25) - roll three dice, discard one before allocating.
    (The dream relic; the expensive one.)

Echo and graveyard:
12. **Resonant Bell** (15) - your echoes trigger on YOUR own rolls too.
13. **Grave Lantern** (13) - when a card of yours retires, gain 2 points.
14. **Chorus Amplifier** (16) - your echo money and points pay +1 each time
    they fire (per slot-hit, not per line).

Aggression and defense:
15. **Iron Aegis** (14) - the first damage you take each round is reduced
    by 2.
16. **Vampiric Chalice** (16) - when you deal damage, heal 1.
17. **Assassin's Mark** (15) - your damage against the point leader is +1.

Chaos and tempo:
18. **Chrono Anchor** (20) - once per game, take an extra full turn after
    this one (one-shot, then the relic is spent).
19. **Magnet Stone** (13) - when an opponent buys from the Market, you gain
    2 coins (they paid the middleman).
20. **Wildcard Sleeve** (12) - pick a slot when you buy this; that slot also
    hears the OTHER interpretation of your rolls (your 4 fires on split 4s
    and on sum 4s... i.e. the slot fires if either mode matches).

## Implementation order (next phase)

1. Engine: relic defs + PlayerState.relics + BUY_RELIC + reliquary dealing.
2. Hooks, cheapest first: buy-rule relics (2, 5, 6, 7), income taps (3, 4,
   9), then fire-multiplicity (1, 10, 12, 14, 20), dice rules (8, 11), and
   the one-shots/triggers last (13, 15, 16, 17, 18, 19).
3. Bot: value relics as amortized income; sims after each hook lands.
4. UI: relic row on the self mat + reliquary panel beside the Market; picks
   (Echo Prism, Wildcard Sleeve) reuse the buy-into-slot glow flow.
