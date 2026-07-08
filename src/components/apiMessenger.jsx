
import { liteClient as algoliasearch } from 'algoliasearch/dist/lite/builds/browser.js';
import { InstantSearch, Chat, ChatTrigger } from 'react-instantsearch';
import 'instantsearch.css/components/chat.css';
import './apimessenger.css';

const appID = process.env.VITE_ALGOLIA_APP_ID;
const apiKey = process.env.VITE_ALGOLIA_API_KEY;
const agentId = process.env.VITE_ALGOLIA_AGENT_ID;
const indexName = process.env.VITE_ALGOLIA_INDEX_NAME;
const DEFAULT_SEARCH_PAGE_BASE = 'https://www.foodequipment.com.au/catalogsearch/result/?q=';
const searchPageBase = normalizeSearchPageBase(process.env.VITE_SEARCH_PAGE_URL);
const PRODUCT_URL_BASE = 'https://www.foodequipment.com.au';

const searchClient = algoliasearch(appID, apiKey);

// The chat agent resolves search intent server-side and often leaves the
// tool's own `query` empty (facet/semantic matching instead of keyword text),
// so "View all" falls back to the text the user actually typed in the prompt.
let lastTypedQuery = '';

function normalizeSearchPageBase(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed || !trimmed.includes('/catalogsearch/result/')) {
    return DEFAULT_SEARCH_PAGE_BASE;
  }

  if (trimmed.includes('?q=') || trimmed.includes('&q=')) {
    return trimmed;
  }

  return `${trimmed}${trimmed.includes('?') ? '&q=' : '?q='}`;
}

if (typeof document !== 'undefined') {
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!form?.closest?.('.ais-ChatPrompt')) return;

      const input = form.querySelector('textarea, input[type="text"]');
      if (input?.value?.trim()) {
        lastTypedQuery = input.value.trim();
      }
    },
    true
  );
}

function getSearchQuery(query) {
  const promptInput =
    typeof document !== 'undefined'
      ? document.querySelector('.ais-ChatPrompt textarea, .ais-ChatPrompt input[type="text"]')
      : null;

  return String(query || promptInput?.value || lastTypedQuery || '').trim();
}

function getSearchPageURL({ query }) {
  return `${searchPageBase}${encodeURIComponent(getSearchQuery(query))}`;
}

function getValue(item, keys, fallback = '') {
  for (const key of keys) {
    if (item?.[key] !== undefined && item[key] !== null && item[key] !== '') {
      return item[key];
    }
  }

  return fallback;
}

function getProductUrl(item) {
  const explicitUrl = getValue(item, [
    'product_url',
    'Product URL',
    'url',
    'URL',
    'link',
    'Link',
    'productUrl',
  ]);

  if (explicitUrl) return explicitUrl;

  const urlKey = getValue(item, ['url_key', 'Url Key', 'urlKey']);
  return urlKey ? `${PRODUCT_URL_BASE}/${urlKey}.html` : '#';
}

function getPriceInfo(item) {
  const price = Number(getValue(item, ['price', 'Price', 'final_price', 'Final Price']));
  const specialPrice = Number(
    getValue(item, ['special_price', 'Special Price', 'sale_price', 'Sale Price'])
  );

  if (
    !Number.isNaN(specialPrice) &&
    !Number.isNaN(price) &&
    specialPrice > 0 &&
    specialPrice < price
  ) {
    return { current: specialPrice, original: price };
  }

  return { current: Number.isNaN(price) ? null : price, original: null };
}

function getStockStatus(item) {
  const stockValue = getValue(item, [
    'stock_status',
    'Stock Status',
    'quantity_and_stock_status',
    'availability',
    'Availability',
    'in_stock',
    'In Stock',
    'stock',
    'Stock',
    'stocks',
    'qty',
    'Qty',
    'quantity',
    'Quantity',
  ]);

  if (stockValue === true) {
    return { label: 'In Stock', className: 'is-in-stock' };
  }

  if (stockValue === false) {
    return { label: 'Call for Stock', className: 'is-call-for-stock' };
  }

  const text = String(stockValue || '').toLowerCase();
  const numberValue = Number(stockValue);

  if (
    text.includes('in stock') ||
    text.includes('available') ||
    (!Number.isNaN(numberValue) && numberValue > 0)
  ) {
    return { label: 'In Stock', className: 'is-in-stock' };
  }

  if (
    text.includes('low stock') ||
    text.includes('limited stock') ||
    text.includes('few left')
  ) {
    return { label: 'Low Stock', className: 'is-low-stock' };
  }

  if (
    text.includes('out') ||
    text.includes('unavailable') ||
    text.includes('sold') ||
    text.includes('no stock') ||
    text.includes('call for stock')
  ) {
    return { label: 'Call for Stock', className: 'is-call-for-stock' };
  }

  return { label: 'Call for Stock', className: 'is-stock-unknown' };
}

function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, '').trim();
}

function ChatTriggerLabel() {
  return <span className="api-chat-trigger__label">FederalAi</span>;
}

function ProductCard({ item }) {
  const image = getValue(item, [
    'base_image_link',
    'Base Image Link',
    'image_2',
    'Image2',
    'image',
    'Image',
    'img',
    'thumbnail',
    'Thumbnail',
    'image_url',
    'Image URL',
  ]);
  const hasValidImage = image && !String(image).endsWith('no_selection');
  const name = getValue(item, ['name', 'Name', 'title', 'Title'], 'Unnamed Product');
  const sku = getValue(item, ['sku', 'SKU', 'Sku'], '');
  const priceInfo = getPriceInfo(item);
  const stock = getStockStatus(item);

  return (
    <a
      className="api-search-card"
      href={getProductUrl(item)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="api-search-card__imageBox">
        {hasValidImage ? (
          <img className="api-search-card__image" src={image} alt={stripHtml(name)} loading="lazy" />
        ) : (
          <div className="api-search-card__noImage">No Image</div>
        )}
      </div>

      <div className="api-search-card__body">
        {sku ? <div className="api-search-card__sku">SKU: {sku}</div> : null}

        <h3 className="api-search-card__name">{stripHtml(name)}</h3>

        <div className="api-search-card__price">
          {priceInfo.current != null ? (
            <>
              <span className="api-search-card__price-current">${priceInfo.current}</span>{' '}
              {priceInfo.original != null ? (
                <span className="api-search-card__price-original">${priceInfo.original}</span>
              ) : null}
            </>
          ) : (
            'Price N/A'
          )}
        </div>

        <div className="api-search-card__actions">
          <div className={`api-search-card__stock ${stock.className}`}>{stock.label}</div>
        </div>
      </div>
    </a>
  );
}

export function ApiMessenger() {
  return (
    <InstantSearch searchClient={searchClient} indexName={indexName}>
      <Chat
        agentId={agentId}
        translations={{ header: { title: 'Federal Ai' } }}
        getSearchPageURL={getSearchPageURL}
        itemComponent={({ item }) => <ProductCard item={item} />}
      />
      <ChatTrigger
        floating={false}
        classNames={{ root: 'api-chat-trigger' }}
        toggleIconComponent={ChatTriggerLabel}
      />
    </InstantSearch>
  );
}
