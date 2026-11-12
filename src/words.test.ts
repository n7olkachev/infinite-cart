import { expect, test } from 'bun:test';
import { VOCABULARY } from './vocabulary';
import { STARTERS, emojiOf, wordsNamedIn } from './words';

test('every starting word is in the vocabulary, once', () => {
  for (const word of STARTERS) expect(VOCABULARY[word]).toBeDefined();
  expect(new Set(STARTERS).size).toBe(STARTERS.length);
});

test('no two starting words look the same', () => {
  expect(new Set(STARTERS.map(emojiOf)).size).toBe(STARTERS.length);
});

test('a title gives up the words of the vocabulary it names', () => {
  expect(wordsNamedIn('Bacon and Eggs Whale Shark Plush (READY TO SHIP)')).toEqual(['bacon', 'egg', 'whale', 'shark', 'plush']);
  expect(wordsNamedIn('Turkey Riding Shark T-Shirt Thanksgiving')).toEqual(['turkey', 'shark', 'shirt']);
  expect(wordsNamedIn('Glowing Glass Kitty Short Sleeve House Dress')).toEqual(['dress']);
});
