// The words the game hands out. Twelve are on the shelf when it opens; every other one has to turn up in the
// title of a product the player finds ("Vampire in the Coffin Table Lamp with Bat Shade" puts vampire and bat there).
import { namedIn, spellingsOf } from './craft';
import { VOCABULARY } from './vocabulary';

export interface Element {
  word: string;
  emoji: string;
}

/**
 * On the shelf from the start: six things to make something out of, then six kinds of thing a shop makes.
 * 64 of the 66 pairs among them had a product in November 2026; shirt + slippers and slippers + lamp did not.
 */
export const STARTERS: readonly string[] = [
  'cat', 'shark', 'bacon', 'taco', 'ghost', 'dinosaur',
  'shirt', 'mug', 'socks', 'hat', 'slippers', 'lamp',
];

export function emojiOf(word: string): string {
  return VOCABULARY[word] ?? '❓';
}

export function elementOf(word: string): Element {
  return { word, emoji: emojiOf(word) };
}

const WRITTEN = spellingsOf(Object.keys(VOCABULARY));

/** The words of the vocabulary that a product's title names: what finding the product can put on the shelf. */
export function wordsNamedIn(title: string): string[] {
  return namedIn(title, WRITTEN);
}
