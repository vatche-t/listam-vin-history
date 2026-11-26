(() => {
  if (window.__lavcLoaded) return;
  window.__lavcLoaded = true;

  const C = LAVC_CONFIG;
  const L = C.LISTAM;
  const Listing = LAVC_LISTING;

  const state = {
    vin: null,
    listamPhotos: [],
    split: null,
    panelRoot: null,
    pill: null,
    result: null,
    activeLot: null,
    settings: { splitRatio: 0.5, manualVinInput: false },
  };

  /* ------------------------------------------------------------ page reading */

  function listamPhotos() {
    for (const s of document.scripts) {
      const m = s.textContent.match(L.galleryInitRe);
      if (m) {
        try {
          return JSON.parse(m[1]).map((u) => (u.startsWith("//") ? "https:" + u : u));
        } catch (_) {}
      }
    }
    return [...document.querySelectorAll(`${L.gallery} img[src]`)].map((i) => i.src);
  }

  /* ------------------------------------------------------------ messaging */

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          void chrome.runtime.lastError;
          resolve(res);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function reportStatus(status, extra = {}) {
    send({ type: "pageStatus", status: { status, vin: state.vin, ...extra } });
  }

  /* ------------------------------------------------------------ layout */

  function buildSplit(galleryWrapper) {
    const split = document.createElement("div");
    split.className = "lavc-split";
    split.dataset.state = "loading";

    const left = document.createElement("div");
    left.className = "lavc-col lavc-col--listam";
    const leftTitle = document.createElement("div");
    leftTitle.className = "lavc-col-title";
    leftTitle.textContent = `list.am · ${state.listamPhotos.length || "?"} photos`;

    const splitter = document.createElement("div");
    splitter.className = "lavc-splitter";
    splitter.title = "Drag to resize";

    const right = document.createElement("div");
    right.className = "lavc-col lavc-col--history";
    right.id = "lavc-history";
    const host = document.createElement("div");
    right.appendChild(host);

    state.inlineAnchor = document.createComment("lavc-gallery-anchor");
    galleryWrapper.parentNode.insertBefore(state.inlineAnchor, galleryWrapper);
    galleryWrapper.parentNode.insertBefore(split, state.inlineAnchor);
    left.append(leftTitle, galleryWrapper);
    split.append(left, splitter, right);

    applyRatio(split, state.settings.splitRatio);
    enableSplitterDrag(split, splitter);

    state.split = split;
    state.pageGrid = document.querySelector(L.pageGrid);
    state.panelRoot = host.attachShadow({ mode: "open" });
    new ResizeObserver(() => alignSaveStar()).observe(split);
  }

  /* "wide": photo block spans the whole page grid above the car info and seller columns.
   * "inline": list.am's original position, inside the content column. */
  function placeSplit(mode) {
    const { split, pageGrid, inlineAnchor } = state;
    if (mode === "wide" && pageGrid) {
      if (split.parentNode !== pageGrid) pageGrid.prepend(split);
      pageGrid.classList.add("lavc-layout");
    } else {
      if (split.nextSibling !== inlineAnchor) inlineAnchor.parentNode.insertBefore(split, inlineAnchor);
      pageGrid?.classList.remove("lavc-layout");
    }
    alignSaveStar();
  }

  /* list.am's "save" heart is absolutely positioned in #main next to the title in #pmenu, and
   * its styles only apply there, so shift it down with #pmenu instead of moving it. */
  let starBaseTop = null;
  function alignSaveStar() {
    const star = document.querySelector(L.saveStar);
    const sellerColumn = document.querySelector(L.sellerColumn);
    if (!star || !sellerColumn) return;
    const wide = state.pageGrid?.classList.contains("lavc-layout");
    if (!wide) {
      star.style.removeProperty("top");
      return;
    }
    if (starBaseTop === null) {
      const prevTop = star.style.top;
      star.style.removeProperty("top");
      starBaseTop = parseFloat(getComputedStyle(star).top) || 0;
      star.style.top = prevTop;
    }
    const gridTop = state.pageGrid.offsetTop;
    star.style.top = `${starBaseTop + sellerColumn.offsetTop - gridTop}px`;
  }

  function syncGalleryHeight() {
    const gallery = state.split?.querySelector(`.lavc-col--listam ${L.gallery}`);
    const host = state.panelRoot?.host;
    if (gallery && host && gallery.offsetHeight > 100) host.style.setProperty("--lavc-gallery-h", `${gallery.offsetHeight}px`);
  }

  function applyRatio(split, ratio) {
    const r = Math.min(0.7, Math.max(0.3, ratio || 0.5));
    split.style.setProperty("--lavc-left", `${r}fr`);
    split.style.setProperty("--lavc-right", `${1 - r}fr`);
  }

  function enableSplitterDrag(split, splitter) {
    splitter.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      splitter.setPointerCapture(e.pointerId);
      const rect = split.getBoundingClientRect();
      const move = (ev) => {
        state.settings.splitRatio = (ev.clientX - rect.left) / rect.width;
        applyRatio(split, state.settings.splitRatio);
      };
      const up = () => {
        splitter.removeEventListener("pointermove", move);
        splitter.removeEventListener("pointerup", up);
        chrome.storage.local.set({ settings: state.settings });
        notifyResize();
      };
      splitter.addEventListener("pointermove", move);
      splitter.addEventListener("pointerup", up);
    });
  }

  function notifyResize() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      requestAnimationFrame(syncGalleryHeight);
    });
  }

  window.addEventListener("resize", () => requestAnimationFrame(syncGalleryHeight));

  function setSplitState(status) {
    if (!state.split) return;
    const wasWide = state.split.dataset.state === "found";
    const isWide = status === "found";
    state.split.dataset.state = status;
    placeSplit(isWide ? "wide" : "inline");
    if (wasWide !== isWide) notifyResize();
  }

  /* ------------------------------------------------------------ VIN pill */

  function setPill(tile, status, text) {
    if (!tile) return;
    if (!state.pill) {
      state.pill = document.createElement("span");
      tile.querySelector(".attr-info-wraper")?.appendChild(state.pill);
    }
    state.pill.className = `lavc-pill lavc-pill--${status}`;
    state.pill.textContent = text;
    state.pill.onclick = status === "found" ? scrollToAuctionSection : null;
  }

  /* ------------------------------------------------------------ panel rendering */

  const PANEL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #222; }
    .title { font-weight: 500; color: #666; margin: 0 0 6px; display: flex; align-items: center; gap: 6px; }
    .title img { width: 14px; height: 14px; }
    .main { position: relative; width: 100%; aspect-ratio: 4 / 3; height: var(--lavc-gallery-h, auto); background: #111; border-radius: 8px;
            overflow: hidden; cursor: zoom-in; }
    .main img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%;
           border: 0; background: rgba(0,0,0,.45); color: #fff; font-size: 20px; cursor: pointer; }
    .nav:hover { background: rgba(0,0,0,.7); }
    .prev { left: 8px; } .next { right: 8px; }
    .counter { position: absolute; right: 8px; bottom: 8px; background: rgba(0,0,0,.55); color: #fff;
               padding: 1px 8px; border-radius: 10px; font-size: 12px; }
    .thumbs { display: flex; gap: 6px; overflow-x: auto; padding: 8px 0 4px; }
    .thumbs img { width: 64px; height: 48px; object-fit: cover; border-radius: 4px; cursor: pointer; opacity: .6;
                  border: 2px solid transparent; flex: 0 0 auto; background: #eee; }
    .thumbs img.active { opacity: 1; border-color: #1a73e8; }
    .thumbs img.failed { visibility: hidden; }
    .main img.failed { visibility: hidden; }
    .blocked { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; text-align: center;
               padding: 24px; color: #eee; cursor: default; }
    .blocked.on { display: block; padding-top: 30%; }
    .blocked a, .blocked button.link { color: #8ab4f8; }
    .foot { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; color: #777; font-size: 12px; }
    .foot .car { color: #222; font-size: 14px; font-weight: 600; margin-right: auto; }
    a { color: #1a73e8; text-decoration: none; } a:hover { text-decoration: underline; }
    button.link { border: 0; background: none; color: #1a73e8; cursor: pointer; font: inherit; padding: 0; }
    button.link:hover { text-decoration: underline; }
    .spinner { width: 14px; height: 14px; border: 2px solid #c4c7c5; border-top-color: #1a73e8; border-radius: 50%;
               animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .bar { margin-top: 8px; padding: 8px 12px; border-radius: 8px; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
    .bar.neutral { background: #f1f3f4; color: #333; }
    .bar.ok { background: #e6f4ea; color: #0d652d; }
    .bar.amber { background: #fef7e0; color: #7a4f01; }
    .bar.red { background: #fce8e6; color: #a50e0e; }
    .bar input { font: inherit; padding: 3px 6px; width: 200px; border: 1px solid #ccc; border-radius: 4px; text-transform: uppercase; }
    .muted { color: #777; }
    .nophotos { aspect-ratio: 4 / 3; display: flex; align-items: center; justify-content: center; background: #f1f3f4;
                border-radius: 8px; color: #555; text-align: center; padding: 16px; }
  `;

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "className") el.className = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
    return el;
  }

  function renderPanel(...content) {
    const root = state.panelRoot;
    if (!root) return;
    root.replaceChildren(h("style", {}, PANEL_CSS), h("div", { className: "wrap" }, ...content));
  }

  function renderLoading() {
    setSplitState("loading");
    clearAuctionSection();
    linkVin(C.BIDCARS.searchPageUrl(state.vin), "Search this VIN on bid.cars");
    renderBar("neutral", h("span", { className: "spinner" }), h("span", {}, "Looking up ", h("b", {}, state.vin), " on bid.cars…"));
  }

  function searchLink(vin, text) {
    return h("a", { href: C.BIDCARS.searchPageUrl(vin), target: "_blank", rel: "noopener" }, text);
  }

  function recheckButton() {
    return h("button", { className: "link", onclick: () => runLookup(true), title: "Look up again, ignoring the cache" }, "⟳ Re-check");
  }

  function renderBar(kind, ...content) {
    renderPanel(h("div", { className: `bar ${kind}` }, ...content));
  }

  function renderResult(result) {
    state.result = result;
    const vin = state.vin;
    setSplitState(result.status);
    if (result.status === "found") linkVin(result.lot.url, `Open lot ${result.lot.id} on bid.cars`);
    else {
      clearAuctionSection();
      linkVin(C.BIDCARS.searchPageUrl(vin), "Search this VIN on bid.cars");
    }

    if (result.status === "found") {
      state.activeLot = result.lot;
      renderFound(result);
      setPill(state.vinTile, "found", "Auction history ↓");
      return;
    }
    if (result.status === "not_found") {
      renderBar(
        "ok",
        h("span", {}, "✓ No auction history found on bid.cars for ", h("b", {}, vin)),
        searchLink(vin, "Search manually ↗"),
        recheckButton(),
        h("span", { className: "muted" }, "Not proof the car was never damaged: other auctions and sources exist.")
      );
      setPill(state.vinTile, "not_found", "No auction history");
      return;
    }
    if (result.status === "blocked") {
      renderBar(
        "amber",
        h("span", {}, "bid.cars asks for a human check."),
        h("a", { href: C.BIDCARS.searchPageUrl(vin), target: "_blank", rel: "noopener" }, "Open bid.cars ↗"),
        h("span", { className: "muted" }, "then"),
        recheckButton()
      );
      setPill(state.vinTile, "blocked", "History: check needed");
      return;
    }
    renderBar("red", h("span", {}, `Couldn't reach bid.cars${result.error ? ": " + result.error : "."}`), recheckButton(), searchLink(vin, "Search manually ↗"));
    setPill(state.vinTile, "error", "History: error");
  }

  function fmtNum(n) {
    return Number(n).toLocaleString("en-US");
  }

  function warningsFor(lot, listing, comparison) {
    const out = [];
    if (comparison.historicalDamage) {
      const damage = [lot.primaryDamage, lot.secondaryDamage].filter((value) => value && value !== "-").join(" / ");
      out.push(`Listing says "not damaged". The auction recorded damage: ${damage}.`);
    }
    if (comparison.lowerMileage) {
      out.push(`Mileage on list.am (${fmtNum(listing.mileageKm)} km) is lower than at auction (${fmtNum(comparison.auctionKm)} km).`);
    }
    if (/salvage|rebuild|junk|parts only|non-repairable|certificate of destruction/i.test(lot.saleDocument || "")) {
      out.push(`Auction title type: ${lot.saleDocument}.`);
    }
    return out;
  }

  function renderFound(result) {
    const lot = state.activeLot;
    let index = 0;

    const mainImg = h("img", { referrerpolicy: "no-referrer", alt: `${lot.title} photo 1` });
    const counter = h("div", { className: "counter" });
    const thumbs = h("div", { className: "thumbs" });
    const blockedMsg = h(
      "div",
      { className: "blocked" },
      "bid.cars didn't allow loading this photo here. ",
      h("a", { href: lot.url, target: "_blank", rel: "noopener" }, "Open bid.cars ↗"),
      " once (it sets a cookie), then ",
      h("button", { className: "link", onclick: () => runLookup(false) }, "reload photos")
    );

    const show = (i) => {
      if (!lot.images.length) return;
      index = (i + lot.images.length) % lot.images.length;
      blockedMsg.classList.remove("on");
      setImgSrc(mainImg, lot.images[index], () => blockedMsg.classList.add("on"));
      mainImg.alt = `${lot.title} photo ${index + 1}`;
      counter.textContent = `${index + 1} / ${lot.images.length}`;
      [...thumbs.children].forEach((t, j) => t.classList.toggle("active", j === index));
    };

    lot.images.forEach((src, i) => {
      const t = h("img", { referrerpolicy: "no-referrer", loading: "lazy", alt: `thumbnail ${i + 1}`, onclick: () => show(i) });
      setImgSrc(t, src);
      thumbs.append(t);
    });

    const gallery = lot.images.length
      ? [
          h(
            "div",
            { className: "main", onclick: (e) => !e.target.closest(".nav, .blocked") && openLightbox(index) },
            mainImg,
            blockedMsg,
            lot.images.length > 1 ? h("button", { className: "nav prev", title: "Previous", onclick: () => show(index - 1) }, "‹") : null,
            lot.images.length > 1 ? h("button", { className: "nav next", title: "Next", onclick: () => show(index + 1) }, "›") : null,
            counter
          ),
          thumbs,
        ]
      : [h("div", { className: "nophotos" }, "Photos unavailable. ", h("a", { href: lot.url, target: "_blank", rel: "noopener" }, "Open on bid.cars ↗"))];

    const checked = result.checkedAt ? timeAgo(result.checkedAt) : "";

    renderPanel(
      h("div", { className: "title" }, `bid.cars · ${lot.auction} · ${lot.images.length} photos`),
      ...gallery,
      h(
        "div",
        { className: "foot" },
        h("b", { className: "car" }, lot.title || state.vin),
        h("button", { className: "link", onclick: scrollToAuctionSection }, "Auction details ↓"),
        h("a", { href: lot.url, target: "_blank", rel: "noopener" }, "Open on bid.cars ↗"),
        h("span", {}, checked ? `checked ${checked}` : ""),
        recheckButton()
      )
    );
    show(0);
    renderAuctionSection(result);
  }

  /* ------------------------------------------------------------ auction details in list.am's car info */

  const ICON = (body) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
    )}")`;
  const ICONS = {
    auction: ICON('<path d="M13 4l7 7M10.5 6.5l7 7M14.5 5.5l-6 6 4 4 6-6"/><path d="M10.5 13.5L4 20"/><path d="M3 21h9"/>'),
    calendar: ICON('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    location: ICON('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    odometer: ICON('<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l4-6"/><circle cx="12" cy="17" r="1"/>'),
    damage: ICON('<path d="M3 16v-3l2-5h14l2 5v3H3z"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/><path d="M12 8l-1.5 3 2.5 1-1.5 3"/>'),
    document: ICON('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'),
    seller: ICON('<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/>'),
    key: ICON('<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>'),
    start: ICON('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
    history: ICON('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  };

  const added = [];

  function clearAuctionSection() {
    while (added.length) added.pop().remove();
  }

  function scrollToAuctionSection() {
    document.getElementById("lavc-auction-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function listamTile(icon, value, label, { tooltip, bad } = {}) {
    return h(
      "div",
      { className: "at3 lavc-tile" },
      h("div", { className: "attr-icon", style: `background-image: ${icon}` }),
      h(
        "div",
        { className: "bo69 attr-info-wraper" },
        h("p", { className: `te13 fw-medium fs-sm lh-sm align-left text-primary attr-value lavc-tile-value${bad ? " lavc-bad" : ""}`, title: tooltip || value }, value),
        h("p", { className: "te13 fw-medium fs-xxs lh-xxs align-left text-light-grey ellipsis nowrap one-line" }, label)
      )
    );
  }

  function addComparison(tile, text, bad) {
    const wrap = tile?.querySelector(".attr-info-wraper");
    if (!wrap) return;
    const p = h("p", { className: `lavc-cmp${bad ? " lavc-bad" : ""}`, title: "From the bid.cars auction record" }, text);
    wrap.appendChild(p);
    added.push(p);
  }

  function renderAuctionSection(result) {
    clearAuctionSection();
    const lot = result.lot;
    if (!lot) return;

    const damage = [lot.primaryDamage, lot.secondaryDamage].filter((d) => d && d !== "-").join(" / ");
    const listing = Listing.details(document);
    const comparison = Listing.compare(listing, lot);
    const { damaged, auctionKm: odoKm } = comparison;
    const salvage = /salvage|rebuild|junk|parts only|non-repairable|destruction/i.test(lot.saleDocument || "");

    const tiles = [
      listamTile(ICONS.auction, `${lot.auction} · lot ${lot.id}`, lot.archived ? "Auction · archived" : "Auction · active"),
      lot.saleDate && listamTile(ICONS.calendar, lot.saleDate, "Sale date"),
      lot.location && listamTile(ICONS.location, lot.location, "Location"),
      lot.odometerMi && listamTile(ICONS.odometer, `${fmtNum(lot.odometerMi)} mi`, `Odometer · ${fmtNum(odoKm)} km`),
      damage && listamTile(ICONS.damage, damage, "Damage", { bad: damaged }),
      lot.saleDocument && listamTile(ICONS.document, lot.saleDocument, "Title", { bad: salvage }),
      lot.seller && listamTile(ICONS.seller, lot.seller, "Seller"),
      lot.key && listamTile(ICONS.key, lot.key, "Key"),
      lot.startCode && listamTile(ICONS.start, lot.startCode, "Start code"),
      ...(result.otherLots || [])
        .filter((o) => o.id !== lot.id)
        .map((o) => {
          const tile = listamTile(ICONS.history, `${o.auction || ""} · lot ${o.id}`, `Also auctioned${o.saleDate ? " · " + o.saleDate : ""}`);
          tile.querySelector(".attr-value").replaceChildren(h("a", { href: o.url, target: "_blank", rel: "noopener" }, `${o.auction || ""} · lot ${o.id}`));
          return tile;
        }),
    ].filter(Boolean);

    const heading = h(
      "div",
      { className: "gt lavc-gt", id: "lavc-auction-section" },
      "Auction history · ",
      h("a", { href: lot.url, target: "_blank", rel: "noopener" }, "bid.cars ↗")
    );
    const warnings = warningsFor(lot, listing, comparison);
    const warnBox = warnings.length ? h("div", { className: "lavc-warnings" }, ...warnings.map((w) => h("div", { className: "lavc-warn" }, "⚠ ", w))) : null;
    const grid = h("div", { className: "attr g new lavc-attr" }, ...tiles);

    const carInfo = state.vinTile?.closest(".attr") || document.querySelector(`${L.galleryWrapper} ~ .attr`) || document.querySelector("#pcontent .vi .attr");
    if (!carInfo) return;
    const nodes = [heading, warnBox, grid].filter(Boolean);
    carInfo.after(...nodes);
    added.push(...nodes);

    if (odoKm !== null && listing.mileageKm !== null) {
      addComparison(
        Listing.attrTileByIcon(document, L.mileageIcon),
        `bid.cars: ${listing.inMiles ? fmtNum(lot.odometerMi) + " mi" : fmtNum(odoKm) + " km"} (${lot.saleDate || "auction"})`,
        comparison.lowerMileage
      );
    }
    if (damage) {
      addComparison(Listing.attrTileByIcon(document, L.conditionIcon), `bid.cars: ${damaged ? "damaged · " : ""}${damage}`, comparison.historicalDamage);
    }
  }

  /* ------------------------------------------------------------ VIN link */

  function linkVin(url, title) {
    const valueEl = state.vinValueEl;
    if (!valueEl || !url) return;
    let a = valueEl.querySelector("a.lavc-vin-link");
    if (!a) {
      a = h("a", { className: "lavc-vin-link", target: "_blank", rel: "noopener" }, valueEl.textContent.trim());
      valueEl.replaceChildren(a);
    }
    a.href = url;
    a.title = title;
  }

  function timeAgo(ts) {
    const days = Math.floor((Date.now() - ts) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  }

  const imageFallbackCache = new Map();

  function setImgSrc(img, src, onFail) {
    img.onerror = null;
    img.onload = null;
    img.classList.remove("failed");
    if (imageFallbackCache.has(src)) {
      img.src = imageFallbackCache.get(src);
      return;
    }
    img.onerror = async () => {
      img.onerror = null;
      const res = await send({ type: "fetchImage", url: src });
      if (img.dataset.want !== src) return;
      if (res && res.ok) {
        imageFallbackCache.set(src, res.dataUrl);
        img.src = res.dataUrl;
      } else {
        img.classList.add("failed");
        onFail && onFail();
      }
    };
    img.dataset.want = src;
    img.src = src;
  }

  /* ------------------------------------------------------------ lightbox */

  let lightbox = null;

  function openLightbox(startIndex) {
    closeLightbox();
    const lot = state.activeLot;
    if (!lot || !lot.images.length) return;

    const host = document.createElement("div");
    host.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;display:block;opacity:1;filter:none;background:#0b0b0b;";
    const root = host.attachShadow({ mode: "open" });
    document.body.appendChild(host);

    const css = `
      * { box-sizing: border-box; }
      .bg { position: fixed; inset: 0; background: #0b0b0b; display: flex; flex-direction: column;
            font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; }
      .top { display: flex; align-items: center; gap: 12px; padding: 10px 16px; }
      .top .sp { flex: 1; }
      button { border: 0; background: rgba(255,255,255,.12); color: #fff; border-radius: 6px; padding: 6px 12px; cursor: pointer; font: inherit; }
      button:hover { background: rgba(255,255,255,.25); }
      .stage { flex: 1; display: grid; grid-template-columns: 1fr; gap: 8px; padding: 0 16px 16px; min-height: 0; }
      .stage.compare { grid-template-columns: 1fr 1fr; }
      .pane { position: relative; display: flex; align-items: center; justify-content: center; min-height: 0; overflow: hidden; }
      .pane img { max-width: 100%; max-height: 100%; object-fit: contain; transform-origin: center; transition: transform .1s; }
      .label { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,.6); padding: 2px 8px; border-radius: 10px; }
      .count { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,.6); padding: 2px 10px; border-radius: 10px; }
      .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%; font-size: 24px; padding: 0; }
      .prev { left: 8px; } .next { right: 8px; }
    `;

    const makePane = (label, images, start) => {
      let i = start;
      let zoom = 1;
      const img = h("img", { referrerpolicy: "no-referrer", alt: label });
      const count = h("div", { className: "count" });
      const show = (n) => {
        i = (n + images.length) % images.length;
        zoom = 1;
        img.style.transform = "";
        setImgSrc(img, images[i]);
        count.textContent = `${i + 1} / ${images.length}`;
      };
      const pane = h(
        "div",
        {
          className: "pane",
          onwheel: (e) => {
            e.preventDefault();
            zoom = Math.min(5, Math.max(1, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
            img.style.transform = `scale(${zoom})`;
          },
        },
        img,
        h("div", { className: "label" }, label),
        images.length > 1 ? h("button", { className: "nav prev", onclick: () => show(i - 1) }, "‹") : null,
        images.length > 1 ? h("button", { className: "nav next", onclick: () => show(i + 1) }, "›") : null,
        count
      );
      show(start);
      return { pane, prev: () => show(i - 1), next: () => show(i + 1) };
    };

    const auctionPane = makePane(`bid.cars · ${lot.auction}`, lot.images, startIndex);
    const stage = h("div", { className: "stage" }, auctionPane.pane);
    let listamPane = null;

    const compareBtn = h(
      "button",
      {
        disabled: state.listamPhotos.length ? null : true,
        title: state.listamPhotos.length ? "Show list.am photos next to auction photos" : "No list.am photos found",
        onclick: () => {
          if (listamPane) {
            listamPane.pane.remove();
            listamPane = null;
            stage.classList.remove("compare");
            compareBtn.textContent = "Compare with list.am";
          } else {
            listamPane = makePane("list.am", state.listamPhotos, 0);
            stage.prepend(listamPane.pane);
            stage.classList.add("compare");
            compareBtn.textContent = "Hide list.am";
          }
        },
      },
      "Compare with list.am"
    );

    const bg = h(
      "div",
      { className: "bg" },
      h(
        "div",
        { className: "top" },
        h("span", {}, lot.title || state.vin),
        h("span", { className: "sp" }),
        compareBtn,
        h("button", { onclick: closeLightbox, title: "Close (Esc)" }, "✕")
      ),
      stage
    );
    root.append(h("style", {}, css), bg);

    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") auctionPane.prev();
      else if (e.key === "ArrowRight") auctionPane.next();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    lightbox = { host, onKey };
  }

  function closeLightbox() {
    if (!lightbox) return;
    document.removeEventListener("keydown", lightbox.onKey, true);
    lightbox.host.remove();
    lightbox = null;
  }

  /* ------------------------------------------------------------ flow */

  async function runLookup(force) {
    if (!state.vin) return;
    renderLoading();
    setPill(state.vinTile, "loading", "Checking history…");
    reportStatus("loading");
    const result = (await send({ type: "lookup", vin: state.vin, force })) || { status: "error", error: "Extension did not respond." };
    renderResult(result);
    reportStatus(result.status, {
      lotUrl: result.lot?.url,
      lotId: result.lot?.id,
      error: result.error,
      checkedAt: result.checkedAt,
    });
  }

  function renderNoVin() {
    if (!state.settings.manualVinInput) return;
    setSplitState("no_vin");
    const input = h("input", { placeholder: "Enter VIN", maxlength: "17", spellcheck: "false" });
    const go = () => {
      const vin = input.value.replace(/\s+/g, "").toUpperCase();
      if (!C.VIN_RE.test(vin)) {
        input.style.borderColor = "#d93025";
        return;
      }
      state.vin = vin;
      runLookup(false);
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && go());
    renderBar("neutral", h("span", {}, "No VIN in this listing."), input, h("button", { className: "link", onclick: go }, "Check on bid.cars"));
  }

  async function init() {
    const stored = await chrome.storage.local.get("settings");
    Object.assign(state.settings, stored.settings || {});

    const galleryWrapper = document.querySelector(L.galleryWrapper);
    const found = Listing.findVin(document);
    state.vinTile = found.tile || null;
    state.vinValueEl = found.valueEl || null;

    if (!galleryWrapper && !document.querySelector(".vi")) {
      reportStatus("unsupported");
      return;
    }
    if (found.status === "no_vin") {
      reportStatus("no_vin");
      if (state.settings.manualVinInput && galleryWrapper) {
        state.listamPhotos = listamPhotos();
        buildSplit(galleryWrapper);
        renderNoVin();
      }
      return;
    }
    if (!galleryWrapper) {
      console.warn("[list.am VIN history] gallery not found; list.am layout may have changed.");
      reportStatus("unsupported");
      return;
    }

    state.listamPhotos = listamPhotos();
    buildSplit(galleryWrapper);

    if (found.status === "invalid_vin") {
      state.vin = null;
      setSplitState("invalid_vin");
      renderBar(
        "amber",
        h("span", {}, "VIN on this listing looks invalid: ", h("b", {}, found.raw)),
        searchLink(found.raw, "Search anyway ↗")
      );
      setPill(state.vinTile, "invalid_vin", "Invalid VIN");
      linkVin(C.BIDCARS.searchPageUrl(found.raw), "Search this value on bid.cars");
      reportStatus("invalid_vin", { raw: found.raw });
      return;
    }

    state.vin = found.vin;
    runLookup(false);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "recheck") {
      runLookup(true);
      sendResponse({ ok: true });
    } else if (msg?.type === "readMcpListing" && typeof msg.itemId === "string" &&
               Listing.itemId(location.pathname) === msg.itemId) {
      sendResponse(Listing.read(document));
    }
    return false;
  });

  init().catch((e) => console.warn("[list.am VIN history]", e));
})();
