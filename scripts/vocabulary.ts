// Writes src/vocabulary.ts: every word the game can hand out, with the emoji that stands for it.
//
//     bun run vocabulary
//
// The words are the one-word names Unicode gives its emoji ("vampire", "whale", "teapot"), from the groups that
// are things, plus the list below for words a shopper uses that Unicode names otherwise ("lamp" is "light bulb").
import { writeFileSync } from 'node:fs';
import emoji from 'unicode-emoji-json/data-by-emoji.json';

const GROUPS = new Set(['Animals & Nature', 'Food & Drink', 'Travel & Places', 'Activities', 'Objects']);

// One-word names that make poor things to combine: places and vehicles nobody puts on a mug, names that are not
// the everyday word, office supplies, words a title uses for something else ("ready to ship", "short sleeve",
// "house slippers"), and what a game of cats and tacos is better off without.
const SKIP = new Set(
  (
    'ox boar ram ewe bug ant rat fly seal microbe cockroach mosquito rosette blossom hyacinth seedling herb sauropod blowfish dodo orca wing ' +
    'tangerine cucumber eggplant cooking oden dango mate amphora sake fondue shortcake custard flatbread tamale falafel beans cherries ' +
    'landslide stadium desert hut house houses hospital bank hotel school factory church mosque synagogue kaaba wedding foggy cityscape ' +
    'sunrise sunset locomotive metro station tram monorail trolleybus minibus ambulance automobile motorway construction seat cyclone fog ' +
    'droplet ship sailboat ferry bicycle airplane gear ' +
    'sparkler firecracker softball lacrosse badminton bullseye joker knot ticket ' +
    'briefs bikini shorts coat necktie handbag purse loudspeaker megaphone pager trackball dvd abacus videocassette ledger memo label ' +
    'receipt postbox pushpin paperclip clipboard wastebasket locked unlocked link clamp alembic dna syringe pill crutch stethoscope ' +
    'elevator cigarette hamsa moai placard dagger bomb pick package headphone doughnut hamburger honeybee books chains ' +
    // a title says "glass" far more often than it means a pair of glasses
    'glasses'
  ).split(' '),
);

// Added by hand: the everyday word for an emoji Unicode names in two words or in another one, and the picks from
// the groups of faces and people. These win over the generated entries. A word English always writes with a
// capital (Christmas, Santa, UFO) goes in ALWAYS_CAPITAL in src/craft.ts as well, or its listings read as a brand's.
const EXTRA: Record<string, string> = {
  // on the shelf at the start (src/words.ts), with taco and socks, which Unicode names in one word itself
  cat: '🐱', shark: '🦈', bacon: '🥓', ghost: '👻', dinosaur: '🦖',
  shirt: '👕', mug: '☕', hat: '🎩', slippers: '🥿', lamp: '💡',
  // animals
  dog: '🐶', pig: '🐷', cow: '🐮', mouse: '🐭', rabbit: '🐰', tiger: '🐯', horse: '🐴', monkey: '🐵', chicken: '🐔',
  bee: '🐝', sheep: '🐑', paw: '🐾', ladybug: '🐞', caterpillar: '🐛', dragon: '🐲',
  // food
  pickle: '🥒', donut: '🍩', burger: '🍔', cheese: '🧀', pumpkin: '🎃', apple: '🍎', cherry: '🍒', pepper: '🌶️', corn: '🌽',
  cake: '🍰', chocolate: '🍫', honey: '🍯', tea: '🍵', wine: '🍷', beer: '🍺', cocktail: '🍸', ramen: '🍜', rice: '🍚',
  // creatures and characters
  skull: '💀', alien: '👽', robot: '🤖', ogre: '👹', goblin: '👺', clown: '🤡', devil: '😈', angel: '👼', skeleton: '☠️',
  vampire: '🧛', zombie: '🧟', fairy: '🧚', mermaid: '🧜‍♀️', elf: '🧝', genie: '🧞', troll: '🧌', wizard: '🧙', witch: '🧙‍♀️',
  ninja: '🥷', astronaut: '🧑‍🚀', detective: '🕵️', pirate: '🏴‍☠️', princess: '👸', superhero: '🦸', santa: '🎅', baby: '👶', cowboy: '🤠',
  // things to wear and carry
  cap: '🧢', boots: '🥾', sneakers: '👟', sandals: '🩴', hoodie: '🧥', necklace: '📿',
  helmet: '⛑️', mask: '🎭', bag: '👜', wallet: '👛', apron: '🧑‍🍳', headphones: '🎧',
  // things around the house
  clock: '⏰', planter: '🪴', bandage: '🩹', puzzle: '🧩', bowl: '🥣', dice: '🎲', lantern: '🏮', doll: '🪆', plush: '🧸',
  pillow: '💤', blanket: '🛌', vase: '🏺', plate: '🍽️', fork: '🍴', bottle: '🍾', cup: '🥤', phone: '📱', computer: '🖥️', poster: '🖼️',
  book: '📖', sword: '⚔️', wand: '🪄', crystal: '🔮', diamond: '💎',
  // things a shop prints a picture on or casts a figure in, which have no emoji of their own
  sticker: '🏷️', pin: '📌', keychain: '🗝️', statue: '🗿',
  // the sky, the garden, the road
  moon: '🌙', lightning: '⚡', wave: '🌊', flower: '🌸', tree: '🌳', leaf: '🍃', planet: '🪐', ufo: '🛸', car: '🚗', truck: '🚚',
  boat: '⛵', bike: '🚲', train: '🚂', plane: '✈️',
  // pastimes
  football: '🏈', soccer: '⚽', golf: '⛳', fishing: '🎣', boxing: '🥊', chess: '♟️', piano: '🎹', camping: '🏕️',
  // the calendar
  christmas: '🎄', halloween: '🕸️', birthday: '🎂', easter: '🐣', valentine: '💘', heart: '❤️', disco: '🪩',
};

const byName = new Map<string, string>();
for (const [character, { name }] of Object.entries(emoji)) byName.set(name.toLowerCase(), character);

const words = new Map<string, string>();
for (const [character, { name, group }] of Object.entries(emoji)) {
  const word = name.toLowerCase();
  if (!GROUPS.has(group) || !/^[a-z]+$/.test(word) || SKIP.has(word)) continue;
  // A face reads better at the size of a sticker than the whole animal does.
  words.set(word, byName.get(`${word} face`) ?? character);
}
for (const [word, character] of Object.entries(EXTRA)) words.set(word, character);

const lines = [...words].sort(([a], [b]) => a.localeCompare(b)).map(([word, character]) => `  ${word}: '${character}',`);
writeFileSync(
  new URL('../src/vocabulary.ts', import.meta.url),
  `// Generated by scripts/vocabulary.ts from Unicode's emoji names. Change the script, not this file.\n\n` +
    `/** Every word the game can hand out, and the emoji that stands for it. */\n` +
    `export const VOCABULARY: Readonly<Record<string, string>> = {\n${lines.join('\n')}\n};\n`,
);
console.log(`${words.size} words`);
