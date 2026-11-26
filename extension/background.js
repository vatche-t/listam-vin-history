importScripts("config.js", "listing.js");

const C = LAVC_CONFIG;
const B = C.BIDCARS;
const L = C.LISTAM;

const inflight = new Map();
const tabStatus = new Map();
let queue = Promise.resolve();
let lastLookupAt = 0;

/* ---------------------------------------------------------------- cache */

async function cacheGet(vin) {
  const key = "vin:" + vin;
  const entry = (await chrome.storage.local.get(key))[key];
  if (!entry) return null;
  // Older cached matches could take the VIN from the page URL alone.
  if (entry.status === "found" && (entry.lot?.vinVerified !== true || entry.lot.vin !== vin)) return null;
  const ttl = entry.status === "found" ? C.CACHE_TTL_FOUND_MS : C.CACHE_TTL_NOT_FOUND_MS;
  return Date.now() - entry.checkedAt < ttl ? entry : null;
}

async function cacheSet(result) {
  if (result.status !== "found" && result.status !== "not_found") return;
  await chrome.storage.local.set({ ["vin:" + result.vin]: result });
}

async function cacheClear() {
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith("vin:")));
}

/* ---------------------------------------------------------------- lookup entry point */

function lookup(vin, force) {
  const current = inflight.get(vin);
  if (current) return force ? current.then((result) => result.fromCache ? lookup(vin, true) : result) : current;
  const p = (async () => {
    if (!force) {
      const cached = await cacheGet(vin);
      if (cached) return { ...cached, fromCache: true };
    }
    const result = await enqueue(() => resolveVin(vin));
    result.vin = vin;
    result.checkedAt = Date.now();
    await cacheSet(result);
    return result;
  })().finally(() => inflight.delete(vin));
  inflight.set(vin, p);
  return p;
}

function enqueue(task) {
  const run = queue.then(async () => {
    const wait = lastLookupAt + C.MIN_GAP_BETWEEN_LOOKUPS_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastLookupAt = Date.now();
    }
  });
  queue = run.catch(() => {});
  return run;
}

/* ---------------------------------------------------------------- resolution pipeline */

async function resolveVin(vin) {
  let lotRef = null;
  let blocked = false;

  // Step A: the site's own VIN -> lot lookup.
  const a = await fetchText(B.vinLotUrl(vin), true);
  if (a.challenge) blocked = true;
  else if (a.ok) lotRef = extractLotRef(a.text, a.url, vin);

  // Step B: JSON search over current, then archived auctions.
  if (!lotRef && !blocked) {
    for (const url of [B.searchApiUrl(vin), B.archivedSearchApiUrl(vin)]) {
      const r = await fetchText(url, true);
      if (r.challenge) {
        blocked = true;
        break;
      }
      if (r.ok) lotRef = lotRefFromSearchJson(r.text, vin);
      if (lotRef) break;
    }
  }

  // Step D: fetch and parse the lot page.
  if (lotRef && !blocked) {
    const page = await fetchText(lotRef.url || B.lotUrl(lotRef.id), false);
    if (page.ok && !page.challenge) {
      const lot = await parseInOffscreen(page.text, vin, page.url);
      if (lot && !lot.mismatch) return foundResult(lot, "lot-page");
    }
    if (page.status === 410) lotRef = null;
  }

  // Step C: hidden helper tab that repeats the manual search.
  return helperTabLookup(vin, lotRef ? lotRef.url || B.lotUrl(lotRef.id) : null);
}

function foundResult(lot, source) {
  const otherLots = (lot.history || []).filter((h) => h.id !== lot.id);
  delete lot.history;
  return { status: "found", source, lot, otherLots };
}

async function fetchText(url, asApi) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), C.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      credentials: "include",
      signal: ctrl.signal,
      headers: asApi
        ? { Accept: "application/json, text/plain, */*", "X-Requested-With": "XMLHttpRequest" }
        : { Accept: "text/html,application/xhtml+xml" },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text, challenge: isChallenge(res.status, text) };
  } catch (e) {
    return { ok: false, status: 0, url, text: "", error: String(e), challenge: false };
  } finally {
    clearTimeout(timer);
  }
}

function isChallenge(status, text) {
  if (status !== 403 && status !== 503 && status !== 429) return false;
  return /just a moment|cf-chl|challenge-platform|attention required/i.test(text.slice(0, 20000));
}

function extractLotRef(text, finalUrl, vin) {
  if (B.lotPageUrlRe.test(finalUrl)) return { url: finalUrl, id: finalUrl.match(B.lotIdRe)?.[1] };
  const body = (text || "").trim();
  if (!body || body.startsWith("<!DOCTYPE") || body.startsWith("<html")) return null;

  const urlMatch = body.replace(/\\\//g, "/").match(/(?:https:\/\/bid\.cars)?\/[a-z]{2}\/lot\/([01]-\d{5,10})(?:\/[^"'\s<>]*)?/);
  if (urlMatch) {
    const path = urlMatch[0].startsWith("http") ? urlMatch[0] : B.origin + urlMatch[0];
    return { id: urlMatch[1], url: path };
  }
  try {
    const found = findInJson(JSON.parse(body), (k, v) => typeof v === "string" && /^[01]-\d{5,10}$/.test(v));
    if (found) return { id: found, url: B.lotUrl(found) };
  } catch (_) {}
  const bare = body.match(/^"?([01]-\d{5,10})"?$/);
  return bare ? { id: bare[1], url: B.lotUrl(bare[1]) } : null;
}

function lotRefFromSearchJson(text, vin) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    return null;
  }
  const matches = [];
  walkJson(data, (obj) => {
    if (obj && typeof obj === "object" && typeof obj.vin === "string" && obj.vin.toUpperCase() === vin) {
      const id = [obj.lot, obj.lot_id, obj.id].find((x) => typeof x === "string" && /^[01]-\d+$/.test(x));
      const url = typeof obj.url === "string" && obj.url.includes("/lot/") ? obj.url : id ? B.lotUrl(id) : null;
      if (url) matches.push({ id: id || url.match(B.lotIdRe)?.[1], url: url.startsWith("http") ? url : B.origin + url, date: obj.sale_date || obj.auction_date || "" });
    }
  });
  matches.sort((x, y) => String(y.date).localeCompare(String(x.date)));
  return matches[0] || null;
}

function walkJson(node, visit, depth = 0) {
  if (depth > 8 || node === null || typeof node !== "object") return;
  visit(node);
  for (const v of Array.isArray(node) ? node : Object.values(node)) walkJson(v, visit, depth + 1);
}

function findInJson(node, pred) {
  let hit = null;
  walkJson(node, (obj) => {
    if (hit || Array.isArray(obj)) return;
    for (const [k, v] of Object.entries(obj)) if (!hit && pred(k, v)) hit = v;
  });
  return hit;
}

/* ---------------------------------------------------------------- offscreen parsing */

let creatingOffscreen = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({ url: "offscreen.html", reasons: ["DOM_PARSER"], justification: "Parse bid.cars lot pages" })
      .finally(() => (creatingOffscreen = null));
  }
  await creatingOffscreen;
}

async function parseInOffscreen(html, vin, url) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "parseLot", html, vin, url });
  return res && res.ok ? res.lot : null;
}

/* ---------------------------------------------------------------- helper tab */

let helperBusy = Promise.resolve();

function helperTabLookup(vin, directUrl) {
  const run = helperBusy.then(() => runHelperTab(vin, directUrl));
  helperBusy = run.catch(() => {});
  return run;
}

function runHelperTab(vin, directUrl) {
  return new Promise((resolve) => {
    let tabId = null;
    let done = false;
    let probes = 0;
    let sawChallenge = false;
    let extracting = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish(
        sawChallenge
          ? { status: "blocked", error: "bid.cars asks for a human check (Cloudflare)." }
          : { status: "error", error: "Timed out waiting for bid.cars." }
      );
    }, C.HELPER_TAB_TIMEOUT_MS);

    const onRemoved = (id) => {
      if (id === tabId) {
        tabId = null;
        finish({ status: "error", error: "The bid.cars helper tab was closed." });
      }
    };

    const onUpdated = async (id, info, tab) => {
      if (id !== tabId || done || info.status !== "complete" || !tab.url) return;

      if (B.lotPageUrlRe.test(tab.url)) {
        if (extracting) return;
        extracting = true;
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ["lotparser.js"] });
          const [{ result: lot }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: (v) => {
              const t = document.title || "";
              if (/just a moment|attention required/i.test(t)) return { challenge: true };
              return parseBidCarsLot(document, v);
            },
            args: [vin],
          });
          if (lot && lot.challenge) sawChallenge = true;
          else if (lot && lot.mismatch) finish({ status: "not_found", source: "helper-tab" });
          else if (lot && lot.id) finish(foundResult(lot, "helper-tab"));
        } catch (_) {
          // Page navigated while injecting; the next "complete" event retries.
        } finally {
          extracting = false;
        }
        return;
      }

      if (probes >= 2) return;
      probes += 1;
      try {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: probeSearchPage,
          args: [vin, C.HELPER_RESULTS_WAIT_MS, probes === 1],
        });
        if (done || !result) return;
        if (result.challenge) {
          sawChallenge = true;
          probes -= 1;
        } else if (result.link) {
          chrome.tabs.update(tabId, { url: result.link });
        } else if (result.none) {
          finish({ status: "not_found", source: "helper-tab" });
        }
      } catch (_) {
        // The page navigated away during the probe (e.g. bid.cars redirected to the lot).
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.create({ url: directUrl || B.searchPageUrl(vin), active: false }, (tab) => {
      if (done) {
        chrome.tabs.remove(tab.id).catch(() => {});
        return;
      }
      tabId = tab.id;
      chrome.tabs.update(tabId, { muted: true, autoDiscardable: false }).catch(() => {});
    });
  });
}

/* Runs inside the bid.cars helper tab. Must be self-contained. */
async function probeSearchPage(vin, waitMs, typeIntoSearch) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isChallenge = () =>
    /just a moment|attention required/i.test(document.title) ||
    !!document.querySelector('#challenge-form, #challenge-running, .cf-turnstile, [name="cf-turnstile-response"]');
  const findLink = () =>
    [...document.querySelectorAll('a[href*="/lot/"]')].find(
      (a) => a.href.toUpperCase().includes(vin) || a.textContent.toUpperCase().includes(vin)
    );

  const waitForLink = async (ms) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (isChallenge()) return { challenge: true };
      if (/\/lot\/[01]-\d+/.test(location.pathname)) return { lot: location.href };
      const a = findLink();
      if (a) return { link: a.href };
      await sleep(400);
    }
    return null;
  };

  const first = await waitForLink(waitMs / 2);
  if (first) return first;

  const input = document.querySelector("#search_field");
  if (typeIntoSearch && input) {
    input.focus();
    input.value = vin;
    for (const type of ["input", "keyup", "change"]) input.dispatchEvent(new Event(type, { bubbles: true }));
    const enter = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true };
    input.dispatchEvent(new KeyboardEvent("keydown", enter));
    input.dispatchEvent(new KeyboardEvent("keyup", enter));
    document.querySelector("#submit_search")?.click();
    const second = await waitForLink(waitMs);
    if (second) return second;
  }
  return { none: true };
}

/* ---------------------------------------------------------------- images */

async function fetchImageAsDataUrl(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const blob = await res.blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}

/* ---------------------------------------------------------------- MCP bridge */

let mcpPort;
let mcpState = "disconnected";

async function openListing(itemId) {
  const tabs = await chrome.tabs.query({ url: L.itemMatches });
  for (const tab of tabs) {
    if (!Number.isInteger(tab.id)) continue;
    const url = typeof tab.url === "string" ? new URL(tab.url) : null;
    if (url?.origin !== L.origin || LAVC_LISTING.itemId(url.pathname) !== itemId) continue;
    const listing = await chrome.tabs.sendMessage(tab.id, { type: "readMcpListing", itemId }, { frameId: 0 }).catch(() => null);
    if (listing && listing.status !== "listing_unavailable") return listing;
  }
}

async function readListing(itemId, port) {
  let html;
  try {
    const listing = await openListing(itemId);
    if (listing || mcpPort !== port) return listing;
    const response = await fetch(L.itemUrl(itemId), {
      credentials: "omit", redirect: "error", signal: AbortSignal.timeout(C.FETCH_TIMEOUT_MS),
    });
    if (response.ok && response.body && response.headers.get("content-type")?.includes("text/html")) {
      const decoder = new TextDecoder();
      let bytes = 0;
      html = "";
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > L.maxListingBytes || mcpPort !== port) return { status: "listing_unavailable" };
        html += decoder.decode(chunk, { stream: true });
      }
      html += decoder.decode();
    }
  } catch (_) {
    return { status: "listing_unavailable" };
  }
  if (!html || mcpPort !== port) return { status: "listing_unavailable" };
  await ensureOffscreen();
  const parsed = await chrome.runtime.sendMessage({ target: "offscreen", type: "parseListing", html });
  return parsed?.ok && parsed.listing ? parsed.listing : { status: "error" };
}

async function checkListing(itemId, port) {
  const listing = await readListing(itemId, port);
  if (mcpPort !== port) return;
  if (listing.status !== "ok" || typeof listing.vin !== "string" || !C.VIN_RE.test(listing.vin)) return { itemId, listing };
  const auction = await lookup(listing.vin, false).catch(() => ({ status: "error", vin: listing.vin }));
  const comparison = auction.status === "found" && auction.lot?.vin === listing.vin
    ? LAVC_LISTING.compare(listing, auction.lot) : undefined;
  return { itemId, listing, auction, comparison };
}

function setMcpState(state) {
  mcpState = state;
  chrome.runtime.sendMessage({ type: "mcpStateChanged", state }).catch(() => {});
}

function connectMcp() {
  if (mcpPort) return;
  try {
    const port = chrome.runtime.connectNative("io.github.mysticcode99.listam_vin_history");
    mcpPort = port;
    setMcpState("connecting");
    port.onMessage.addListener(async (msg) => {
      if (mcpPort !== port) return;
      if (msg?.type === "ready") {
        if (msg.listingHandshake === true) {
          try { port.postMessage({ type: "listingCapability" }); } catch (_) {}
        } else setMcpState("connected");
        return;
      }
      if (msg?.type === "listingReady") return setMcpState("connected");
      if (mcpState !== "connected" || typeof msg?.id !== "string") return;

      let result;
      if (msg.type === "lookup" && typeof msg.vin === "string" && C.VIN_RE.test(msg.vin)) {
        result = await lookup(msg.vin, false).catch(() => ({ status: "error", vin: msg.vin }));
      } else if (msg.type === "checkListing" && typeof msg.itemId === "string" && L.itemIdRe.test(msg.itemId)) {
        result = await checkListing(msg.itemId, port).catch(() => ({ itemId: msg.itemId, listing: { status: "error" } }));
      } else return;
      if (mcpPort === port) {
        try {
          port.postMessage({ type: "lookupResult", id: msg.id, result });
        } catch (_) {} // The browser can close the port before onDisconnect arrives.
      }
    });
    port.onDisconnect.addListener(() => {
      const unavailable = !!chrome.runtime.lastError || mcpState === "connecting";
      if (mcpPort !== port) return;
      mcpPort = undefined;
      setMcpState(unavailable ? "unavailable" : "disconnected");
    });
  } catch (_) {
    setMcpState("unavailable");
  }
}

/* ---------------------------------------------------------------- badge + messages */

const BADGES = {
  loading: { text: "…", color: "#888888" },
  found: { text: "!", color: "#d93025" },
  not_found: { text: "✓", color: "#188038" },
  no_vin: { text: "–", color: "#9aa0a6" },
  invalid_vin: { text: "?", color: "#f29900" },
  blocked: { text: "!", color: "#f29900" },
  error: { text: "×", color: "#f29900" },
  unsupported: { text: "", color: "#9aa0a6" },
};

function setTabStatus(tabId, status) {
  tabStatus.set(tabId, status);
  const b = BADGES[status.status] || { text: "", color: "#888" };
  chrome.action.setBadgeText({ tabId, text: b.text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: b.color }).catch(() => {});
}

chrome.tabs.onRemoved.addListener((id) => tabStatus.delete(id));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === "offscreen") return false;
  const tabId = sender.tab?.id;

  switch (msg.type) {
    case "mcpStatus":
    case "mcpConnect":
    case "mcpDisconnect":
      if (sender.url !== chrome.runtime.getURL("popup.html")) return false;
      if (msg.type === "mcpConnect") connectMcp();
      if (msg.type === "mcpDisconnect") {
        const port = mcpPort;
        mcpPort = undefined;
        port?.disconnect();
        setMcpState("disconnected");
      }
      sendResponse(mcpState);
      return false;
    case "lookup":
      lookup(msg.vin, !!msg.force).then(sendResponse, (e) =>
        sendResponse({ status: "error", vin: msg.vin, error: String(e) })
      );
      return true;
    case "pageStatus":
      if (tabId !== undefined) setTabStatus(tabId, msg.status);
      return false;
    case "fetchImage":
      fetchImageAsDataUrl(msg.url).then(
        (dataUrl) => sendResponse({ ok: true, dataUrl }),
        (e) => sendResponse({ ok: false, error: String(e) })
      );
      return true;
    case "getTabStatus":
      sendResponse(tabStatus.get(msg.tabId) || null);
      return false;
    case "clearCache":
      cacheClear().then(() => sendResponse({ ok: true }));
      return true;
    default:
      return false;
  }
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
