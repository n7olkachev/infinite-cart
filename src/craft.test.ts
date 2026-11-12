import { describe, expect, test } from 'bun:test';
import { anyOf, comboKey, crossPairs, matches, mixes, nameInTheWay, namedIn, others, root, senseOf, spellingsOf, titleHas, union, wordsIn } from './craft';

const ids = (found: { product: { id: string } }[]) => found.map(({ product }) => product.id);

describe('words of two things', () => {
  test('a combination has one name whichever order it is made in', () => {
    expect(comboKey(['slippers', 'bacon'])).toBe(comboKey(['bacon', 'slippers']));
    expect(comboKey(['cat', 'shark', 'lamp'])).toBe('cat+lamp+shark');
    expect(comboKey(['cat', 'cat', 'lamp'])).toBe('cat+lamp');
  });

  test('together they are every word of both, once', () => {
    expect(union(['cat', 'bacon'], ['cat', 'lamp'])).toEqual(['cat', 'bacon', 'lamp']);
  });

  test('two elements fall back on one pair', () => {
    expect(crossPairs(['bacon'], ['slippers'])).toEqual([['bacon', 'slippers']]);
  });

  test('two products fall back on the pairs across them, never a pair inside one', () => {
    expect(crossPairs(['bacon', 'bandage'], ['shark', 'slippers'])).toEqual([
      ['bacon', 'shark'],
      ['bacon', 'slippers'],
      ['bandage', 'shark'],
      ['bandage', 'slippers'],
    ]);
  });

  test('a word they share is no part of a pair', () => {
    expect(crossPairs(['cat', 'bacon'], ['cat', 'lamp'])).toEqual([['bacon', 'lamp']]);
  });

  test('a thing and a part of it have nothing to fall back on', () => {
    expect(crossPairs(['cat'], ['cat', 'lamp'])).toEqual([]);
    expect(crossPairs(['cat'], ['cat'])).toEqual([]);
    expect(crossPairs(['bacon', 'slippers'], ['slippers', 'bacon'])).toEqual([]);
  });

  test('a combination has to be something of both', () => {
    const a = ['cat', 'bacon'];
    const b = ['cat', 'lamp'];
    expect(mixes(['bacon', 'lamp'], a, b)).toBe(true);
    expect(mixes(['cat', 'bacon', 'lamp'], a, b)).toBe(true);
    expect(mixes(['cat', 'lamp'], a, b)).toBe(false);
    expect(mixes(['cat', 'bacon'], a, b)).toBe(false);
    expect(mixes(['bacon'], a, b)).toBe(false);
    expect(mixes([], a, b)).toBe(false);
  });
});

describe('titles', () => {
  test('a plural and its singular share a root', () => {
    expect(root('slippers')).toBe('slipper');
    expect(root('sunglasses')).toBe('sunglass');
    expect(root('watches')).toBe('watch');
    expect(root('blueberries')).toBe('blueberry');
    expect(root('cactus')).toBe('cactus');
    expect(root('zombie')).toBe('zombie');
    expect(root('dice')).toBe('dice');
  });

  test('a word is found in either number', () => {
    expect(titleHas('Crispy Bacon Print Slippers', 'slippers')).toBe(true);
    expect(titleHas('Fluffy Kawaii Frog Slipper', 'slippers')).toBe(true);
    expect(titleHas('Shark and Whale Bandages', 'bandage')).toBe(true);
    expect(titleHas('Cat-Shaped Mug', 'cat')).toBe(true);
    expect(titleHas('Zombies Ate My Homework', 'zombie')).toBe(true);
    expect(titleHas('Mashed Potatoes Scented Candle', 'potato')).toBe(true);
    expect(titleHas('Fairies in a Jar', 'fairy')).toBe(true);
    expect(titleHas('Fairy Lights', 'fairy')).toBe(true);
  });

  test('a short word has to stand on its own', () => {
    expect(titleHas('Educational Wall Clock', 'cat')).toBe(false);
    expect(titleHas('Gold Hoop Earrings', 'ring')).toBe(false);
    expect(titleHas('Craft Beer Glass', 'bee')).toBe(false);
    expect(titleHas('Bee Rings', 'ring')).toBe(true);
  });

  test('a long word may sit inside another', () => {
    expect(titleHas('Fuego Skull Pickleball Paddle', 'pickle')).toBe(true);
    expect(titleHas('Sharkicks Basic', 'shark')).toBe(true);
  });

  test('the words a title names come back in its order', () => {
    expect(wordsIn('Shark Devouring Cat Plush Slippers', ['slippers', 'cat', 'bacon', 'shark'])).toEqual(['shark', 'cat', 'slippers']);
    expect(wordsIn('Crispy Bacon Print Slippers', ['slippers', 'bacon'])).toEqual(['bacon', 'slippers']);
    expect(wordsIn('Plain Wool Socks', ['slippers', 'bacon'])).toEqual([]);
  });
});

describe('a thing or a name', () => {
  test('small in running text, it is a thing', () => {
    expect(senseOf('ghost', 'Ghost Ankle Socks', 'These socks are so cool. They feature tiny ghosts all around the ankle.')).toBe('thing');
    expect(senseOf('ghost', 'Boo Ghost Socks', 'Ghost socks for Halloween. Embroidered ghost artwork on the cuff.')).toBe('thing');
    expect(senseOf('shirt', 'Ghost T-Shirt', 'A soft cotton t-shirt.')).toBe('thing');
  });

  test('with a capital between two small words, it is a name', () => {
    expect(senseOf('ghost', 'Ghost Opus T-shirt', 'Officially licensed Ghost merchandise for fans of the band.')).toBe('name');
    expect(senseOf('ghost', 'GHOST HAT | SLATE', 'We are throwing it back with all the classic GHOST vibes.')).toBe('name');
    expect(senseOf('shark', 'San Jose Sharks Fitted Hat', 'Cheer on the Sharks this season.')).toBe('name');
  });

  test('a trademark sign in the title makes it a name', () => {
    expect(senseOf('ghost', 'GHOST® CORE LOGO BASEBALL HAT | SLATE', '')).toBe('name');
    expect(senseOf('hat', 'GHOST® CORE LOGO BASEBALL HAT | SLATE', '')).toBe('unclear');
  });

  test('a capital at the start of a sentence, in a heading or in a compound says nothing', () => {
    expect(senseOf('ghost', 'Ghost Mug', 'Ghost design on both sides. Dishwasher safe.')).toBe('unclear');
    expect(senseOf('dinosaur', 'Dinosaur Slippers', 'Cartoon Dinosaur Slippers for Cozy Comfort')).toBe('unclear');
    expect(senseOf('shirt', 'Ghost T-Shirt', 'This T-Shirt is made of cotton.')).toBe('unclear');
    expect(senseOf('ghost', 'Ghost Mug', '')).toBe('unclear');
  });

  test('a word that is never without its capital is not a name for having one', () => {
    expect(senseOf('halloween', 'Halloween Ghost Dog Table Lamp', 'A spooky little lamp, perfect for your Halloween decor.')).toBe('unclear');
    expect(senseOf('christmas', 'Christmas Cat Mug', 'A lovely Christmas gift for cat lovers.')).toBe('unclear');
    expect(senseOf('easter', 'Easter Dinosaur Shirt', 'A soft shirt for the Easter egg hunt.')).toBe('unclear');
    expect(senseOf('valentine', 'Valentine Taco Mug', "The perfect Valentine's Day gift for a taco lover.")).toBe('unclear');
    expect(senseOf('santa', 'Santa Shark Socks', 'Cotton socks with a shark dressed as Santa on each ankle.')).toBe('unclear');
    expect(senseOf('ufo', 'UFO Lamp', 'A glowing UFO lamp for the desk.')).toBe('unclear');
  });

  test('written small it is still a thing, and with a trademark sign still a name', () => {
    expect(senseOf('halloween', 'Halloween Mug', 'A mug for halloween night.')).toBe('thing');
    expect(senseOf('halloween', 'HALLOWEEN™ Michael Myers Mug', 'Officially licensed Halloween merchandise.')).toBe('name');
  });

  test('one use as a thing outweighs any number as a name', () => {
    expect(senseOf('ghost', 'GHOST® Ghost Plush', 'The official GHOST plush. A friendly little ghost for your desk.')).toBe('thing');
  });
});

describe('picking the product', () => {
  const results = [
    { id: 'a', title: 'Embroidered Cat Slippers' },
    { id: 'b', title: 'Crispy Bacon Print Slippers' },
    { id: 'c', title: 'Bacon Cat Toy with Catnip' },
    { id: 'd', title: 'Cat Slippers with Bacon Print' },
    { id: 'e', title: 'Fuzzy Cat Slippers' },
  ];
  const baconSlippers = ['bacon', 'slippers'];
  const cat = ['cat'];

  test('the real combination wins, wherever it is in the list', () => {
    expect(matches(results, baconSlippers, cat)).toMatchObject([{ product: { id: 'd' }, words: ['cat', 'slippers', 'bacon'] }]);
  });

  test('without it, every product that is something of both, whatever of the two it is made of', () => {
    expect(matches(results.slice(0, 3), baconSlippers, cat)).toMatchObject([
      { product: { id: 'a' }, words: ['cat', 'slippers'] },
      { product: { id: 'c' }, words: ['bacon', 'cat'] },
    ]);
  });

  test('a product that is all one thing is no combination', () => {
    expect(matches([results[1]], baconSlippers, cat)).toEqual([]);
    expect(matches([{ id: 'x', title: 'Cat Tree' }], baconSlippers, cat)).toEqual([]);
  });

  test('a combination already found is passed over for the next one', () => {
    const found = new Set(['bacon+cat+slippers', 'cat+slippers']);
    expect(matches(results, baconSlippers, cat, (key) => found.has(key))).toMatchObject([{ product: { id: 'c' }, words: ['bacon', 'cat'] }]);
  });

  test('a product the player already has is not a find again under a longer name', () => {
    expect(ids(matches(results, baconSlippers, cat, undefined, new Set(['d'])))).toEqual(['a', 'c', 'e']);
    expect(ids(matches([results[0], results[4]], baconSlippers, cat, undefined, new Set(['a'])))).toEqual(['e']);
    expect(matches([results[3]], baconSlippers, cat, undefined, new Set(['d']))).toEqual([]);
  });

  test('two elements need both words in the title', () => {
    expect(ids(matches(results, ['bacon'], ['slippers']))).toEqual(['b', 'd']);
    expect(matches(results, ['coffin'], ['slippers'])).toEqual([]);
  });

  test('a word the listing uses as a name does not count', () => {
    const hats = [
      { id: 'brand', title: 'GHOST® CORE LOGO BASEBALL HAT', text: 'Cop your GHOST® hat while it lasts.' },
      { id: 'band', title: 'Ghost - Logo Snapback Hat', text: 'Recognizing another Ghost fan can start a conversation. A snapback hat.' },
      { id: 'real', title: 'Halloween Ghost Smiling Face Baseball Hat', text: 'A baseball hat with a smiling ghost printed on the front.' },
    ];
    expect(ids(matches(hats, ['ghost'], ['hat']))).toEqual(['real']);
    expect(matches(hats.slice(0, 2), ['ghost'], ['hat'])).toEqual([]);
    expect(nameInTheWay(hats.slice(0, 2), ['ghost', 'hat'])).toBe(true);
    expect(nameInTheWay(hats.slice(2), ['ghost', 'hat'])).toBe(false);
  });

  test('a holiday counts like any other word, capital and all', () => {
    const lamps = [
      { id: 'three', title: 'Ghost Dog Table Lamp', text: 'A lamp of a ghost walking his dog.' },
      { id: 'four', title: 'Halloween Ghost Dog Table Lamp', text: 'A ghost and his dog, lit up for your Halloween decor.' },
    ];
    expect(matches(lamps, ['ghost', 'dog', 'lamp'], ['halloween'])).toMatchObject([
      { product: { id: 'four' }, words: ['halloween', 'ghost', 'dog', 'lamp'], sure: true },
    ]);
    expect(nameInTheWay(lamps, ['halloween', 'lamp'])).toBe(false);
  });

  test('where a word is somebody\'s name, a listing that says what it means comes first', () => {
    const socks = [
      { id: 'brand', title: 'GHOST® CREW SOCKS' },
      { id: 'silent', title: 'Ghost Socks' },
      { id: 'spoken', title: 'Boo Ghost Socks', text: 'Cotton socks with a ghost on each ankle.' },
    ];
    expect(matches(socks, ['ghost'], ['socks'])).toMatchObject([{ product: { id: 'spoken' }, sure: true }]);
    expect(matches(socks.slice(0, 2), ['ghost'], ['socks'])).toMatchObject([{ product: { id: 'silent' }, sure: false }]);
  });

  test('where it is nobody\'s name, one that leaves it to the title is as good as one that says', () => {
    const lamps = [
      { id: 'silent', title: 'Taco Lamp' },
      { id: 'spoken', title: 'Taco Night Lamp', text: 'A lamp shaped like a taco.' },
    ];
    expect(matches(lamps, ['taco'], ['lamp'])).toMatchObject([
      { product: { id: 'silent' }, sure: true },
      { product: { id: 'spoken' }, sure: true },
    ]);
  });

  test('more words still come before being sure of fewer', () => {
    const lamps = [
      { id: 'team', title: 'San Jose Sharks Lamp', text: 'Cheer on the Sharks at home.' },
      { id: 'two', title: 'Shark Lamp', text: 'A lamp in the shape of a shark.' },
      { id: 'three', title: 'Shark Cat Night Lamp' },
    ];
    expect(matches(lamps, ['cat', 'lamp'], ['shark'])).toMatchObject([{ product: { id: 'three' }, sure: false }]);
  });

  test('unsuitable products are never picked', () => {
    expect(matches([{ id: 'x', title: 'Sexy Bacon Slippers' }], ['bacon'], ['slippers'])).toEqual([]);
  });

  test('which of them it is, is up to the number drawn', () => {
    expect(anyOf(['a', 'b', 'c'], () => 0)).toBe('a');
    expect(anyOf(['a', 'b', 'c'], () => 0.5)).toBe('b');
    expect(anyOf(['a', 'b', 'c'], () => 0.999)).toBe('c');
    expect(anyOf([])).toBeUndefined();
  });
});

describe('another product for the same words', () => {
  const lamps = [
    { id: 'a', title: 'Glowing Glass Cat Lamp' },
    { id: 'b', title: 'Cat Tree with a Scratching Post' },
    { id: 'c', title: 'Lamp with a Sleeping Cat' },
    { id: 'd', title: 'Shark Cat Night Lamp' },
  ];

  test('every product that names all of them, less the ones already shown', () => {
    expect(ids(others(lamps, ['cat', 'lamp']))).toEqual(['a', 'c', 'd']);
    expect(ids(others(lamps, ['cat', 'lamp'], new Set(['a'])))).toEqual(['c', 'd']);
    expect(others(lamps, ['cat', 'lamp'], new Set(['a', 'c', 'd']))).toEqual([]);
  });

  test('the words come back in the order its own title has them', () => {
    expect(others(lamps, ['cat', 'lamp'], new Set(['a', 'd']))).toMatchObject([{ product: { id: 'c' }, words: ['lamp', 'cat'] }]);
  });

  test('a product with fewer of the words is another combination, not another one of this', () => {
    expect(ids(others(lamps, ['shark', 'cat', 'lamp']))).toEqual(['d']);
    expect(others(lamps, ['shark', 'cat', 'lamp'], new Set(['d']))).toEqual([]);
    expect(others(lamps, ['lamp', 'cat', 'shark'], new Set(['d']))).toEqual([]);
  });

  test('a name is still not the thing, and a listing that says what it means still comes first', () => {
    const socks = [
      { id: 'brand', title: 'GHOST® CREW SOCKS' },
      { id: 'silent', title: 'Ghost Socks' },
      { id: 'spoken', title: 'Boo Ghost Socks', text: 'Cotton socks with a ghost on each ankle.' },
    ];
    expect(others(socks, ['ghost', 'socks'])).toMatchObject([{ product: { id: 'spoken' }, sure: true }]);
    expect(others(socks, ['ghost', 'socks'], new Set(['spoken']))).toMatchObject([{ product: { id: 'silent' }, sure: false }]);
    expect(others(socks, ['ghost', 'socks'], new Set(['spoken', 'silent']))).toEqual([]);
  });
});

describe('new words from a title', () => {
  const written = spellingsOf(['vampire', 'bat', 'coffin', 'lamp', 'glasses', 'cherry', 'zombie', 'ring', 'fairy']);

  test('the words of the vocabulary a title names, in its order, each once', () => {
    expect(namedIn('Dark Dawning Vampire in the Coffin Black Table Lamp with Bat Fabric Shade', written)).toEqual([
      'vampire',
      'coffin',
      'lamp',
      'bat',
    ]);
    expect(namedIn('Zombie Fairies vs. Zombies', written)).toEqual(['zombie', 'fairy']);
  });

  test('only as words of their own', () => {
    expect(namedIn('Gold Hoop Earrings for Combat Boots', written)).toEqual([]);
  });

  test('a word spelled as it is in the vocabulary wins over the plural of another', () => {
    const both = spellingsOf(['glasses', 'glass']);
    expect(namedIn('Wine Glass', both)).toEqual(['glass']);
    expect(namedIn('Reading Glasses', both)).toEqual(['glasses']);
  });
});
