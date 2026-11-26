/* Shared constants. Loaded by the service worker, the content script, the offscreen
 * document and the popup. Selectors and URLs that depend on list.am / bid.cars live here. */
var LAVC_CONFIG = {
  VIN_RE: /^[A-HJ-NPR-Z0-9]{17}$/,

  CACHE_TTL_FOUND_MS: 30 * 24 * 3600 * 1000,
  CACHE_TTL_NOT_FOUND_MS: 3 * 24 * 3600 * 1000,
  MIN_GAP_BETWEEN_LOOKUPS_MS: 2500,
  FETCH_TIMEOUT_MS: 12000,
  HELPER_TAB_TIMEOUT_MS: 45000,
  HELPER_RESULTS_WAIT_MS: 12000,

  BIDCARS: {
    origin: "https://bid.cars",
    vinLotUrl: (vin) => `https://bid.cars/app/search/en/vin-lot/${encodeURIComponent(vin)}/false`,
    searchApiUrl: (vin) =>
      `https://bid.cars/app/search/request?search-type=typing&query=${encodeURIComponent(vin)}`,
    archivedSearchApiUrl: (vin) =>
      `https://bid.cars/app/search/archived/request?search-type=typing&query=${encodeURIComponent(vin)}`,
    searchPageUrl: (vin) =>
      `https://bid.cars/en/search/results?search-type=typing&query=${encodeURIComponent(vin)}`,
    lotUrl: (lotId) => `https://bid.cars/en/lot/${lotId}`,
    lotIdRe: /\/lot\/([01]-\d{5,10})(?:[/?#]|$)/,
    lotPageUrlRe: /^https:\/\/bid\.cars\/[a-z]{2}\/lot\/[01]-\d+/,
  },

  LISTAM: {
    origin: "https://www.list.am",
    itemIdRe: /^\d{1,12}$/,
    itemPathRe: /^\/(?:[a-z]{2}\/)?item\/(\d{1,12})\/?$/,
    itemMatches: ["https://www.list.am/item/*", "https://www.list.am/*/item/*"],
    itemUrl: (id) => `https://www.list.am/item/${id}`,
    itemContent: "#pcontent .vi",
    maxListingBytes: 4 * 1024 * 1024,
    pageGrid: "#main .pmain",
    sellerColumn: "#main .pmain > #pmenu",
    saveStar: "#sstar",
    galleryWrapper: "#pcontent .vi > .vit",
    gallery: '[data-testid="listing-image-gallery"]',
    attrTile: ".at3",
    attrValue: ".attr-value",
    vinIcon: '.attr-icon[style*="vin-icon"]',
    mileageIcon: '.attr-icon[style*="mileage"]',
    conditionIcon: '.attr-icon[style*="general-condition"]',
    galleryInitRe: /po\d+\.init\(\s*'#po\d+'\s*,\s*\{\s*img\s*:\s*(\[[^\]]*\])/,
    notDamagedTexts: ["չվթարված", "небитый", "не битый", "not damaged", "undamaged"],
  },
};
