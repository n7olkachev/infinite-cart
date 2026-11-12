// Shop MCP: Shopify's Global Catalog, callable from a browser with no key. https://shop.dev/docs
const ENDPOINT = 'https://mcp.shop.com/';
const MCP_VERSION = '2026-07-28';
// The game looks for English words in product titles, so it asks for the catalog as a shopper in the US sees it,
// whatever the browser's language is.
const COUNTRY = 'US';
/** The most products `lookup_catalog` takes in one request. */
const LOOKUP_MAX = 50;
const RETRY_AFTER_MS = 500;

export interface Money {
  /** In the currency's minor units: 3995 in USD is 39.95. */
  amount: number;
  currency: string;
}

/** What the game keeps of a product. */
export interface Product {
  id: string;
  title: string;
  image: string;
  /** The store's product page, exactly as the catalog returned it: its query string is the store's attribution. */
  url: string;
  seller: string;
  price?: Money;
}

/**
 * A product as a search returned it, with what its listing says about it: the store's description and the
 * features the catalog works out from it. The text is read to tell what the product is and is not kept.
 */
export interface Listing {
  product: Product;
  text: string;
}

export class CatalogError extends Error {
  /** Whether asking again might get an answer: the catalog stumbled, rather than refused. */
  constructor(message: string, readonly passing = false) {
    super(message);
  }
}

interface RawMedia {
  type?: string;
  url?: string;
  preview?: { url?: string };
}

interface RawVariant {
  url?: string;
  price?: Money;
  media?: RawMedia[];
  seller?: { name?: string };
  /** On a lookup, which of the requested ids this variant answers. */
  inputs?: { id?: string }[];
}

export interface RawProduct {
  id?: string;
  title?: string;
  /** HTML, even in the field called plain. */
  description?: { plain?: string; html?: string };
  metadata?: { top_features?: string[]; unique_selling_points?: string[] };
  media?: RawMedia[];
  variants?: RawVariant[];
}

interface RawDocument {
  ucp?: { status?: string };
  products?: RawProduct[];
  messages?: { content?: string }[];
}

let requestId = 0;

/** Both tools only read, so a call the catalog stumbled over is simply made once more. */
async function callTool(name: string, args: unknown): Promise<RawDocument> {
  try {
    return await callOnce(name, args);
  } catch (error) {
    if (!(error instanceof CatalogError) || !error.passing) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
    return callOnce(name, args);
  }
}

async function callOnce(name: string, args: unknown): Promise<RawDocument> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': MCP_VERSION,
        'Mcp-Method': 'tools/call',
        'Mcp-Name': name,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': MCP_VERSION,
            'io.modelcontextprotocol/clientInfo': { name: 'infinite-cart', version: '0.1.0' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    });
  } catch {
    throw new CatalogError('The catalog could not be reached.', true);
  }
  if (response.status === 429) throw new CatalogError('Shopify is rate-limiting searches. Try again in a moment.');
  if (!response.ok) throw new CatalogError(`The catalog answered HTTP ${response.status}.`, response.status >= 500);

  const body = await response.json();
  // An error in place of a result is the server's own trouble ("Upstream request outcome is unknown").
  if (body.error) throw new CatalogError(body.error.message ?? 'The catalog refused the request.', true);
  const result = body.result;
  if (result?.isError) {
    const text = (result.content ?? []).map((part: { text?: string }) => part.text ?? '').join(' ').trim();
    throw new CatalogError(text || 'The catalog refused the request.');
  }
  const document: RawDocument | undefined = result?.structuredContent;
  if (!document) throw new CatalogError('The catalog sent nothing back.');
  if (document.ucp?.status === 'error') {
    throw new CatalogError(document.messages?.map((message) => message.content).join(' ') || 'The catalog reported an error.');
  }
  return document;
}

/** The catalog's best matches for a query, in its order, in stock. Products without a picture or a page are left out. */
export async function search(query: string, limit: number): Promise<Listing[]> {
  const document = await callTool('search_catalog', {
    catalog: { query, context: { address_country: COUNTRY }, pagination: { limit } },
  });
  return (document.products ?? []).map(toListing).filter((listing): listing is Listing => listing !== null);
}

export function toListing(raw: RawProduct): Listing | null {
  const product = toProduct(raw);
  if (!product) return null;
  const said = [raw.description?.plain || raw.description?.html, ...(raw.metadata?.top_features ?? []), ...(raw.metadata?.unique_selling_points ?? [])];
  return { product, text: said.map((part) => sentences(part ?? '')).filter(Boolean).join('. ') };
}

/** Markup as running text. The end of a paragraph, a line or a list item ends a sentence. */
function sentences(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/div|\/h\d|\/tr)\b[^>]*>/gi, '. ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(#39|apos|rsquo|lsquo);/gi, "'")
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The products behind these ids as they are now. An id the catalog no longer lists is absent from the answer. */
export async function lookup(ids: readonly string[]): Promise<Map<string, Product>> {
  const found = new Map<string, Product>();
  for (let start = 0; start < ids.length; start += LOOKUP_MAX) {
    const document = await callTool('lookup_catalog', {
      catalog: { ids: ids.slice(start, start + LOOKUP_MAX), context: { address_country: COUNTRY } },
    });
    for (const raw of document.products ?? []) {
      const product = toProduct(raw);
      if (!product) continue;
      found.set(product.id, product);
      for (const input of raw.variants?.[0]?.inputs ?? []) if (input.id) found.set(input.id, product);
    }
  }
  return found;
}

function toProduct(raw: RawProduct): Product | null {
  const variant = raw.variants?.[0];
  const title = raw.title?.trim();
  if (!raw.id || !title || !variant) return null;

  const pictures = [...(raw.media ?? []), ...(variant.media ?? [])].filter((entry) => entry.type === 'image');
  const image = httpUrl(pictures[0]?.url ?? pictures[0]?.preview?.url);
  const url = httpUrl(variant.url);
  if (!image || !url) return null;

  return { id: raw.id, title, image, url, seller: variant.seller?.name?.trim() || 'Unknown store', price: variant.price };
}

/** Catalog data is untrusted: only http(s) links are ever followed or shown. */
function httpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/** A square cut of a picture, `side` pixels wide. Shopify's CDN resizes on request; other hosts get the URL unchanged. */
export function square(url: string, side: number): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'cdn.shopify.com') return url;
    parsed.searchParams.set('width', String(side));
    parsed.searchParams.set('height', String(side));
    parsed.searchParams.set('crop', 'center');
    return parsed.toString();
  } catch {
    return url;
  }
}

export function formatMoney({ amount, currency }: Money): string {
  try {
    const format = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    return format.format(amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}
