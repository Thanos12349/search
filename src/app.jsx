import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  InstantSearch,
  LookingSimilar,
  FrequentlyBoughtTogether,
  TrendingItems,
} from 'react-instantsearch';
import { ApiMessenger } from './components/apiMessenger';
import './app.css';

const HITS_PER_PAGE = 8;
const growthIcon = new URL('./images/growth.png', import.meta.url).href
const blizLogo = new URL('./images/blizLogo.png', import.meta.url).href
const bonvueLogo = new URL('./images/bonvue_logo.png', import.meta.url).href
const fedLogo = new URL('./images/fed_logo.png', import.meta.url).href
const gasLogo = new URL('./images/gasLogo.png', import.meta.url).href
const modLogo = new URL('./images/modLogo.png', import.meta.url).href
const thermasterLogo = new URL('./images/thermaster_logo.png', import.meta.url).href

const HITS_FETCH_MULTIPLIER = 3; // fetch extra so both New + Refurbished sections can each show a full 8
const POPULAR_SEARCH_LIMIT = 8;
const BRAND_LINKS = [
  { name: 'Thermaster', url: 'https://www.foodequipment.com.au/thermaster', logo: thermasterLogo },
  { name: 'FED-X', url: 'https://www.foodequipment.com.au/fed-x', logo: fedLogo },
  { name: 'Gasmax', url: 'https://www.foodequipment.com.au/gasmax', logo: gasLogo },
  { name: 'Modular Systems', url: 'https://www.foodequipment.com.au/modular-systems', logo: modLogo },
  { name: 'Bonvue', url: 'https://www.foodequipment.com.au/bonvue', logo: bonvueLogo },
  {
    name: 'Blizzard Ice Systems',
    url: 'https://www.foodequipment.com.au/blizzard-ice-systems',
    logo: blizLogo
  },
];
const QUERY_SUGGESTIONS_INDEX_NAME =
  process.env.ALGOLIA_QUERY_SUGGESTIONS_INDEX_NAME ||
  `${process.env.ALGOLIA_INDEX_NAME || ''}_query_suggestions`;
function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, '').trim();
}

function stripForeignHtml(value = '') {
  return String(value)
    .replace(/<(?!\/?mark\b)[^>]*>/gi, '')
    .replace(/&lt;\/?[a-z][a-z0-9]*(?:\s[^&]*?)?\/?&gt;/gi, '');
}

function getValue(hit, keys, fallback = '') {
  for (const key of keys) {
    if (hit[key] !== undefined && hit[key] !== null && hit[key] !== '') {
      return hit[key];
    }
  }

  return fallback;
}

function getHighlightedValue(hit, keys, fallback = '') {
  for (const key of keys) {
    if (hit._highlightResult?.[key]?.value) {
      return stripForeignHtml(hit._highlightResult[key].value);
    }

    if (hit[key]) {
      return escapeHtml(stripHtml(hit[key]));
    }
  }

  return escapeHtml(stripHtml(fallback));
}

function getStockQuantity(hit) {
  const quantityValue = getValue(hit, [
    'stock_quantity',
    'Stock Quantity',
    'stock_qty',
    'Stock Qty',
    'quantity',
    'Quantity',
    'qty',
    'Qty',
    'available_qty',
    'Available Qty',
    'inventory_qty',
    'Inventory Qty',
    'inventory_quantity',
    'Inventory Quantity',
    'salable_qty',
    'Salable Qty',
  ]);

  if (quantityValue === '' || quantityValue === null || quantityValue === undefined) {
    return null;
  }

  const parsedQuantity = Number(quantityValue);
  return Number.isFinite(parsedQuantity) ? parsedQuantity : null;
}

function getStockStatus(hit) {
  const quantity = getStockQuantity(hit);

  if (quantity !== null) {
    if (quantity > 5) {
      return { label: 'In Stock', className: 'is-in-stock' };
    }

    if (quantity > 0) {
      return { label: 'Low Stock', className: 'is-low-stock' };
    }

    return { label: 'Call for Stock', className: 'is-call-for-stock' };
  }

  const stockValue = getValue(hit, [
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

  return { label: 'call for stock', className: 'is-stock-unknown' };
}

const PRODUCT_IMAGE_KEYS = [
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
];
const PRODUCT_URL_BASE = 'https://www.foodequipment.com.au';

function getProductUrl(hit) {
  const explicitUrl = getValue(hit, [
    'product_url',
    'Product URL',
    'url',
    'URL',
    'link',
    'Link',
  ]);

  if (explicitUrl) return explicitUrl;

  const urlKey = getValue(hit, ['url_key', 'Url Key', 'urlKey']);
  return urlKey ? `${PRODUCT_URL_BASE}/${urlKey}.html` : '#';
}

function getPriceInfo(hit) {
  const price = Number(getValue(hit, ['price', 'Price', 'final_price', 'Final Price']));
  const specialPrice = Number(
    getValue(hit, ['special_price', 'Special Price', 'sale_price', 'Sale Price'])
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

function getProductDescription(hit) {
  const description = getValue(hit, [
    'description',
    'Description',
    'short_description',
    'Short Description',
    'shortDescription',
    'long_description',
    'Long Description',
    'longDescription',
    'product_description',
    'Product Description',
    'productDescription',
    'full_description',
    'Full Description',
    'fullDescription',
    'details',
    'Details',
  ]);

  return description ? stripHtml(description) : '';
}

function isRefurbishedProduct(hit) {
  const exactGroup = String(
    getValue(hit, ['condition_group', 'conditionGroup'], '')
  ).toLowerCase();

  if (exactGroup === 'refurbished') return true;
  if (exactGroup === 'new') return false;

  const imageUrl = String(
    getValue(hit, PRODUCT_IMAGE_KEYS, '')
  ).toLowerCase();

  if (imageUrl.includes('2nds')) {
    return true;
  }

  const text = [
    hit.condition_group,
    hit.condition,
    hit.product_condition,
    hit.source,
    hit.Source,
    hit.type,
    hit.Type,
    hit.category,
    hit.Category,
    hit.name,
    hit.Name,
    hit.title,
    hit.Title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /2nds/.test(
    text
  );
}

function CarouselHeader({ items, translations }) {
  if (!items || items.length < 1) return null;

  return <h3 className="carouselHeader">{translations.title}</h3>;
}

function PriceDisplay({ priceInfo }) {
  if (priceInfo.current == null) return <>Price N/A</>;

  if (priceInfo.original != null) {
    return (
      <>
        <span className="search-card__price-current">${priceInfo.current}</span>{' '}
        <span className="search-card__price-original">${priceInfo.original}</span>
      </>
    );
  }

  return <>${priceInfo.current}</>;
}

function RecommendProductCard({ item }) {
  const imageUrl = getValue(item, PRODUCT_IMAGE_KEYS);
  const name = getValue(item, ['name', 'Name', 'title', 'Title'], 'Unnamed Product');
  const priceInfo = getPriceInfo(item);

  return (
    <div className="productContainer">
      {imageUrl ? (
        <img className="productImage" src={imageUrl} alt={stripHtml(name)} />
      ) : (
        <div className="productImage productImage--empty">No Image</div>
      )}
      <p>{stripHtml(name)}</p>
      <p>
        <PriceDisplay priceInfo={priceInfo} />
      </p>
    </div>
  );
}

function MainProductView({ item }) {
  const imageUrl = getValue(item, PRODUCT_IMAGE_KEYS);
  const name = getValue(item, ['name', 'Name', 'title', 'Title'], 'Unnamed Product');
  const priceInfo = getPriceInfo(item);
  const productUrl = getProductUrl(item);
  const stock = getStockStatus(item);
  const description = getProductDescription(item);

  return (
    <div className="product-modal__main">
      <div className="search-card__imageBox">
        {imageUrl ? (
          <img className="search-card__image" src={imageUrl} alt={stripHtml(name)} />
        ) : (
          <div className="search-card__noImage">No Image</div>
        )}
      </div>

      <div className="product-modal__details">
        <h2 className="product-modal__name">{stripHtml(name)}</h2>
        <div className="search-card__price">
          <PriceDisplay priceInfo={priceInfo} />
        </div>
        <div className={`search-card__stock ${stock.className}`}>{stock.label}</div>
        <div className="product-modal__description">
          <h3 className="product-modal__sectionTitle">Description</h3>
          <p>{description || 'No description available.'}</p>
        </div>
        <a className="product-modal__link" href={productUrl} target="_blank" rel="noreferrer">
          View full details
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const indexName = process.env.ALGOLIA_INDEX_NAME;
  const [recommendClient, setRecommendClient] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [hasQuery, setHasQuery] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);

  useEffect(() => {
    const { algoliasearch, instantsearch } = window;

    const algoliaAppId = process.env.ALGOLIA_APP_ID || '';
    const algoliaSearchApiKey =
      process.env.ALGOLIA_SEARCH_API_KEY || process.env.ALGOLIA_ADMIN_API_KEY || '';

    const configWarning =
      !process.env.ALGOLIA_SEARCH_API_KEY && process.env.ALGOLIA_ADMIN_API_KEY
        ? 'Using ALGOLIA_ADMIN_API_KEY as a temporary fallback so the UI can load. Replace it with a search-only key in .env for production.'
        : '';

    if (!algoliaAppId || !algoliaSearchApiKey) {
      const resultsContainer = document.querySelector('.search-panel__results');

      if (resultsContainer && !document.querySelector('.config-warning')) {
        const notice = document.createElement('div');
        notice.className = 'config-warning';
        notice.textContent =
          'Missing Algolia config. Add ALGOLIA_APP_ID and ALGOLIA_SEARCH_API_KEY to .env.';
        resultsContainer.prepend(notice);
      }

      throw new Error(
        'Missing ALGOLIA_APP_ID or ALGOLIA_SEARCH_API_KEY/ALGOLIA_ADMIN_API_KEY.'
      );
    }

    const searchClient = algoliasearch(algoliaAppId, algoliaSearchApiKey);
    setRecommendClient(searchClient);

    const search = instantsearch({
      indexName,
      searchClient,
      insights: true,
      future: { preserveSharedStateOnUnmount: true },
    });
    function renderProductCard(hit) {
      const imageUrl = getValue(hit, PRODUCT_IMAGE_KEYS);
      const productUrl = getProductUrl(hit);
      const sku = getValue(hit, ['sku', 'SKU', 'Sku']);
      const name = getHighlightedValue(
        hit,
        ['name', 'Name', 'title', 'Title'],
        'Unnamed Product'
      );

      const priceInfo = getPriceInfo(hit);
      const price =
        priceInfo.current == null
          ? 'Price N/A'
          : priceInfo.original != null
          ? `<span class="search-card__price-current">$${escapeHtml(
              priceInfo.current
            )}</span> <span class="search-card__price-original">$${escapeHtml(
              priceInfo.original
            )}</span>`
          : `$${escapeHtml(priceInfo.current)}`;

      const stock = getStockStatus(hit);

      return `
        <div
          class="search-card"
          role="link"
          tabindex="0"
          data-object-id="${escapeHtml(hit.objectID)}"
          data-product-url="${escapeHtml(productUrl)}"
        >
          <div class="search-card__imageBox">
            ${
              imageUrl
                ? `
                  <img
                    class="search-card__image"
                    src="${escapeHtml(imageUrl)}"
                    alt="${escapeHtml(
                      stripHtml(
                        getValue(hit, ['name', 'Name', 'title', 'Title'], 'Product')
                      )
                    )}"
                    loading="lazy"
                    onerror="this.style.display='none'"
                  />
                `
                : `<div class="search-card__noImage">No Image</div>`
            }
          </div>

          <div class="search-card__body">
            ${sku ? `<div class="search-card__sku">SKU: ${escapeHtml(sku)}</div>` : ''}

            <h3 class="search-card__name">${name}</h3>



            <div class="search-card__price">${price}</div>

            <div class="search-card__actions">
              <div class="search-card__stock ${stock.className}">
                ${stock.label}
              </div>
              <button
                type="button"
                class="search-card__viewProduct"
                data-object-id="${escapeHtml(hit.objectID)}"
              >
                View Product
              </button>
            </div>
          </div>
        </div>
      `;
    }

    function renderCardsGrid(products) {
      if (!products.length) {
        return `<div class="search-empty-cell">Not found</div>`;
      }

      // Show 8 cards per section in a fixed 4x2 grid instead of a
      // horizontal scroller.
      return `<div class="search-cards-row">${products
        .slice(0, HITS_PER_PAGE)
        .map(renderProductCard)
        .join('')}</div>`;
    }
    let keywordsPanelRequestId = 0;

    async function fetchPopularSearches(limit = POPULAR_SEARCH_LIMIT) {
      if (
        !QUERY_SUGGESTIONS_INDEX_NAME ||
        QUERY_SUGGESTIONS_INDEX_NAME === '_query_suggestions'
      ) {
        console.warn(
          '[Popular Searches] No valid Query Suggestions index name configured. ' +
            'Set ALGOLIA_QUERY_SUGGESTIONS_INDEX_NAME (or ALGOLIA_INDEX_NAME) in .env.'
        );
        return [];
      }

      try {
        const { results } = await searchClient.search([
          {
            indexName: QUERY_SUGGESTIONS_INDEX_NAME,
            params: { query: '', hitsPerPage: limit },
          },
        ]);

        const hits = results?.[0]?.hits || [];

        return hits
          .map((hit) => getValue(hit, ['query', 'Query'], ''))
          .filter(Boolean);
      } catch (e) {
        console.error(
          `[Popular Searches] Failed to fetch from index "${QUERY_SUGGESTIONS_INDEX_NAME}":`,
          e
        );
        return [];
      }
    }

    function triggerSearch(keyword) {
      const input = document.querySelector('#searchbox input');
      if (!input) return;

      input.value = keyword;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function renderBrandSection() {
      return `
        <div class="brands-section">
          <div class="brands-section__title">Recommended Brands</div>
          <div class="brands-grid">
            ${BRAND_LINKS.map((brand) => `
                <a
                  class="brand-tile"
                  href="${escapeHtml(brand.url)}"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="${escapeHtml(brand.name)}"
                >
                  <img
                    class="brand-tile__logo-img"
                    src="${escapeHtml(brand.logo)}"
                    alt="${escapeHtml(brand.name)} logo"
                    loading="lazy"
                  />
                </a>
              `).join('')}
          </div>
        </div>
      `;
    }

    // Matches the "Trending searches" pill design: bold heading with a
    // trending-up arrow, and a two-column grid of rounded pill buttons
    // each prefixed with a small search icon. Styled inline so it renders
    // correctly regardless of what's (or isn't) in app.css.
    async function renderKeywordsPanel() {
      const panel = document.getElementById('keywords-panel');
      if (!panel) return;

      const requestId = ++keywordsPanelRequestId;
      panel.innerHTML = `
        <div class="keywords-panel__sectionsRow">
          <section class="keywords-panel__section keywords-panel__section--trending">
            <div class="keywords-panel__title" style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:16px;color:#111827;margin-bottom:14px;">
              <img src="${growthIcon}" alt="Trending" style="width:20px;height:20px;flex-shrink:0;" />
              <div class="brands-section__title">Trending searches</div>
            </div>
            <div class="keywords-panel__empty">Loading…</div>
          </section>
          <section class="keywords-panel__section keywords-panel__section--brands">
            ${renderBrandSection()}
          </section>
        </div>
      `;

      const keywords = await fetchPopularSearches();
      if (requestId !== keywordsPanelRequestId) return;

      panel.innerHTML = `
        <div class="keywords-panel__sectionsRow">
          <section class="keywords-panel__section keywords-panel__section--trending">
            <div class="keywords-panel__title" style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:16px;color:#111827;margin-bottom:14px;">
              <img src="${growthIcon}" alt="Trending" style="width:20px;height:20px;flex-shrink:0;" />
               <div class="brands-section__title">Trending searches</div>
            </div>
            ${
              keywords.length
                ? `
                  <ul class="keywords-panel__list" style="list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0;padding:0;">
                    ${keywords
                      .map(
                        (keyword) => `
                         <li class="keywords-panel__item">
                          <button
                            type="button"
                            class="keyword-chip"
                            data-keyword="${escapeHtml(keyword)}"
                            style="display:flex;align-items:center;width:100%;border-radius:45px;border:1px solid #e5e7eb;background:#fafafa;font-size:12px;line-height:1.2;color:#374151;cursor:pointer;text-align:left;"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-right:8px; color:#9ca3af;"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <span>${escapeHtml(keyword)}</span>
                          </button>
                        </li>
                        `
                      )
                      .join('')}
                  </ul>
                `
                : `<div class="keywords-panel__empty">No popular searches yet${
                    QUERY_SUGGESTIONS_INDEX_NAME
                      ? ` (index: ${escapeHtml(QUERY_SUGGESTIONS_INDEX_NAME)})`
                      : ''
                  }</div>`
            }
          </section>
          <section class="keywords-panel__section keywords-panel__section--brands">
            ${renderBrandSection()}
          </section>
        </div>
      `;

      panel.querySelectorAll('[data-keyword]').forEach((btn) => {
        btn.addEventListener('click', () => triggerSearch(btn.dataset.keyword));
      });
    }
    const hitsById = new Map();
    let sendHitEvent = () => {};

    const renderGroupedHits = (renderOptions) => {
      const { hits, results, widgetParams, sendEvent } = renderOptions;

      sendHitEvent = sendEvent;

      const container = document.querySelector(widgetParams.container);
      if (!container) return;

      const query = results?.query?.trim();
      setHasQuery(Boolean(query));

      if (!query) {
        container.innerHTML = '';
        return;
      }

      if (!hits.length) {
        container.innerHTML = `<div class="search-empty">No products found</div>`;
        return;
      }

      hitsById.clear();
      hits.forEach((hit) => hitsById.set(hit.objectID, hit));

      const newProducts = [];
      const refurbishedProducts = [];

      hits.forEach((hit) => {
        if (isRefurbishedProduct(hit)) {
          refurbishedProducts.push(hit);
        } else {
          newProducts.push(hit);
        }
      });

      container.innerHTML = `
        <div class="product-section product-section--new">
          <div class="product-section__title">Brand New Products</div>
          <div id="new-products-cell">
            ${renderCardsGrid(newProducts)}
          </div>
        </div>

        <div class="product-section product-section--refurbished">
          <div class="product-section__title">2nDs/Ex-showroom</div>
          <div id="ref-products-cell">
            ${renderCardsGrid(refurbishedProducts)}
          </div>
        </div>
      `;
    };

    const groupedHits = instantsearch.connectors.connectHits(renderGroupedHits);

    search.addWidgets([
      instantsearch.widgets.searchBox({
        container: '#searchbox',
        placeholder: 'Search.....',
        showReset: true,
        showSubmit: true,
      }),

      groupedHits({
        container: '#hits',
      }),

      instantsearch.widgets.configure({
        // Fetch more than HITS_PER_PAGE so that after splitting into
        // New/Refurbished, each section can still independently fill up
        // to a full 8 cards - a plain hitsPerPage: 8 would often leave
        // one section short once split.
        hitsPerPage: HITS_PER_PAGE * HITS_FETCH_MULTIPLIER,
        attributesToHighlight: [
          'name',
          'Name',
          'title',
          'Title',
          'brand',
          'Brand',
          'sku',
          'SKU',
        ],
        highlightPreTag: '<mark>',
        highlightPostTag: '</mark>',
      }),
    ]);

    search.start();
    renderKeywordsPanel();
    const searchPanelEl = document.querySelector('.search-panel');
    const searchInputEl = document.querySelector('#searchbox input');

    function expandSearchPanel() {
      searchPanelEl?.classList.add('is-active');
      setIsSearchActive(true);
    }

    function collapseSearchPanelIfOutside(event) {
      if (searchPanelEl && !searchPanelEl.contains(event.target)) {
        searchPanelEl.classList.remove('is-active');
        setIsSearchActive(false);
      }
    }

    searchInputEl?.addEventListener('focus', expandSearchPanel);
    document.addEventListener('click', collapseSearchPanelIfOutside);
    const hitsContainerEl = document.getElementById('hits');

    function handleCardClick(event) {
      const viewButton = event.target.closest('.search-card__viewProduct');
      if (viewButton && hitsContainerEl?.contains(viewButton)) {
        const hit = hitsById.get(viewButton.dataset.objectId);
        if (!hit) return;
        sendHitEvent('click', hit, 'View Product Clicked');
        event.preventDefault();
        event.stopPropagation();
        setSelectedProduct(hit);
        return;
      }

      const card = event.target.closest('.search-card');
      if (!card || !hitsContainerEl?.contains(card)) return;

      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const hit = hitsById.get(card.dataset.objectId);
      if (!hit) return;
      sendHitEvent('click', hit, 'Product Card Clicked');
      const productUrl = card.dataset.productUrl || getProductUrl(hit);

      if (event.metaKey || event.ctrlKey) {
        window.open(productUrl, '_blank', 'noreferrer');
        return;
      }

      window.location.href = productUrl;
    }

    function handleCardKeyDown(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      const viewButton = event.target.closest('.search-card__viewProduct');
      if (viewButton && hitsContainerEl?.contains(viewButton)) return;

      const card = event.target.closest('.search-card');
      if (!card || !hitsContainerEl?.contains(card)) return;

      const hit = hitsById.get(card.dataset.objectId);
      if (!hit) return;

      event.preventDefault();
      sendHitEvent('click', hit, 'Product Card Keyboard Opened');
      const productUrl = card.dataset.productUrl || getProductUrl(hit);
      window.location.href = productUrl;
    }

    hitsContainerEl?.addEventListener('click', handleCardClick);
    hitsContainerEl?.addEventListener('keydown', handleCardKeyDown);

    if (configWarning) {
      const resultsContainer = document.querySelector('.search-panel__results');

      if (resultsContainer && !document.querySelector('.config-warning')) {
        const notice = document.createElement('div');
        notice.className = 'config-warning';
        notice.textContent = configWarning;
        resultsContainer.prepend(notice);
      }
    }

    return () => {
      searchInputEl?.removeEventListener('focus', expandSearchPanel);
      document.removeEventListener('click', collapseSearchPanelIfOutside);
      hitsContainerEl?.removeEventListener('click', handleCardClick);
      hitsContainerEl?.removeEventListener('keydown', handleCardKeyDown);
      search.dispose();
    };
  }, []);

  return (
    <>
      <main className="search-page">

        <section className="search-panel">
          <div className="search-bar-row">

            <div id="searchbox" />
            <ApiMessenger />

          </div>

          <div
            className="search-panel__results"
            style={{ display: isSearchActive ? undefined : 'none' }}
          >
            <div className="search-layout">
              <aside id="keywords-panel" className="keywords-panel" />

              <div className="results-panel">
                {!hasQuery && recommendClient && indexName && (
                  <InstantSearch
                    searchClient={recommendClient}
                    indexName={indexName}
                    insights={true}
                  >
                    <TrendingItems
                      limit={HITS_PER_PAGE}
                      headerComponent={CarouselHeader}
                      itemComponent={RecommendProductCard}
                      translations={{ title: 'Trending Now' }}
                    />
                  </InstantSearch>
                )}
                <div id="hits" style={{ display: hasQuery ? undefined : 'none' }} />
              </div>
            </div>
          </div>
        </section>

        {selectedProduct && (
          <div
            className="product-modal-overlay"
            onClick={() => setSelectedProduct(null)}
          >
            <div className="product-modal" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="product-modal__close"
                aria-label="Close"
                onClick={() => setSelectedProduct(null)}
              >
                &times;
              </button>

              <MainProductView item={selectedProduct} />

              {recommendClient && indexName && (
                <InstantSearch
                  searchClient={recommendClient}
                  indexName={indexName}
                  insights={true}
                >
                  <LookingSimilar
                    objectIDs={[selectedProduct.objectID]}
                    limit={4}
                    headerComponent={CarouselHeader}
                    itemComponent={RecommendProductCard}
                    translations={{ title: 'Looking Similar' }}
                  />
                  <FrequentlyBoughtTogether
                    objectIDs={[selectedProduct.objectID]}
                    limit={4}
                    headerComponent={CarouselHeader}
                    itemComponent={RecommendProductCard}
                    translations={{ title: 'Frequently Bought Together' }}
                  />
                </InstantSearch>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
