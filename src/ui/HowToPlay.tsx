// The rules, for a friend who just clicked the link. Presentation only.
// Reading-a-card is taught visually: two real card faces with the icon key
// beside them, instead of a paragraph describing chips.
import type { CardDef } from '../engine';
import { CardFace } from './CardFace';
import { IconLegend } from './icons';

/** Demo cards for the tutorial: one plain, one showing conditions + charge. */
const DEMO_PLAIN: CardDef = {
  id: 'howto-demo-1',
  name: 'Ember Fox',
  color: 'red',
  rarity: 'common',
  cost: 4,
  legalSlots: [4, 5],
  active: [
    { kind: 'damage', amount: 2, target: 'chooseOpponent' },
    { kind: 'gainMoney', amount: 1 },
  ],
  echo: [{ kind: 'damage', amount: 1, target: 'roller' }],
  flavor: 'It bites first.',
  icon: 'Ability_Mage_FireStarter.PNG',
};
const DEMO_SPICY: CardDef = {
  id: 'howto-demo-2',
  name: 'Meteor Vigil',
  color: 'red',
  rarity: 'rare',
  cost: 8,
  legalSlots: [9, 10],
  active: [
    { kind: 'conditional', when: { sumAtLeast: 9 }, then: [{ kind: 'gainPoints', amount: 2 }] },
    { kind: 'charge', need: 3, then: [{ kind: 'damage', amount: 4, target: 'chooseOpponent' }] },
  ],
  echo: [{ kind: 'gainMoney', amount: 1 }],
  icon: 'Spell_Mage_Meteor.PNG',
};

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
            that says it wins the game.
          </p>

          <h4>Your turn</h4>
          <p>
            Your board is 12 numbered slots, each holding a card. Roll two dice, then choose:
            <b> split</b> (both dice fire their slots, 1 to 6) or <b>sum</b> (one slot from 2 to
            12, rarer numbers hit harder). Fired cards pay out. Then you may buy ONE card from
            your shop or the shared Market and install it into a legal slot.
          </p>

          <h4>Echoes (the sneaky part)</h4>
          <p>
            A new card covering an old one retires it into your <b>echo stack</b>. From the grave
            it pays its echo line on OTHER players{"'"} rolls; you choose whether your echoes
            hear the two dice or the sum (slots 7 to 12 always hear the sum). Echo damage hits
            whoever rolled. Burying good echoes is a real strategy.
          </p>

          <h4>Shops and relics</h4>
          <p>
            Your shop shows your color and rotates every turn; <b>freeze</b> it to keep the row.
            The <b>Market</b> holds premium colorless artifacts for slots 7 to 12, first come
            first served. The <b>Reliquary</b> sells three rule-bending relics; a relic never
            uses up your card purchase, and you can own up to three.
          </p>

          <h4>Reading a card</h4>
          <div className="howtocards">
            <div className="howtocard">
              <CardFace card={DEMO_PLAIN} showCost />
            </div>
            <div className="howtocard">
              <CardFace card={DEMO_SPICY} showCost />
            </div>
            <div className="howtonotes">
              <p>
                Top left: the slots it can live in. Top right: cost. The effects under the name
                fire when its slot is rolled on your turn. The purple wave strip at the bottom is
                its echo, paid from the grave once the card is retired.
              </p>
              <p>
                Gold tags are conditions: <b>sum{'≥'}9</b> means only on a big roll,{' '}
                <b>pay 2</b> means coins buy the effect, and an amber <b>3{'×'}</b> charges
                up across turns, firing its payoff on the third hit.
              </p>
            </div>
          </div>
          <IconLegend />

          <h4>The five colors</h4>
          <p>
            <span className="red">Red</span> burns face damage. <span className="blue">Blue</span>{' '}
            grinds money, points, and dice tokens. <span className="black">Black</span> profits
            from its own graveyard. <span className="green">Green</span> works discounts and shop
            tricks. <span className="yellow">Yellow</span> turns coins into anything, including
            violence. Every color reaches every slot, but each is strongest at home.
          </p>

          <h4>Quick tips</h4>
          <p>
            Split beats sum most turns, but a loaded high slot changes the math. Hoarded coins
            are wasted coins: buy relics. Watch opponents{"'"} echo stacks before feeding them a
            juicy number.
          </p>
        </section>
      </div>
    </div>
  );
}
