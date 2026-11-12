// The rules of the game, with nothing in them that touches the network or the page.
//
// Every thing on the table is made of words: an element is one word, a product is the words it was found with.
// Putting two things together looks first for the real combination, one product that is everything both are made
// of. When there is none, the two fall back on their base words, one word of each.
//
// What a search can find, measured against the catalog (Nov 2026), fifty results a search:
//   two words          39 of 40 random pairs had a product with both in its title (36 in the first ten results)
//   three words        6 of 16 products-plus-a-word, 3 of 12 random triples; when there is one it is in the top three
//   four words         0 of 8 pairs of products, but 4 of the 8 searches turned up a product with three of the four
// The first result alone had both words of a pair 26 times out of 40, which is why the titles are checked.

export type Words = readonly string[];
export type Pair = [string, string];

/** One name for a set of words, whichever order they came in. */
export function comboKey(words: Words): string {
  return [...new Set(words)].sort().join('+');
}

/** Everything two things are made of between them, the first thing's words first. */
export function union(a: Words, b: Words): string[] {
  return [...new Set([...a, ...b])];
}

/**
 * Whether a set of words is something of both things: it has a word the first lacks and a word the second lacks.
 * "cat lamp" and "cat" make nothing, there is nothing in the cat that the lamp has not got.
 */
export function mixes(words: Words, a: Words, b: Words): boolean {
  return words.some((word) => !a.includes(word)) && words.some((word) => !b.includes(word));
}

/** The pairs two things can fall back on: a word only the first has, with a word only the second has. */
export function crossPairs(a: Words, b: Words): Pair[] {
  const pairs: Pair[] = [];
  for (const first of new Set(a)) {
    if (b.includes(first)) continue;
    for (const second of new Set(b)) if (!a.includes(second)) pairs.push([first, second]);
  }
  return pairs;
}

// ---- reading titles

/** The singular of a word, near enough: "slippers" is "slipper", "sunglasses" "sunglass", "blueberries" "blueberry". */
export function root(word: string): string {
  const lower = word.toLowerCase();
  if (/(ss|x|ch|sh|z)es$/.test(lower)) return lower.slice(0, -2);
  if (/[^aeiou]ies$/.test(lower)) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith('s') && !/(ss|us|is)$/.test(lower)) return lower.slice(0, -1);
  return lower;
}

/** The ways a title may write a word: its singular and its plurals. */
function spellings(word: string): string[] {
  const singular = root(word);
  const all = [singular, `${singular}s`, `${singular}es`];
  if (/[^aeiou]y$/.test(singular)) all.push(`${singular.slice(0, -1)}ies`);
  return all;
}

/** A short word has to be a word of the title, or "cat" is in "education" and "ring" in "earrings". */
const LOOSE_FROM = 5;

function tokens(title: string): string[] {
  return title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Where in the title the word is, counted in words, or -1. */
function positionIn(titleTokens: string[], word: string): number {
  const written = spellings(word);
  const singular = written[0];
  return titleTokens.findIndex(
    (token) => written.includes(token) || (singular.length >= LOOSE_FROM && token.includes(singular)),
  );
}

/**
 * Whether the title names the word: as a word of its own, singular or plural, or, for a word of five letters or
 * more, inside a longer one ("pickle" in "Pickleball", "shark" in "Sharkicks").
 */
export function titleHas(title: string, word: string): boolean {
  return positionIn(tokens(title), word) >= 0;
}

/** Which of these words the title names, in the order it names them: "Bacon Print Slippers". */
export function wordsIn(title: string, words: Words): string[] {
  const titleTokens = tokens(title);
  return [...new Set(words)]
    .map((word) => ({ word, at: positionIn(titleTokens, word) }))
    .filter(({ at }) => at >= 0)
    .sort((x, y) => x.at - y.at)
    .map(({ word }) => word);
}

/** For a vocabulary, every way a title may write one of its words. A word spelled out as it is wins over a plural. */
export function spellingsOf(vocabulary: Iterable<string>): Map<string, string> {
  const written = new Map<string, string>();
  const all = [...vocabulary];
  for (const word of all) written.set(word, word);
  for (const word of all) for (const spelling of spellings(word)) if (!written.has(spelling)) written.set(spelling, word);
  return written;
}

/** The words of a vocabulary that a title names as words of their own, in its order, each once. */
export function namedIn(title: string, written: ReadonlyMap<string, string>): string[] {
  const named = new Set<string>();
  for (const token of tokens(title)) {
    const word = written.get(token);
    if (word) named.add(word);
  }
  return [...named];
}

// ---- telling a thing from a name

export type Sense = 'thing' | 'name' | 'unclear';

const ENDS_SENTENCE = /[.!?:;•|\n]/;
const isSmall = (token: string) => token === token.toLowerCase();

/**
 * Words English writes with a capital whatever they mean: "perfect for your Halloween decor" is about the day, not
 * about somebody called Halloween. Read like any other word, over the 3,184 listings of one played game (Nov 2026),
 * Halloween was a name in 45 of the 75 titles that had it and Christmas in 74 of 159, where ghost was in 9 of 164.
 */
const ALWAYS_CAPITAL = new Set(['christmas', 'easter', 'halloween', 'santa', 'ufo', 'valentine']);

/**
 * How a listing uses a word. Running text writes a thing small ("tiny ghosts all around the ankle") and a name
 * with a capital ("officially licensed Ghost merchandise", "all the classic GHOST® vibes"), so:
 *
 *   thing    the text has the word in lower case somewhere
 *   name     the text never does, and has it with a capital in the middle of a sentence between two words in
 *            lower case, or the title puts ® or ™ on it
 *   unclear  the text does not say
 *
 * A capital at the start of a sentence says nothing, and neither does one next to other capitals, which is a
 * heading or a product's own title ("Cartoon Dinosaur Slippers for Cozy Comfort"). Nor does one on a word that is
 * never without it (`ALWAYS_CAPITAL`): that word is a name only by a ® or ™.
 *
 * Measured on the results for 33 pairs of starting words (Nov 2026): of 1,044 titles naming both words, 64% used
 * both as things, 29% left one unclear and 7% used one as a name. For ghost + hat it was 1, 8 and 18: the GHOST
 * clothing brand and the band Ghost.
 */
export function senseOf(word: string, title: string, text: string): Sense {
  const written = spellings(word);
  const alwaysCapital = written.some((spelling) => ALWAYS_CAPITAL.has(spelling));
  const found = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
  /** What stands between a word of the text and the one before it. */
  const before = (index: number) =>
    text.slice(index ? found[index - 1].index + found[index - 1][0].length : 0, found[index].index);

  let named = false;
  for (const [index, match] of found.entries()) {
    const token = match[0];
    if (!written.includes(token.toLowerCase())) continue;
    if (isSmall(token)) return 'thing';
    if (alwaysCapital) continue;
    const gap = before(index);
    const gapAfter = index + 1 < found.length ? before(index + 1) : '.';
    // "T-Shirt" is how the word is written, not a sign that Shirt is somebody's name.
    if (index === 0 || ENDS_SENTENCE.test(gap) || gap.endsWith('-') || gapAfter.startsWith('-')) continue;
    const smallAfter = ENDS_SENTENCE.test(gapAfter) || isSmall(found[index + 1][0]);
    if (isSmall(found[index - 1][0]) && smallAfter) named = true;
  }
  if (named) return 'name';
  const trademarked = new RegExp(`(^|[^\\p{L}\\p{N}])(${written.join('|')})\\s*[®™]`, 'iu').test(title);
  return trademarked ? 'name' : 'unclear';
}

// ---- picking the product

// The catalog is everything anybody sells. A game built on cats and tacos has no use for these.
const UNSUITABLE =
  /\b(sexy?|erotic|lingerie|vibrators?|dildos?|fetish|bdsm|nude|naked|porn|xxx|thongs?|kinky?|condoms?|penis|vagina|boobs?|nipples?|bondage)\b/i;

/** What picking needs of a product: who it is, its title, and what its listing says about it, if that is known. */
export interface Listed {
  id: string;
  title: string;
  text?: string;
}

export interface Match<T> {
  product: T;
  /** The words of the two things that its title names as things, in the title's order. */
  words: string[];
  /**
   * False when one of the words is somebody's name elsewhere in the same results and this listing does not say
   * which it means: a "Ghost Hat" with no description, among the hats of the GHOST brand.
   */
  sure: boolean;
}

/**
 * The most that a list of products makes of two things: the products whose titles name the most of their words,
 * as long as those words are something of both. They come back in the catalog's order, each as good a find as the
 * next: which one it is to be is left to chance (`anyOf`), so that the same move turns up something else in
 * another game.
 *
 * A word the listing uses as a name does not count: a GHOST® baseball hat is a hat, not a ghost hat. And once
 * any listing in the results uses a word as a name, the ones that leave its meaning to the title wait behind the
 * ones that spell it out.
 *
 * A combination already found (`taken`) is passed over, so that the same two things give something else the
 * next time, and so is a product the player already has (`owned`): the plush that was "bacon shark" is not a find
 * again as "bacon whale shark" just because its title says whale too.
 */
export function matches<T extends Listed>(
  products: readonly T[],
  a: Words,
  b: Words,
  taken: (key: string) => boolean = () => false,
  owned: ReadonlySet<string> = new Set(),
): Match<T>[] {
  const all = union(a, b);
  const read = products.map((product) => ({
    product,
    uses: wordsIn(product.title, all).map((word) => ({ word, sense: senseOf(word, product.title, product.text ?? '') })),
  }));
  /** The words that are somebody's name somewhere in these results. */
  const contested = new Set(read.flatMap(({ uses }) => uses.filter(({ sense }) => sense === 'name').map(({ word }) => word)));

  let best: Match<T>[] = [];
  for (const { product, uses } of read) {
    if (owned.has(product.id) || UNSUITABLE.test(product.title)) continue;
    const words = uses.filter(({ sense }) => sense !== 'name').map(({ word }) => word);
    if (!mixes(words, a, b) || taken(comboKey(words))) continue;
    const sure = uses.every(({ word, sense }) => sense !== 'unclear' || !contested.has(word));
    const [top] = best;
    if (!top || words.length > top.words.length || (words.length === top.words.length && sure && !top.sure)) {
      best = [{ product, words, sure }];
    } else if (words.length === top.words.length && sure === top.sure) {
      best.push({ product, words, sure });
    }
  }
  return best;
}

/**
 * The products that could stand for a combination in place of the one that does: the ones whose titles name
 * every one of its words as a thing. `shown` are the products not to bring up: the one the words have now, the
 * ones they had before it, and what else the player has.
 */
export function others<T extends Listed>(
  products: readonly T[],
  words: Words,
  shown: ReadonlySet<string> = new Set(),
): Match<T>[] {
  const all = [...new Set(words)];
  // Wherever the words are cut in two, a title with all of them is something of both halves, and none has more.
  const whole = matches(products, all.slice(0, 1), all.slice(1), undefined, shown);
  return whole.filter((match) => match.words.length === all.length);
}

/** One of a list, whichever chance has it. */
export function anyOf<T>(list: readonly T[], chance: () => number = Math.random): T | undefined {
  return list[Math.floor(chance() * list.length)];
}

/** Whether some product's title names all of these words while its listing uses one of them as a name. */
export function nameInTheWay(products: readonly Listed[], words: Words): boolean {
  const wanted = new Set(words).size;
  return products.some((product) => {
    const named = wordsIn(product.title, words);
    return named.length === wanted && named.some((word) => senseOf(word, product.title, product.text ?? '') === 'name');
  });
}
