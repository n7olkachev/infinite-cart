// What the player has found, kept in this browser, and the one move of the game: putting two things together.
// A product found that way can be traded in for another one of the same words.
import { computed, signal } from '@preact/signals';
import { CatalogError, lookup, search, type Product } from './catalog';
import { anyOf, comboKey, crossPairs, matches, mixes, nameInTheWay, others, senseOf, union, type Match, type Pair, type Words } from './craft';
import { STARTERS, elementOf, wordsNamedIn, type Element } from './words';

/** A set of words and the product the catalog had for it. */
export interface Discovery {
  /** `comboKey` of the words. */
  key: string;
  /** The words, two or more, in the order the product's title says them. */
  words: string[];
  /** Absent once the catalog stops listing the product: the combination can then be made again. */
  product?: Product;
  /** When `product` was last read from the catalog. */
  fetchedAt: number;
}

export type Outcome =
  /** Something the player had not made. `unlocked` are the new words its title put on the shelf. */
  | { kind: 'new'; discovery: Discovery; unlocked: Element[] }
  /** Nothing new left to find between these two, so the player gets back the most they already made of them. */
  | { kind: 'known'; discovery: Discovery }
  /** No product has it. `pair` is set when there was only one pair of words to try. */
  | { kind: 'nothing'; pair?: Pair }
  | { kind: 'error'; message: string };

export type Swap =
  /** The same words, another product. `again` when the words had been through every one they have and start over. */
  | { kind: 'swapped'; discovery: Discovery; again: boolean }
  /** No other product names all of the words. */
  | { kind: 'nothing' }
  | { kind: 'error'; message: string };

const STORE = 'infinite-cart.v1';
/** How many of the catalog's results are read for a title with the words. One request returns up to fifty. */
const RESULTS = 50;
/** The longest search for everything two things are made of. Nothing out there has six of these words in its title. */
const UNION_MAX = 5;
/** How many pairs of base words one move may search for before it gives up. The next move goes on with the rest. */
const PAIR_TRIES = 4;
/** How many new words one product may put on the shelf. */
const UNLOCK_MAX = 3;
/**
 * Added to a search for a pair when a brand, a band or a team of the same name crowds the results. Nov 2026:
 * of the titles naming both words, "ghost shirt" had 0 of 22 about a ghost and "ghost shirt funny" 27 of 41.
 */
const AROUND_NAMES = 'funny';
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
// How long the catalog's terms let a copy be kept: https://shopify.dev/docs/agents/catalog#usage-guidelines
const DETAILS_FRESH = DAY;
export const PRICE_FRESH = 10 * MINUTE;
/** A combination nobody sold yesterday is worth asking about again today. */
const MISS_FRESH = DAY;

interface Saved {
  discoveries: Discovery[];
  misses: Record<string, number>;
  /** The words on the shelf, in the order they got there. Absent in what the first version of the game saved. */
  unlocked?: string[];
}

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Saved> | null;
    if (Array.isArray(saved?.discoveries)) {
      return { discoveries: saved.discoveries, misses: saved.misses ?? {}, unlocked: saved.unlocked };
    }
  } catch {
    // Private mode or a damaged entry: start with nothing.
  }
  return { discoveries: [], misses: {} };
}

const saved = load();
/** Searches that did not have the whole of what was asked for, and when that was found out. */
const misses = new Map(Object.entries(saved.misses));

/** Everything found so far, oldest first. */
export const discoveries = signal<Discovery[]>(saved.discoveries);
export const byKey = computed(() => new Map(discoveries.value.map((discovery) => [discovery.key, discovery])));

/**
 * The words on the shelf: the starting ones, then the ones the player's finds put there. A game saved before words
 * were kept gets them back from what it found, and one saved with fewer starting words gets the rest.
 */
const unlocked = signal<string[]>([
  ...new Set([
    ...STARTERS,
    ...(saved.unlocked ??
      saved.discoveries.flatMap((discovery) => [...discovery.words, ...wordsNamedIn(discovery.product?.title ?? '')])),
  ]),
]);
export const elements = computed(() => unlocked.value.map(elementOf));

function save(): void {
  try {
    const data: Saved = { discoveries: discoveries.value, misses: Object.fromEntries(misses), unlocked: unlocked.value };
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch {
    // Private mode or a full quota: the game goes on, it just will not be there next time.
  }
}

const hasProduct = (key: string) => !!byKey.value.get(key)?.product;
/** The products the player has. */
const owned = () => new Set(discoveries.value.flatMap((discovery) => (discovery.product ? [discovery.product.id] : [])));

// ---- asking the catalog

/** A product as a search returned it, with what its listing says, for as long as the results are held. */
type Candidate = Product & { text: string };

interface Heard {
  at: number;
  products: Candidate[];
}

/** What the catalog said to a search, kept in memory for as long as a price may be shown, and searches on their way. */
const heard = new Map<string, Heard | Promise<Heard>>();

/** What is in memory for a search, if it is still good to use. */
async function recall(key: string): Promise<Heard | undefined> {
  const kept = await heard.get(key);
  return kept && Date.now() - kept.at <= PRICE_FRESH ? kept : undefined;
}

async function resultsFor(key: string, query: string): Promise<Heard> {
  const kept = await recall(key);
  if (kept) return kept;
  const asking = search(query, RESULTS).then((listings) => ({
    at: Date.now(),
    products: listings.map(({ product, text }) => ({ ...product, text })),
  }));
  heard.set(key, asking);
  try {
    const answer = await asking;
    // What has got too old to use is not held on to.
    for (const [other, old] of heard) if (!(old instanceof Promise) && answer.at - old.at > PRICE_FRESH) heard.delete(other);
    heard.set(key, answer);
    return answer;
  } catch (error) {
    heard.delete(key);
    throw error;
  }
}

interface Found {
  discovery: Discovery;
  unlocked: Element[];
}

/** The product drawn from a search, and when the search was answered. */
interface Drawn {
  match: Match<Candidate>;
  at: number;
}

/**
 * Searches for these words and draws one of the products that `among` reads out of the results, all as good as
 * each other. It is the draw that makes one game unlike the next: the catalog answers everybody the same.
 */
async function ask(words: Words, among: (products: Candidate[]) => Match<Candidate>[]): Promise<Drawn | null> {
  const key = comboKey(words);
  // The words go to the catalog in one fixed order: cat on lamp and lamp on cat are the same search.
  const query = key.split('+').join(' ');
  const first = await resultsFor(key, query);
  let at = first.at;
  let match = anyOf(among(first.products));

  // A pair whose results are crowded out by something of the same name is asked for once more, in a way that
  // a brand does not answer to.
  if (words.length === 2 && (match ? !match.sure : nameInTheWay(first.products, words))) {
    const again = await resultsFor(`${key} ${AROUND_NAMES}`, `${query} ${AROUND_NAMES}`);
    const second = anyOf(among(again.products));
    if (second && (second.sure || !match)) [match, at] = [second, again.at];
  }
  return match ? { match, at } : null;
}

/**
 * Searches for these words and takes the most the results make of the two things. A search that did not have
 * the whole of it within the last day is not sent again, though what it returned is read again while it is in memory.
 */
async function look(words: Words, a: Words, b: Words): Promise<Found | null> {
  const key = comboKey(words);
  if (Date.now() - (misses.get(key) ?? 0) < MISS_FRESH && !(await recall(key))) return null;
  const drawn = await ask(words, (products) => matches(products, a, b, hasProduct, owned()));

  if (!drawn || drawn.match.words.length < new Set(words).size) misses.set(key, Date.now());
  if (!drawn) {
    save();
    return null;
  }
  const { text, ...product } = drawn.match.product;
  return keep({ key: comboKey(drawn.match.words), words: drawn.match.words, product, fetchedAt: drawn.at }, text);
}

/** Puts a new discovery among the others, and the new things its title names on the shelf. */
function keep(discovery: Discovery, text: string): Found {
  misses.delete(discovery.key);
  // A combination whose product left the catalog is made again in its old place.
  discoveries.value = byKey.value.has(discovery.key)
    ? discoveries.value.map((old) => (old.key === discovery.key ? discovery : old))
    : [...discoveries.value, discovery];
  const title = discovery.product?.title ?? '';
  // A hat by GHOST® does not put a ghost on the shelf.
  const fresh = wordsNamedIn(title)
    .filter((word) => !unlocked.value.includes(word) && senseOf(word, title, text) !== 'name')
    .slice(0, UNLOCK_MAX);
  if (fresh.length) unlocked.value = [...unlocked.value, ...fresh];
  save();
  return { discovery, unlocked: fresh.map(elementOf) };
}

/**
 * Puts two things together. Each is the words it is made of: one for an element, two or more for a product.
 *
 * First the real combination: one search for everything both are made of. If a product's title has it all, that
 * is the find; if not, the same results may still hold a product with most of it. Then the escape hatch: the base
 * words, one of each, a pair at a time. When nothing new is left between the two, the player gets back the most
 * they already made of them.
 */
export async function combine(a: Words, b: Words): Promise<Outcome> {
  const all = union(a, b);
  const pairs = crossPairs(a, b);
  try {
    if (pairs.length && all.length > 2 && all.length <= UNION_MAX && !hasProduct(comboKey(all))) {
      const found = await look(all, a, b);
      if (found) return { kind: 'new', ...found };
    }
    let tries = 0;
    for (const pair of pairs) {
      const key = comboKey(pair);
      if (hasProduct(key) || Date.now() - (misses.get(key) ?? 0) < MISS_FRESH) continue;
      const found = await look(pair, [pair[0]], [pair[1]]);
      if (found) return { kind: 'new', ...found };
      if (++tries === PAIR_TRIES) break;
    }
  } catch (error) {
    return { kind: 'error', message: error instanceof CatalogError ? error.message : 'Something went wrong.' };
  }
  const known = discoveries.value
    .filter((discovery) => discovery.product && discovery.words.every((word) => all.includes(word)) && mixes(discovery.words, a, b))
    .sort((x, y) => y.words.length - x.words.length)[0];
  if (known) return { kind: 'known', discovery: known };
  return { kind: 'nothing', pair: pairs.length === 1 ? pairs[0] : undefined };
}

/**
 * For a combination, the products it has had and traded in on its way through the ones there are. Held while the
 * page is open and no longer: after that it starts through them afresh.
 */
const passed = new Map<string, Set<string>>();

/**
 * Trades the product of a combination in for another one: the search for its words, read for the products that
 * name all of them and that it has not had yet, and one of those drawn. When it has had every one, it starts
 * over. The combination stays the find it was: nothing new goes on the shelf.
 */
export async function swap(key: string): Promise<Swap> {
  const words = byKey.value.get(key)?.words;
  if (!words) return { kind: 'nothing' };
  const among = (products: Candidate[]) => others(products, words, new Set([...owned(), ...(passed.get(key) ?? [])]));
  try {
    let drawn = await ask(words, among);
    // Nothing it has not had, though it has had others: once more through all of them.
    const again = !drawn && passed.delete(key);
    if (again) drawn = await ask(words, among);
    const had = byKey.value.get(key);
    // Nothing else out there, or the game was started over while the catalog was asked.
    if (!drawn || !had) return { kind: 'nothing' };

    // The product it had goes with the ones it has been through. Not when it starts over here: then that one is
    // still to come.
    if (had.product && !again) passed.set(key, (passed.get(key) ?? new Set()).add(had.product.id));
    // What the listing says about itself was for telling a thing from a name, and is not kept.
    const { text, ...product } = drawn.match.product;
    const discovery: Discovery = { key, words: drawn.match.words, product, fetchedAt: drawn.at };
    replace([discovery]);
    return { kind: 'swapped', discovery, again };
  } catch (error) {
    return { kind: 'error', message: error instanceof CatalogError ? error.message : 'Something went wrong.' };
  }
}

// ---- keeping copies fresh

function replace(updated: Discovery[]): void {
  const next = new Map(updated.map((discovery) => [discovery.key, discovery]));
  discoveries.value = discoveries.value.map((discovery) => next.get(discovery.key) ?? discovery);
  save();
}

/** The same discoveries as the catalog has them now. One it no longer lists loses its product. */
async function reread(stale: Discovery[]): Promise<void> {
  const fresh = await lookup(stale.flatMap((discovery) => (discovery.product ? [discovery.product.id] : [])));
  const now = Date.now();
  replace(
    stale.map((discovery) => ({
      ...discovery,
      product: discovery.product && fresh.get(discovery.product.id),
      fetchedAt: now,
    })),
  );
}

/**
 * Product details may be kept for a day. Run when the game opens: anything older is read again, and if it cannot
 * be, the old copy is dropped rather than shown.
 */
export async function refreshStale(): Promise<void> {
  const now = Date.now();
  const stale = discoveries.value.filter((discovery) => discovery.product && now - discovery.fetchedAt > DETAILS_FRESH);
  if (!stale.length) return;
  try {
    await reread(stale);
  } catch {
    replace(stale.map((discovery) => ({ ...discovery, product: undefined })));
  }
}

/** A price may be shown for ten minutes after it was read. */
export function priceIsFresh(discovery: Discovery): boolean {
  return Date.now() - discovery.fetchedAt <= PRICE_FRESH;
}

/** Reads the product again if its price is too old to show. The product card calls this while it is open. */
export async function withFreshPrice(discovery: Discovery): Promise<void> {
  if (discovery.product && !priceIsFresh(discovery)) await reread([discovery]);
}

/** Forgets everything. */
export function reset(): void {
  misses.clear();
  heard.clear();
  passed.clear();
  discoveries.value = [];
  unlocked.value = [...STARTERS];
  save();
}
