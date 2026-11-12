# Infinite Cart

Drag two things together and get the real product that combines them: cat + lamp turns up a glowing glass cat
lamp, and a shark dropped on that turns up a lamp of a cat in a shark suit. Everything that comes out is on sale in
some Shopify store right now. No server, no key and no model: the browser asks [Shop MCP](https://shop.dev/docs)
directly.

## Dev

    bun install
    bun run dev          # the address is printed, http://localhost:5173 unless that port is taken
    bun test             # the rules, src/craft.ts
    bun run build        # typecheck, then a static site in dist/
    bun run vocabulary   # writes src/vocabulary.ts again after a change to scripts/vocabulary.ts

## How it works

Every thing on the table is made of words. An element is one word (`cat`); a product is the words it was found
with (`cat` + `lamp`, or `shark` + `lamp` + `cat`). Putting two things together goes like this:

1. **The real combination first.** One search for everything both are made of. If a product's title names all of
   it, that product is the find, and it is a thing of three words or more. If none does, the same results are
   read for the product that names the most of it, as long as that is something of both things.
2. **Then the base words.** One word of each, a pair at a time, until a pair has a product.
3. **Then what there already is.** When nothing new is left between the two, the player gets back the most they
   have already made of them.

A product the player already has is never a find a second time, and a search that came up empty is not sent again
for a day. The words of a search go out in alphabetical order, so that cat on lamp and lamp on cat ask the same
thing. A title counts as naming a word when the word is in it as a word of its own, singular or plural; words
of five letters or more may also sit inside a longer one (`pickle` in "Pickleball").

### Chance

The catalog answers everybody the same, so taking its first product that will do would make every game the same
game. Instead, of the products in a search that are as good as each other (they name as many of the words, and
are as sure what they mean by them, see below), one is drawn. The same move turns up something else in another
game, and with it other words for the shelf. Within a game a combination stays what it was found as.

How much there is to draw from, for eight pairs of starting words in November 2026: from 2 products to 45, with a
median of 36. cat + lamp had 45 of its 50 results to choose from; ghost + hat had the two that say they mean a
ghost.

### Another one

A product has a ↻ on the corner of its picture: there when the pointer is on the product, and always on a phone.
It trades the product in for another with the same words. The search for those words is read for every product
that names all of them; the ones these words have already had are left out, and so are the ones the player has
under other words; and one of the rest is drawn, the listings that say what they mean first. When the words have
had them all, the table says so and they start over; when there is no other, it says that.

It is the combination that changes: every copy of it on the table, and the one on the shelf. It stays the find it
was, so nothing new goes on the shelf. What a combination has been through is remembered for as long as the page
is open.

### Things and names

Ghost is also a clothing brand and a band, and the Sharks are a hockey team: their listings name the word without
being the thing. What a listing says about itself tells the two apart, because running text writes a thing small
("tiny ghosts all around the ankle") and a name with a capital ("officially licensed Ghost merchandise").

- A word a listing uses as a name does not count as named. A GHOST® baseball hat is a hat.
- Once any listing in the results uses a word as a name, the listings that say what they mean come before the
  ones that leave it to the title.
- When that leaves nothing certain for a pair, the pair is searched once more with "funny" added, which a brand
  does not answer to: of the titles naming both words, "ghost shirt" had 0 of 22 about a ghost and "ghost shirt
  funny" 27 of 41.
- A word used as a name does not go on the shelf either.
- Halloween, Christmas, Easter, Valentine, Santa and UFO have a capital whatever they mean, so on them a capital
  says nothing, and only a ® or ™ makes one a name. Read like the other words, Halloween was a name in 45 of the
  75 titles that had it and Christmas in 74 of 159, where ghost was in 9 of 164: there they counted for nothing
  and stayed off the shelf.

Of 1,044 titles naming both words in the results for 33 pairs of starting words, 64% used both as things, 29% left
one unclear and 7% used one as a name. For ghost + hat it was 1, 8 and 18, and the pick went from "GHOST® CORE LOGO
BASEBALL HAT" to "Halloween Ghost Smiling Face Printed Baseball Hat". The 66 pairs of starting words kept their 64
products.

What a search can find, measured against the catalog in November 2026, reading fifty results a search:

| Search | A product with every word in its title |
| --- | --- |
| Two words | 39 of 40 random pairs (36 within the first ten results, 26 as the first result) |
| Three words: a product and one more word | 6 of 16, always within the first three results |
| Three random words | 3 of 12 |
| Four words: two products | 0 of 8, though 4 of the 8 searches held a product with three of the four |

And played-out games of 60 random moves each. The first two started from six words (cat, bacon, shark, slippers,
lamp, mug), the third from today's twelve, and the fourth is the third played again under today's rules, with
names told apart from things:

| | Game one | Game two | Game three | Game four |
| --- | --- | --- | --- | --- |
| Products found | 46 | 48 | 54 | 57 |
| of three words or more | 22 | 14 | 17 | 15 |
| Words on the shelf, start to end | 6 to 26 | 6 to 30 | 12 to 33 | 12 to 38 |
| Searches sent | 53 | 58 | 59 | 68 |

The longest were four words: "Halloween Ghost Dog Table Lamp", and a whale shark cat plush.

## Words

The player starts with twelve words: six things to make something out of (cat, shark, bacon, taco, ghost,
dinosaur) and six kinds of thing a shop makes (shirt, mug, socks, hat, slippers, lamp). 64 of the 66 pairs among
them had a product; shirt + slippers and slippers + lamp did not.

Every other word comes out of a find: when the title of a new product names words of the vocabulary that are not
on the shelf yet, up to three of them go there. "Bacon and Eggs Whale Shark Plush" puts egg, whale and plush on
the shelf.

The vocabulary is `src/vocabulary.ts`, 405 words with an emoji each. It is generated by `scripts/vocabulary.ts`
from the one-word names Unicode gives its emoji ("vampire", "whale", "teapot"), less a list of words that make poor
things to combine, plus a hand-written list of everyday words Unicode names otherwise ("lamp" is "light bulb").
That script is the place to tune what can turn up.

## Files

- `src/craft.ts`: the rules, with no network and no page in them: which words two things share, reading a title,
  telling a thing from a name, the products a find is drawn from.
- `src/words.ts`, `src/vocabulary.ts`: the starting words, the vocabulary, the words a title names.
- `src/catalog.ts`: the two catalog calls, `search_catalog` and `lookup_catalog`. One the catalog stumbles over is
  made once more.
- `src/game.ts`: what the player has found (localStorage), `combine`, and `swap` for another product of the same
  words.
- `src/app.tsx`, `src/style.css`: the table, the shelf, dragging, the product card. Under a finger the shelf is
  scrolled from here and not by the browser, so that the game has the say at what angle a scroll becomes a pull
  (`PULL_ANGLE`).

## The catalog's terms

The [usage guidelines](https://shopify.dev/docs/agents/catalog#usage-guidelines) shape a few things here:

- **Copies expire.** Product details may be kept for a day and prices for ten minutes. Discoveries older than a day
  are read again when the game opens (and dropped if they cannot be), and the product card reads the price again
  before showing one that is older than ten minutes. Search results are held in memory for ten minutes and no
  longer. A product the catalog no longer lists turns into a box, and its combination can be made again.
- **Links stay as they came.** The store link is the URL the catalog returned, query string included.
- **Pictures stay with their listing.** They are loaded from Shopify's CDN, resized by its own parameters.

Reading a copy again asks for the product, not for one store's offer of it, so the store and price on a card can
change to another seller of the same thing.

## Not here yet

- **A key and a cache.** Keyless requests share one rate limit with everybody else's. Before this is shown to a
  crowd it needs a Catalog API key behind a small proxy, and one shared table of combination → product so that a
  combination is searched once for all players. That table is also what "first discovery" would hang on.
- **Sharing.** A picture of a discovery to post.
