// The rules, for a friend who just clicked the link. Presentation only.
export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="inspect-overlay" onClick={onClose}>
      <div className="inspect howto" onClick={(e) => e.stopPropagation()}>
        <section className="panel">
          <div className="howtohead">
            <h3>How to play Dicemancer</h3>
            <button onClick={onClose}>close</button>
          </div>

          <h4>The goal</h4>
          <p>
            First to <b>30 points</b> wins. Or knock everyone else to 0 HP. Or charge up a card
            that says it wins the game. Games have no turn limit.
          </p>

          <h4>Your turn</h4>
          <p>
            You have a board of 12 numbered slots, each holding a card. Roll two dice, then choose:
            <b> split</b> them (two slots from 1 to 6 fire, small and steady) or take the
            <b> sum</b> (one slot from 2 to 12 fires, rarer numbers hit harder). Fired cards pay
            their <b>roll</b> line: coins, points, damage, tokens, trades. Then you may buy ONE
            card from your shop or the shared Market and install it into a legal slot.
          </p>

          <h4>Echoes (the sneaky part)</h4>
          <p>
            When a new card covers an old one, the old card retires into your <b>echo stack</b>,
            remembering its slot. From then on it pays its <b>echo</b> line on OTHER players
            {"'"} rolls: when someone rolls, you choose how YOUR echoes hear it, the two dice or
            the sum. Echoes in slots 7 to 12 always hear the sum, no choice needed. Echo damage
            always hits whoever rolled. Burying good echoes is a real strategy.
          </p>

          <h4>Shops, the Market, relics</h4>
          <p>
            Your personal shop shows cards of your color and rotates every turn; <b>freeze</b> it
            to keep the current row. The shared <b>Market</b> holds premium colorless artifacts,
            first come first served, slots 7 to 12 only. Below it sits the <b>Reliquary</b>:
            three expensive relics that bend the rules permanently (fire a slot twice, buy
            without limit, reroll dice at will...). Buying a relic does NOT use up your card
            purchase, and you can own three.
          </p>

          <h4>Reading a card</h4>
          <p>
            Top left: which slots it can live in. Top right: cost. <b>Roll</b> row: what it pays
            when its slot fires on your turn. <b>Echo</b> row: what it pays from the grave.
            Amber pips on a card are <b>charges</b> building toward a payoff. Dashed boxes are
            conditions (if the sum is 8+, if you rolled doubles...). A gold trade chip means pay
            coins to get the effect.
          </p>

          <h4>The five colors</h4>
          <p>
            <span className="red">Red</span> burns face damage. <span className="blue">Blue</span>{' '}
            grinds steady money, points, and dice tokens. <span className="black">Black</span>{' '}
            profits from its own graveyard. <span className="green">Green</span> works discounts
            and shop tricks. <span className="yellow">Yellow</span> turns coins into anything,
            including violence. Every color reaches every slot, but each is strongest at home.
          </p>

          <h4>Quick tips</h4>
          <p>
            Split beats sum most turns, but a loaded high slot changes the math. Coins hoarded
            are coins wasted: spend on relics. Watch opponents{"'"} echo stacks before feeding
            them a juicy number. And if someone is charging a Doomsday Device, stop them.
          </p>
        </section>
      </div>
    </div>
  );
}
