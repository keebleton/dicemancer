# PLAN.md Ã¢â‚¬â€ DICEMANCER (working title)

A digital dice engine-builder for 2Ã¢â‚¬â€œ4 players. Space Base's roll-and-allocate core, MTG-style color identities, Slay the Spire-scale card pools per color, and dual win conditions (points race or last player standing). MVP is a browser game: one human vs. 1Ã¢â‚¬â€œ3 heuristic bots.

**Stack:** Vite + React + TypeScript. No backend. Pure client-side.

---

## 1. Design pillars

These are load-bearing. When in doubt, resolve toward these:

1. **Every roll is a puzzle.** Allocate both dice individually (two small triggers, slots 1Ã¢â‚¬â€œ6) OR take the sum (one big trigger, slots 2Ã¢â‚¬â€œ12). Neither should be strictly correct.
2. **Slots 7Ã¢â‚¬â€œ12 are sum-only.** With 2d6, individual dice can never reach 7+. Slots 1Ã¢â‚¬â€œ6 are engine real estate (fires often, small effects); 7Ã¢â‚¬â€œ12 are premium payoff real estate (fires rarely, big effects). Card design must respect this curve.
3. **Your graveyard works for you.** Replaced cards retire to your **Echo Stack** and fire weakened "echo" effects on opponents' turns. Off-turn value starts at zero and grows as you upgrade Ã¢â‚¬â€ early game your turn is everything, late game every roll matters.
4. **Colors are identities.** Each color owns a slot pattern, an effect style, and a win-condition lean.
5. **Automation-first.** Complexity lives in the engine, never in player bookkeeping. Always show allocation previews (what fires if I put the die here).

## 2. Core rules

### Setup
- 2Ã¢â‚¬â€œ4 players, set at game creation (MVP: one human + 1Ã¢â‚¬â€œ3 bots). Each seat is assigned a color; duplicate colors are allowed at 3Ã¢â‚¬â€œ4 players. Each player starts with:
  - 12 board slots (1Ã¢â‚¬â€œ12), each pre-filled with a starter card
  - 25 HP, 5 money, 0 points, empty Echo Stack
- Every player gets their own independent shuffled copy of their color pool and the colorless pool. No cross-player card competition in MVP (shared-pool drafting tension is a v2 experiment).

### Turn structure (active player = "roller")
1. **Roll** 2d6.
2. **Manipulation window.** Roller may spend held tokens: Reroll token (reroll one die), Nudge token (Ã‚Â±1 to one die, clamped 1Ã¢â‚¬â€œ6).
3. **Allocate** Ã¢â‚¬â€ choose one mode:
   - **Mode A (individual):** assign each die to its matching slot (die showing 4 Ã¢â€ â€™ slot 4). Doubles: the same slot's card fires twice.
   - **Mode B (sum):** the sum (2Ã¢â‚¬â€œ12) activates that one slot.
4. **Resolve.** Triggered card(s) on the roller's board fire their **active** effect lines, in roller-chosen order.
5. **Echo.** Every opponent, in seat order, chooses INDEPENDENTLY how their Echo Stack hears the roll (the Space Base rule, changed 2026-07-13; previously the roller's allocation bound everyone): the two die values individually, or the one sum. Their stack's cards matching the chosen numbers fire their **echo** effect lines. The choice is skipped automatically when it cannot change what fires. HIGH ECHOES ALWAYS LISTEN (2026-07-13, the slot-band fix): echoes in slots 7-12 additionally hear the SUM of every roll regardless of the owner's choice (tunable highEchoHearsSum); the choice only governs slots 1-6. Echo effects needing a target always target the roller.
6. **Buy.** Roller may purchase up to 1 card from their shop (see Ã‚Â§5). New card installs into a legal slot; the displaced card retires to the roller's Echo Stack (keeping its slot number).
7. **Win check**, then pass turn.

### Win conditions (checked at end of every turn)
- **Points:** first player to 30+ points wins.
- **KO:** last player above 0 HP wins.
- **Failsafe:** after round 25, highest points wins (HP tiebreak).

### Elimination (3Ã¢â‚¬â€œ4 players)
A player at 0 HP is eliminated immediately: their turns are skipped, their board goes inert, their Echo Stack stops firing, and they can no longer be targeted. Play continues until one player stands or a points/failsafe win triggers.

## 3. Colors (MVP: Red + Blue)

| | RED Ã¢â‚¬â€ "Emberkin" | BLUE Ã¢â‚¬â€ "Tideweaver" |
|---|---|---|
| Slot pattern | 4Ã¢â‚¬â€œ6 individually; sums 9Ã¢â‚¬â€œ12 | 1Ã¢â‚¬â€œ3 individually; sums 2Ã¢â‚¬â€œ5, 7 |
| Effect style | Direct damage, self-risk payoffs (pay HP for power), "if sum Ã¢â€°Â¥ 10" bonuses | Reroll/Nudge token generation, shop manipulation, consistency payoffs ("if you allocated individuallyÃ¢â‚¬Â¦") |
| Win lean | KO pressure; burst points off big sums | Steady point accrual; out-value via dice control |
| Echo flavor | Chip damage to the roller | Trickle money/points |

**Colorless:** money and generic utility. Legal in **any** slot 1Ã¢â‚¬â€œ12 Ã¢â‚¬â€ the player chooses the slot at purchase; the choice is then fixed.

**v2 colors (do not build, keep enum extensible):** Black (doubles/graveyard synergy), Green (odd/even parity, card generation), White (defense, shields, point-race).

## 4. Card system

### Card anatomy (data, not code)
```ts
interface CardDef {
  id: string;
  name: string;
  color: 'red' | 'blue' | 'colorless' | 'starter';
  rarity: 'common' | 'rare' | 'starter';
  cost: number;              // money
  legalSlots: number[];      // e.g. [4,5,6]; colorless = [1..12]
  active: Effect[];          // fires on your turn when slot triggered
  echo: Effect[];            // fires from Echo Stack on opponents' turns (~1/3 power of active)
  flavor?: string;
}
```

### Effect primitives (interpreter in engine; extensible)
`gainMoney(n)` Ã‚Â· `gainPoints(n)` Ã‚Â· `damage(n, target: 'chooseOpponent' | 'roller')` Ã‚Â· `heal(n)` Ã‚Â· `gainToken('reroll' | 'nudge', n)` Ã‚Â· `refreshShop` Ã‚Â· `conditional({ sumAtLeast?, allocatedIndividually?, hpAtOrBelow? }, then: Effect[])`

### Cost/power guidelines
- Common: 3Ã¢â‚¬â€œ5 money. Rare: 7Ã¢â‚¬â€œ10 money.
- +1Ã¢â‚¬â€œ2 cost per extra legal slot beyond the first.
- Slots 7Ã¢â‚¬â€œ12: effects ~2Ãƒâ€” the power of a comparable 1Ã¢â‚¬â€œ6 card (they fire far less often; 7 is the most common sum, 2 and 12 the rarest Ã¢â‚¬â€ scale power inversely to probability).
- Echo lines Ã¢â€°Ë† 1/3 the value of active lines (round down; minimum "gain 1 money" or nothing).
- Echo lines fire on **every** opponent's turn, so realized echo value scales with player count (3 opponents Ã¢â€°Ë† 3Ãƒâ€” the triggers of 1). Keep echoes small; the Phase 5 sim must validate balance at both 2p and 4p.

### Starter cards (identical for both players in MVP; color-flavored starters are v2 polish)
| Slots | Active | Echo |
|---|---|---|
| 1Ã¢â‚¬â€œ6 | Gain 1 money | Gain 1 money |
| 7Ã¢â‚¬â€œ9 | Gain 2 money | Gain 1 money |
| 10Ã¢â‚¬â€œ11 | Gain 3 money | Gain 1 money |
| 12 | Gain 2 money + 1 point | Gain 1 money |

### Exemplar cards (placeholders Ã¢â‚¬â€ NOT balanced; tune via sim harness in Phase 5)

**Red** Ã¢â‚¬â€ Cinder Bolt (common, 4, slots [4,5]): active = 2 dmg chooseOpponent; echo = 1 dmg roller. Ã‚Â· Stoke the Forge (common, 3, slots [4,6]): active = gain 2 money; echo = gain 1 money. Ã‚Â· Blood for Power (rare, 7, slots [5,6]): active = lose 2 HP (self-damage), gain 3 points; echo = gain 1 point. Ã‚Â· Meteor Call (rare, 8, slots [10,11,12]): active = 4 dmg chooseOpponent + gain 2 points; echo = 1 dmg roller.

**Blue** Ã¢â‚¬â€ Ripple (common, 3, slots [2,3]): active = gain 2 money; echo = gain 1 money. Ã‚Â· Second Glance (common, 4, slots [1,2]): active = gain 1 money + 1 reroll token; echo = gain 1 money. Ã‚Â· Chronoloop (rare, 7, slots [1,3]): active = gain 2 points, +1 point if allocated individually this turn; echo = gain 1 point. Ã‚Â· Tide Engine (rare, 8, slots [1,2,3]): active = gain 2 money + 1 point + 1 nudge token; echo = gain 1 money.

**Colorless** Ã¢â‚¬â€ Coin Sprite (common, 3): active = gain 2 money; echo = gain 1 money. Ã‚Â· Lucky Charm (common, 5): active = gain 1 money + 1 point; echo = gain 1 money. Ã‚Â· Prism Core (rare, 8): active = gain 2 points; echo = gain 1 point.

### Content targets (Phase 5)
~15 cards per color (Ã¢â€°Ë†10 common / 5 rare, respecting each color's slot pattern and at least 3 cards per color in the 7Ã¢â‚¬â€œ12 range) + ~10 colorless. Generate following the guidelines above; flag anything that breaks a design pillar rather than silently bending it.

## 5. Shop + the Market (market split added 2026-07-13)

- Each player has their own shop row of **4 own-color cards**, dealt from their shuffled pool.
- Entire row refreshes at the start of that player's turn (aggressive rotation is intentional Ã¢â‚¬â€ forces adaptability).
- **THE MARKET**: one shared display of **4 colorless artifacts** dealt from a single shared deck. Static Ã¢â‚¬â€ it never rotates; a bought slot refills from the deck immediately. All players compete over it, first come first served. Colorless cards are premium-priced (8Ã¢â‚¬â€œ14) and stronger than color cards to match.
- **FREEZE** (whole-shop toggle, final design 2026-07-13): during your buy phase you may freeze YOUR OWN shop. While frozen it skips every refresh Ã¢â‚¬â€ you keep exactly the current row (holes from buys included) and see no new options Ã¢â‚¬â€ until you unfreeze it (also a buy-phase action). Freezing does not consume the turn's purchase. The market cannot be frozen.
- Max 1 purchase per turn across shop AND market. Money persists between turns.
- Empty color pool: reshuffle that pool's unbought discards. Empty market deck: sold-out slots stay empty.

## 6. Architecture (this is the part that matters most)

**The engine is a pure, deterministic, UI-agnostic TypeScript package.** This is non-negotiable Ã¢â‚¬â€ it's what makes the future standalone build (Electron/Tauri) and eventual server-authoritative online multiplayer possible without a rewrite, and it's what enables the bot and headless balance sims.

```
/src/engine    Ã¢â‚¬â€ pure TS. No React. No DOM. Fully serializable GameState.
                 applyAction(state, action, rng) => GameState
                 Seeded RNG injected (e.g. mulberry32) Ã¢â‚¬â€ deterministic replays.
/src/content   Ã¢â‚¬â€ card definitions as data (cards.ts, starters.ts).
/src/bot       Ã¢â‚¬â€ heuristic AI. Consumes the same action API as the UI.
/src/ui        Ã¢â‚¬â€ Vite + React. Zustand store wrapping the engine. Thin renderer.
/src/sim       Ã¢â‚¬â€ headless bot-vs-bot harness (Phase 5).
```

**Action types (engine API):** `ROLL` Ã‚Â· `SPEND_TOKEN{kind, dieIndex}` Ã‚Â· `ALLOCATE{mode: 'individual' | 'sum'}` Ã‚Â· `RESOLVE_ORDER{cardOrder?}` Ã‚Â· `CHOOSE_TARGET{playerId}` Ã‚Â· `BUY{shopIndex, targetSlot}` Ã‚Â· `SKIP_BUY` Ã‚Â· `END_TURN`

Engine exposes `legalActions(state)` Ã¢â‚¬â€ the UI and bot both consume it. Engine is N-player generic; UI and setup screen expose 2Ã¢â‚¬â€œ4 seats, any mix of human/bot (MVP: exactly 1 human).

**Bot heuristic (keep dumb, keep replaceable):** enumerate legal allocations Ã¢â€ â€™ score by immediate expected value (money = 1, point = 2, damage weighted up when any opponent Ã¢â€°Â¤ 8 HP); buy the affordable card with best value-per-cost, preferring own color; always targets the point/HP leader.

**UI components:** PlayerBoard (12 slots + allocation preview highlighting), DiceTray (roll, token buttons, mode toggle), ShopRow, EchoStack panel (both players'), ResourceBar (HP/money/points/tokens), OpponentBoards (compact, up to 3, with turn-order indicator), GameLog. MVP UI is functional/utilitarian Ã¢â‚¬â€ a proper visual design pass is a later phase, don't spend time on aesthetics now.

## 7. Build phases (each phase ends green: `npm test` passes, app runs)

**P0 Ã¢â‚¬â€ Scaffold.** Vite + React + TS + Vitest + Zustand. Folder structure above. Acceptance: dev server runs, one passing dummy test.

**P1 Ã¢â‚¬â€ Engine core.** GameState, action reducer, seeded RNG, dice roll, allocation legality (incl. doubles = double-fire), starter boards, resource tracking, win checks. Acceptance: unit tests cover allocation math (both modes), doubles, win/failsafe conditions, 4-player turn rotation, and elimination (skipped turns, inert echoes, untargetable); full games playable via test script at 2p and 4p with starter cards only.

**P2 Ã¢â‚¬â€ Cards, effects, shop, echo.** Effect interpreter for all primitives, card install/retire flow, Echo Stack triggering (all matching retired cards fire), shop deal/refresh/purchase, tokens + manipulation window. Acceptance: tests for every primitive, echo targeting (targets roller), conditional effects, colorless slot choice, pool reshuffle.

**P3 Ã¢â‚¬â€ Playable UI.** Hotseat: human controls both sides through full turns. Allocation preview (hover/tap a mode shows what fires). Acceptance: complete game playable start-to-win in browser; no engine state mutated outside `applyAction`.

**P4 Ã¢â‚¬â€ Bot.** Heuristic bots fill all non-human seats. Acceptance: 2p and 4p games (human + bots) complete without illegal actions across 20 seeded runs each.

**P5 Ã¢â‚¬â€ Content + balance harness.** Fill card pools to targets (Ã‚Â§4), build `/src/sim` (bot-vs-bot, N games, report: winrate by color **and by seat position** Ã¢â‚¬â€ measure first-player advantage Ã¢â‚¬â€ avg game length, KO-vs-points-vs-failsafe ratio, per-card pick/win rates). Acceptance: 1,000-game sims run headless at both 2p and 4p; results printed as tables. First tuning pass on the tunables below based on sim output.

## 8. Tunables (single config file; defaults below)

| Param | Default | | Param | Default |
|---|---|---|---|---|
| Starting HP | 25 | | Shop size | 5 (3 color + 2 colorless) |
| Points to win | 30 | | Buys per turn | 1 |
| Starting money | 2 (was 5; 2026-07-13, colorless came online too fast) | | Shop refresh | full, each turn |
| Round cap | 25 | | Doubles double-fire | yes |
| Echo power ratio | ~1/3 | | Colorless slot locked at install | yes |
| Player count | 2Ã¢â‚¬â€œ4 (default 2) | | Elimination at 0 HP | yes |

Pacing params (HP, points-to-win, round cap) may need per-player-count scaling Ã¢â‚¬â€ with 3 opponents feeding your Echo Stack, resource curves steepen. Decide from Phase 5 sim data, not intuition.

## 9. Out of scope (v2+ backlog Ã¢â‚¬â€ do not build, do not block)

Black/Green/White colors Ã‚Â· AOE damage Ã‚Â· defense/shield mechanics Ã‚Â· 5Ã¢â‚¬â€œ6 players Ã‚Â· pre-game drafting/deckbuilding Ã‚Â· online multiplayer (engine purity is the prep for it) Ã‚Â· color-flavored starters Ã‚Â· third rarity tier Ã‚Â· art, sound, animation polish Ã‚Â· accounts/persistence.
