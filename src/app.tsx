// The table things are dragged around on, the shelf they come from, and what happens when one lands on another.
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { formatMoney, square } from './catalog';
import { crossPairs } from './craft';
import { PRICE_FRESH, byKey, combine, discoveries, elements, priceIsFresh, refreshStale, reset, swap, withFreshPrice } from './game';
import type { Discovery } from './game';
import { emojiOf, type Element } from './words';

/** Something that can be picked up: an element, by its word, or a product, by the key of its pair. */
type Thing = { kind: 'element'; word: string } | { kind: 'product'; key: string };

/** A thing lying on the table. `x` and `y` are its middle, in the table's pixels. */
interface Token {
  id: number;
  thing: Thing;
  x: number;
  y: number;
  /** The one picked up last is on top. */
  z: number;
  mood?: 'busy' | 'pop' | 'shake';
}

/** How close two middles have to be for one thing to land on the other. */
const REACH = 64;
/** How far outside the bin a thing held over it still counts as over it: to the edges of the table, in its corner. */
const BIN_MARGIN = 16;
/** A press that travels less than this is a click. */
const SLOP = 6;
/**
 * A finger on the shelf either scrolls it or takes a thing off it, and which is told by the way it sets out: within
 * this many degrees of the shelf's own line it is scrolling, steeper than that it is pulling. A smaller angle makes
 * pulling easier and scrolling fussier.
 */
const PULL_ANGLE = 30;
/** How far a finger goes before the way it is going is read. */
const AIM = 10;
/** What a shelf let go at speed keeps of that speed from one millisecond to the next: the figure iOS has for its lists. */
const GLIDE = 0.998;
/** The last stretch of a finger's path, in milliseconds, that its speed at letting go is taken over. */
const FLICK_MS = 100;
/** The speed, in pixels a millisecond, under which a shelf let go stays where it is, and a running one has stopped. */
const STILL = 0.02;
/** How far from everything else a thing put on the table by a click should land, when there is room. */
const CLEARANCE = 130;
const REVEAL_MS = 7000;
const NOTICE_MS = 2600;
/** The two starting words laid out for a first-time player. */
const FIRST_MOVE = ['cat', 'lamp'] as const;
/** The side, in pixels, of the picture on a sticker: one size everywhere it is small, so it is fetched once. */
const THUMB = 192;
/** How long a new product waits for its picture before it shows up without one. */
const PICTURE_WAIT_MS = 1500;
const CONFETTI = ['#ff5a5f', '#ffb400', '#00c2a8', '#5b8cff', '#b06cff', '#ff7ac6'];

const tokens = signal<Token[]>([]);
/** The token in the player's hand, and what it would land on if let go: another token, or the bin. */
const hand = signal<{ id: number; over: number | 'bin' | null } | null>(null);
/** The product whose card is open, by the key of its pair. */
const opened = signal<string | null>(null);
const reveal = signal<{ discovery: Discovery; unlocked: Element[] } | null>(null);
const notice = signal<string | null>(null);
/** The combinations being traded in for another product, each as it was: its stickers keep that face meanwhile. */
const swapping = signal<ReadonlyMap<string, Discovery>>(new Map());

let table: HTMLElement | null = null;
let sparks: HTMLElement | null = null;
/** The part of the shelf that scrolls. */
let shelf: HTMLElement | null = null;
/** Where one thing is dropped to take it off the table: the button that clears the table, while something is held. */
let bin: HTMLElement | null = null;
let nextId = 1;
let top = 1;
let revealTimer = 0;
let noticeTimer = 0;

// ---- the table's bookkeeping

const wordsOf = (thing: Thing): readonly string[] =>
  thing.kind === 'element' ? [thing.word] : (byKey.value.get(thing.key)?.words ?? []);

const tokenById = (id: number) => tokens.value.find((token) => token.id === id);

function change(id: number, patch: Partial<Token>): void {
  tokens.value = tokens.value.map((token) => (token.id === id ? { ...token, ...patch } : token));
}

function put(thing: Thing, at: { x: number; y: number }, mood?: Token['mood']): number {
  const id = nextId++;
  tokens.value = [...tokens.value, { id, thing, ...at, z: ++top, mood }];
  if (mood) calm(id);
  return id;
}

function remove(...ids: number[]): void {
  tokens.value = tokens.value.filter((token) => !ids.includes(token.id));
}

/** Lets a pop or a shake play out, then forgets it. */
function calm(...ids: number[]): void {
  window.setTimeout(() => {
    tokens.value = tokens.value.map((token) =>
      ids.includes(token.id) && token.mood !== 'busy' ? { ...token, mood: undefined } : token,
    );
  }, 520);
}

function say(text: string): void {
  notice.value = text;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = null), NOTICE_MS);
}

/** Tells what a product is, for a little while: its title, its price, its store, and the words it put on the shelf. */
function show(discovery: Discovery, unlocked: Element[] = []): void {
  reveal.value = { discovery, unlocked };
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(() => (reveal.value = null), REVEAL_MS);
}

function pointOnTable(event: PointerEvent): { x: number; y: number } {
  const box = table!.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

function isOverTable(event: PointerEvent): boolean {
  const box = table!.getBoundingClientRect();
  return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
}

/**
 * Whether a held thing is over the bin. It is held by wherever it was caught, so its middle can be on the bin while
 * the pointer is not, and the other way round: either will do.
 */
function isOverBin(pointer: PointerEvent, x: number, y: number): boolean {
  if (!bin) return false;
  const box = bin.getBoundingClientRect();
  const origin = table!.getBoundingClientRect();
  const within = (left: number, top: number) =>
    left >= box.left - BIN_MARGIN && left <= box.right + BIN_MARGIN && top >= box.top - BIN_MARGIN && top <= box.bottom + BIN_MARGIN;
  return within(pointer.clientX, pointer.clientY) || within(origin.left + x, origin.top + y);
}

/** A spot around the middle of the table with room to itself, for a thing that was clicked rather than dragged. */
function somewhere(): { x: number; y: number } {
  const box = table!.getBoundingClientRect();
  let best = { x: box.width / 2, y: box.height / 2 };
  let room = -1;
  for (let attempt = 0; attempt < 16 && room < CLEARANCE; attempt++) {
    const spot = {
      x: box.width / 2 + (Math.random() - 0.5) * Math.min(520, box.width - 120),
      y: box.height / 2 + (Math.random() - 0.5) * Math.min(380, box.height - 180),
    };
    const nearest = Math.min(Infinity, ...tokens.value.map((token) => Math.hypot(token.x - spot.x, token.y - spot.y)));
    if (nearest > room) {
      best = spot;
      room = nearest;
    }
  }
  return best;
}

/** Keeps a thing that was let go where the player can still get hold of it. */
function settle(id: number): void {
  const token = tokenById(id);
  if (!token || !table) return;
  const box = table.getBoundingClientRect();
  change(id, {
    x: Math.min(Math.max(token.x, 48), box.width - 48),
    y: Math.min(Math.max(token.y, 56), box.height - 60),
  });
}

/** Resolves once the picture can be drawn, or after a moment if it is slow: a new product should arrive with its face on. */
function pictured(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  return Promise.race([
    image.decode().catch(() => {}),
    new Promise<void>((resolve) => window.setTimeout(resolve, PICTURE_WAIT_MS)),
  ]);
}

/** Confetti from a point on the table. A find of three words or more gets a bigger handful, thrown further. */
function burst(x: number, y: number, big: boolean): void {
  if (!sparks || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const count = big ? 44 : 18;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const reach = (big ? 80 : 50) + Math.random() * (big ? 140 : 80);
    bit.style.cssText =
      `left:${x}px;top:${y}px;background:${CONFETTI[i % CONFETTI.length]};` +
      `--dx:${Math.cos(angle) * reach}px;--dy:${Math.sin(angle) * reach - 24}px;--spin:${Math.random() * 540 - 270}deg`;
    bit.addEventListener('animationend', () => bit.remove(), { once: true });
    sparks.append(bit);
  }
}

// ---- dragging

/** Follows the pointer from a press to its release, wherever on the page it goes. */
function follow(onMove: (event: PointerEvent) => void, onEnd: (event: PointerEvent, cancelled: boolean) => void): void {
  const up = (event: PointerEvent) => end(event, false);
  const cancel = (event: PointerEvent) => end(event, true);
  function end(event: PointerEvent, cancelled: boolean): void {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    onEnd(event, cancelled);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}

/** Moves the held token and works out what it is over. */
function carry(id: number, x: number, y: number, pointer: PointerEvent): void {
  change(id, { x, y });
  let over: number | 'bin' | null = null;
  let nearest = REACH;
  for (const token of tokens.value) {
    if (token.id === id || token.mood === 'busy') continue;
    const distance = Math.hypot(token.x - x, token.y - y);
    if (distance < nearest) {
      nearest = distance;
      over = token.id;
    }
  }
  // The bin has it before anything that is lying by the bin.
  if (isOverBin(pointer, x, y)) over = 'bin';
  if (hand.value?.id !== id || hand.value.over !== over) hand.value = { id, over };
}

/** The held token is let go: into the bin, onto another, back on the shelf, or just down. */
function drop(id: number, event: PointerEvent): void {
  const over = hand.value?.over ?? null;
  hand.value = null;
  if (over === 'bin' || !isOverTable(event)) remove(id);
  else if (over !== null && tokenById(over)) void merge(id, over);
  else settle(id);
}

/** The browser took the gesture away (a scroll, a second finger): nothing is combined and nothing is thrown out. */
function letGo(id: number): void {
  hand.value = null;
  settle(id);
}

function pickUp(event: PointerEvent, token: Token): void {
  if (event.button !== 0 || token.mood === 'busy') return;
  event.preventDefault();
  const start = pointOnTable(event);
  const grip = { x: token.x - start.x, y: token.y - start.y };
  let moved = false;
  change(token.id, { z: ++top });
  follow(
    (move) => {
      const at = pointOnTable(move);
      if (!moved && Math.hypot(at.x - start.x, at.y - start.y) < SLOP) return;
      moved = true;
      carry(token.id, at.x + grip.x, at.y + grip.y, move);
    },
    (end, cancelled) => {
      if (moved && cancelled) letGo(token.id);
      else if (moved) drop(token.id, end);
      else if (!cancelled && token.thing.kind === 'product') opened.value = token.thing.key;
    },
  );
}

/**
 * A press on a thing on the shelf: a drag takes a copy onto the table, a click puts one down where there is room.
 * A finger that sets out along the shelf is scrolling it, which is `slide`'s business and none of this one's.
 */
function pull(event: PointerEvent, thing: Thing): void {
  if (event.button !== 0 || !table) return;
  const start = { x: event.clientX, y: event.clientY };
  const line = lineOfShelf(event);
  // A press that stopped the shelf in its run was for that, and not for the thing it landed on.
  const caught = stopped;
  let id: number | null = null;
  let along = false;
  follow(
    (move) => {
      if (along) return;
      if (id === null) {
        const [dx, dy] = [move.clientX - start.x, move.clientY - start.y];
        if (Math.hypot(dx, dy) < (line ? AIM : SLOP)) return;
        along = line !== null && goesAlong(line, dx, dy);
        if (along) return;
        id = put(thing, pointOnTable(move));
      }
      const at = pointOnTable(move);
      carry(id, at.x, at.y, move);
    },
    (end, cancelled) => {
      if (along) return;
      if (id !== null && cancelled) {
        // The browser took the gesture away: the copy that was being taken out goes back.
        hand.value = null;
        remove(id);
      } else if (id !== null) drop(id, end);
      else if (!cancelled && !caught) put(thing, somewhere(), 'pop');
    },
  );
}

// ---- the shelf under a finger
//
// The browser is not asked to scroll the shelf for a finger, because it cannot be told where a scroll ends and a
// pull begins. Left to it (touch-action: pan-x), Chrome takes for a scroll whatever sets out within 45° of the
// shelf's line: measured in November 2026, a finger at 40° scrolled and one at 50° pulled. WebKit, going by its
// source, gives a gesture to the scroll once its pan has moved along the shelf at all, at any angle. So style.css
// has the browser keep out (touch-action: none), and the shelf is moved from here the way a list on a phone
// moves: with the finger, and on for a while after it.

type Line = 'x' | 'y';
/** Moves the shelf so many pixels along its line, as far as it will go, and says whether it went. */
type Mover = (by: number) => boolean;

/** The frame a shelf that is running on is waiting for, or 0 when it is still. */
let running = 0;
/** Whether the press that is down now stopped a running shelf. */
let stopped = false;

/** The way the shelf scrolls under the finger that has come down, if it has more than it shows. A mouse has its wheel for that. */
function lineOfShelf(event: PointerEvent): Line | null {
  if (!shelf || event.pointerType === 'mouse') return null;
  const more = { x: shelf.scrollWidth - shelf.clientWidth, y: shelf.scrollHeight - shelf.clientHeight };
  if (Math.max(more.x, more.y) < 2) return null;
  return more.x > more.y ? 'x' : 'y';
}

/** Whether a finger that is this far from where it came down is going along the shelf, and not off it. */
function goesAlong(line: Line, dx: number, dy: number): boolean {
  const [along, across] = line === 'x' ? [dx, dy] : [dy, dx];
  return Math.abs(across) <= Math.abs(along) * Math.tan((PULL_ANGLE * Math.PI) / 180);
}

/** A hand on the shelf, for as long as one finger is on it and for the run after. */
function mover(line: Line): Mover {
  const side = line === 'x' ? 'scrollLeft' : 'scrollTop';
  // Kept in full here: read back from the page it comes rounded, and the end of a slow run would not add up.
  let at = shelf ? shelf[side] : 0;
  return (by) => {
    if (!shelf) return false;
    // Something else has moved it meanwhile, a wheel perhaps: go on from where that left it.
    if (Math.abs(shelf[side] - at) > 1) at = shelf[side];
    const most = line === 'x' ? shelf.scrollWidth - shelf.clientWidth : shelf.scrollHeight - shelf.clientHeight;
    const next = Math.min(Math.max(at + by, 0), most);
    const went = next !== at;
    shelf[side] = at = next;
    return went;
  };
}

/** Lets the shelf run on at the speed it was let go at, slower all the time, until it is still or at its end. */
function coast(move: Mover, speed: number): void {
  let last = 0;
  const step = (now: number) => {
    // A frame that was long in coming does not make the shelf leap.
    const passed = last ? Math.min(now - last, 50) : 0;
    last = now;
    speed *= GLIDE ** passed;
    const going = !passed || (Math.abs(speed) > STILL && move(speed * passed));
    running = going ? requestAnimationFrame(step) : 0;
  };
  running = requestAnimationFrame(step);
}

/** Stops a shelf that is running on, and says whether it was. */
function rest(): boolean {
  const was = running !== 0;
  cancelAnimationFrame(running);
  running = 0;
  return was;
}

/**
 * A press anywhere on the shelf, heard before the thing under it hears it. A finger that sets out along the shelf
 * takes the shelf with it, and the shelf runs on when the finger lifts.
 */
function slide(event: PointerEvent): void {
  stopped = rest();
  const line = event.button === 0 ? lineOfShelf(event) : null;
  if (!line) return;
  const where = (at: PointerEvent) => (line === 'x' ? at.clientX : at.clientY);
  let move: Mover | null = null;
  let off = false;
  /** Where the finger was in its last moments, for the speed it lifts at. */
  let trail: PointerEvent[] = [];
  follow(
    (now) => {
      if (off) return;
      if (!move) {
        const [dx, dy] = [now.clientX - event.clientX, now.clientY - event.clientY];
        if (Math.hypot(dx, dy) < AIM) return;
        off = !goesAlong(line, dx, dy);
        if (off) return;
        // From here, and not from where the finger came down: the shelf does not jump to catch up.
        move = mover(line);
      } else move(where(trail[trail.length - 1]) - where(now));
      trail = [...trail.filter((past) => now.timeStamp - past.timeStamp < FLICK_MS), now];
    },
    (end, cancelled) => {
      // A finger that had come to rest before it lifted leaves the shelf where it is.
      const from = trail.find((past) => end.timeStamp - past.timeStamp < FLICK_MS);
      if (!move || cancelled || !from || end.timeStamp <= from.timeStamp) return;
      const speed = (where(from) - where(end)) / (end.timeStamp - from.timeStamp);
      if (Math.abs(speed) > STILL) coast(move, speed);
    },
  );
}

// ---- putting two things together

async function merge(carriedId: number, targetId: number): Promise<void> {
  const carried = tokenById(carriedId);
  const target = tokenById(targetId);
  if (!carried || !target) return;
  const a = wordsOf(carried.thing);
  const b = wordsOf(target.thing);

  // One is all there is of the other: "cat" and "cat lamp", or the same thing twice.
  if (!crossPairs(a, b).length) {
    part(carriedId, targetId, target);
    say('Those two have nothing new between them.');
    return;
  }

  // Side by side, where the target was, while the catalog is asked.
  const spot = { x: target.x, y: target.y };
  change(carriedId, { x: spot.x - 30, y: spot.y + 6, mood: 'busy' });
  change(targetId, { x: spot.x + 30, mood: 'busy' });
  const outcome = await combine(a, b);
  const made = outcome.kind === 'new' || outcome.kind === 'known' ? outcome.discovery.product : undefined;
  if (made) await pictured(square(made.image, THUMB));
  if (!tokenById(carriedId) || !tokenById(targetId)) return; // the table was cleared meanwhile

  if (outcome.kind === 'new' || outcome.kind === 'known') {
    remove(carriedId, targetId);
    put({ kind: 'product', key: outcome.discovery.key }, spot, 'pop');
    if (outcome.kind === 'new') {
      burst(spot.x, spot.y, outcome.discovery.words.length > 2);
      show(outcome.discovery, outcome.unlocked);
    }
    return;
  }
  part(carriedId, targetId, spot);
  if (outcome.kind === 'error') say(outcome.message);
  else say(outcome.pair ? `Nobody sells ${outcome.pair[0]} + ${outcome.pair[1]} yet.` : 'Nobody sells that yet.');
}

/** Two things that made nothing shake their heads and step apart, either side of where they met. */
function part(carriedId: number, targetId: number, spot: { x: number; y: number }): void {
  change(carriedId, { x: spot.x - 52, y: spot.y + 8, mood: 'shake' });
  change(targetId, { x: spot.x + 52, y: spot.y, mood: 'shake' });
  settle(carriedId);
  settle(targetId);
  calm(carriedId, targetId);
}

// ---- another product for the same words

/** Trades a product in for another one. It is the combination that changes, so every sticker of it does, wherever it lies. */
async function another(key: string): Promise<void> {
  const before = byKey.value.get(key);
  if (!before || swapping.value.has(key)) return;
  swapping.value = new Map(swapping.value).set(key, before);
  const outcome = await swap(key);
  // The old face stays up until the new one can be drawn.
  if (outcome.kind === 'swapped' && outcome.discovery.product) await pictured(square(outcome.discovery.product.image, THUMB));
  const rest = new Map(swapping.value);
  rest.delete(key);
  swapping.value = rest;

  const now = byKey.value.get(key);
  if (!now) return; // everything was forgotten meanwhile
  if (outcome.kind === 'swapped') {
    show(now);
    if (outcome.again) say('That was all of them. Here is one again.');
  } else if (outcome.kind === 'error') say(outcome.message);
  else say(`No other ${before.words.join(' ')} turned up.`);
}

// ---- what it looks like

const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/** The same number for the same input every time: a colour for a word, a tilt for a token. */
function hash(text: string): number {
  let value = 7;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) % 3600;
  return value;
}

function Picture({ url, side, alt = '' }: { url: string; side: number; alt?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <>📦</>;
  return <img src={square(url, side)} alt={alt} draggable={false} onError={() => setBroken(true)} />;
}

function Sticker({ thing }: { thing: Thing }) {
  if (thing.kind === 'element') {
    return (
      <div class="sticker element" style={`--hue:${hash(thing.word) % 360}`}>
        <span class="face">{emojiOf(thing.word)}</span>
        <span class="name">{thing.word}</span>
      </div>
    );
  }
  const leaving = swapping.value.get(thing.key);
  const discovery = leaving ?? byKey.value.get(thing.key);
  const product = discovery?.product;
  return (
    <div class={cls('sticker product', !product && 'gone', discovery && discovery.words.length > 2 && 'deep')} title={product?.title}>
      <span class="face">{product ? <Picture key={product.image} url={product.image} side={THUMB} /> : '📦'}</span>
      <span class="name">{discovery ? discovery.words.join(' ') : '…'}</span>
      {discovery?.product && (
        // A press on it is not a hold of the thing it is on: the sticker stays where it is.
        <button
          type="button"
          class={cls('swap', leaving && 'busy')}
          title="Another one"
          aria-label={`Another ${discovery.words.join(' ')}`}
          aria-disabled={!!leaving}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void another(thing.key)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.5 14.7A8 8 0 1 1 17.1 5.9L20 8.5" />
            <path d="M20 3.5v5h-5" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Table() {
  const held = hand.value;
  const carried = held ? tokenById(held.id) : undefined;
  const found = discoveries.value.length;
  const shown = reveal.value;
  return (
    <main class="table" ref={(element) => { table = element; }}>
      <header class="brand">
        <h1>Infinite Cart</h1>
        <p>{found === 0 ? 'Drag one thing onto another.' : `${found} found`}</p>
      </header>
      {tokens.value.length > 0 && (
        // With something in the hand it is the bin, where that one thing is dropped to take it off the table. It is
        // then over everything lying on the table, and under the thing in the hand, which is as high as it and comes
        // after it in the page.
        <button
          type="button"
          class={cls('clear', held && 'bin', held?.over === 'bin' && 'over')}
          style={carried ? `z-index:${carried.z}` : undefined}
          ref={(element) => { bin = element; }}
          onClick={() => (tokens.value = [])}
        >
          {held ? 'Drop to remove' : 'Clear the table'}
        </button>
      )}

      {tokens.value.map((token) => (
        <div
          key={token.id}
          class={cls(
            'token',
            token.mood,
            held?.id === token.id && 'held',
            held?.id === token.id && held.over === 'bin' && 'out',
            held?.over === token.id && 'over',
          )}
          style={`transform:translate(${token.x}px,${token.y}px);z-index:${token.z};--tilt:${(hash(String(token.id * 97)) % 9) - 4}deg`}
          onPointerDown={(event) => pickUp(event, token)}
        >
          <Sticker thing={token.thing} />
        </div>
      ))}
      <div class="sparks" ref={(element) => { sparks = element; }} />

      {notice.value && <div class="notice" role="status">{notice.value}</div>}
      {shown?.discovery.product && (
        <div class="reveal" role="status" key={shown.discovery.key}>
          <span class="face">
            <Picture key={shown.discovery.product.image} url={shown.discovery.product.image} side={THUMB} />
          </span>
          <div class="words">
            <strong>{shown.discovery.product.title}</strong>
            <span>
              {shown.discovery.product.price && `${formatMoney(shown.discovery.product.price)} at `}
              {shown.discovery.product.seller}
            </span>
            {shown.unlocked.length > 0 && (
              <span class="unlocked">
                New on the shelf: {shown.unlocked.map((element) => `${element.emoji} ${element.word}`).join(', ')}
              </span>
            )}
          </div>
          <button type="button" onClick={() => (opened.value = shown.discovery.key)}>
            Look
          </button>
        </div>
      )}
      <footer class="credit">
        Made with ❤️ by{' '}
        <a href="https://x.com/n7olkachev" target="_blank" rel="noopener">
          Nikita Tolkachev
        </a>
      </footer>
    </main>
  );
}

function Shelf() {
  const found = [...discoveries.value].reverse();
  const startOver = () => {
    if (!window.confirm('Forget everything you have found and start over?')) return;
    tokens.value = [];
    reveal.value = null;
    reset();
  };
  return (
    <aside class="shelf">
      <div class="things" ref={(element) => { shelf = element; }} onPointerDownCapture={slide}>
        {elements.value.map((element) => (
          <div class="slot" key={element.word} onPointerDown={(event) => pull(event, { kind: 'element', word: element.word })}>
            <Sticker thing={{ kind: 'element', word: element.word }} />
          </div>
        ))}
        {found.map((discovery) => (
          <div class="slot" key={discovery.key} onPointerDown={(event) => pull(event, { kind: 'product', key: discovery.key })}>
            <Sticker thing={{ kind: 'product', key: discovery.key }} />
          </div>
        ))}
      </div>
      <footer>
        <span>Real products, from the Shopify Catalog.</span>
        {found.length > 0 && (
          <button type="button" class="link" onClick={startOver}>
            Start over
          </button>
        )}
      </footer>
    </aside>
  );
}

/** A product up close, with the way to its store. */
function Card({ discovery }: { discovery: Discovery }) {
  const [failed, setFailed] = useState(false);
  // Read the price again when the copy is too old to show, and again if the card is left open that long.
  const [round, setRound] = useState(0);
  useEffect(() => {
    withFreshPrice(discovery).then(
      () => setFailed(false),
      () => setFailed(true),
    );
    const timer = window.setTimeout(() => setRound(round + 1), PRICE_FRESH + 1000);
    return () => window.clearTimeout(timer);
  }, [discovery.key, round]);
  const product = discovery.product;
  const recipe = discovery.words.map((word) => `${emojiOf(word)} ${word}`).join(' + ');
  const price = !priceIsFresh(discovery)
    ? failed
      ? 'The store has the price.'
      : 'Checking the price…'
    : product?.price
      ? formatMoney(product.price)
      : 'The store has the price.';
  return (
    <div class="veil" onClick={() => (opened.value = null)}>
      <article class="card" onClick={(event) => event.stopPropagation()}>
        <button type="button" class="close" aria-label="Close" onClick={() => (opened.value = null)}>
          ×
        </button>
        {product ? (
          <>
            <div class="photo">
              <Picture key={product.image} url={product.image} side={720} alt={product.title} />
            </div>
            <div class="body">
              <p class="recipe">{recipe}</p>
              <h2>{product.title}</h2>
              <p class="price">{price}</p>
              <a class="buy" href={product.url} target="_blank" rel="noopener">
                See it at {product.seller} ↗
              </a>
            </div>
          </>
        ) : (
          <div class="body">
            <p class="recipe">{recipe}</p>
            <h2>📦 No longer for sale</h2>
            <p class="price">Put {discovery.words.join(' and ')} together again to find another one.</p>
          </div>
        )}
      </article>
    </div>
  );
}

export function App() {
  useEffect(() => {
    void refreshStale();
    // A first-time player finds two things already out, close enough to suggest the move.
    if (!discoveries.value.length && !tokens.value.length && table) {
      const box = table.getBoundingClientRect();
      put({ kind: 'element', word: FIRST_MOVE[0] }, { x: box.width / 2 - 90, y: box.height / 2 }, 'pop');
      put({ kind: 'element', word: FIRST_MOVE[1] }, { x: box.width / 2 + 90, y: box.height / 2 }, 'pop');
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') opened.value = null;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const open = opened.value ? byKey.value.get(opened.value) : undefined;
  return (
    <div class="app">
      <Table />
      <Shelf />
      {open && <Card key={open.key} discovery={open} />}
    </div>
  );
}
