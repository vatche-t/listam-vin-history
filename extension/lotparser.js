/* Parses a bid.cars lot page Document into a plain lot object.
 * Used by the offscreen document (HTML fetched by the service worker) and injected into the
 * helper tab (live page). Must stay self-contained: no references to LAVC_CONFIG. */
function parseBidCarsLot(doc, expectedVin, pageUrl) {
  const clean = (s) => typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";

  let ld = null;
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      if (data && data["@type"] === "Vehicle") {
        ld = data;
        break;
      }
    } catch (_) {}
  }

  const ogUrl = doc.querySelector('meta[property="og:url"]')?.content || "";
  const canonicalUrl = clean(ld?.url) || ogUrl;
  const url = canonicalUrl || pageUrl || (doc.location ? doc.location.href : "");
  const lotId = (url.match(/\/lot\/([01]-\d+)/) || [])[1];
  const vin = (clean(ld?.vehicleIdentificationNumber) || canonicalUrl.match(/([A-HJ-NPR-Z0-9]{17})(?:[/?#]|$)/i)?.[1] || "").toUpperCase();

  if (!lotId || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;
  if (expectedVin && vin !== expectedVin.toUpperCase()) {
    return { mismatch: true, vin, lotId, url };
  }

  const description = (ld && ld.description) || doc.querySelector('meta[name="description"]')?.content || "";

  const optionValue = (label) => {
    const want = label.toLowerCase();
    for (const el of doc.querySelectorAll(".option")) {
      const own = clean([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ")).toLowerCase();
      if (own === want) {
        const v = el.querySelector(".right-info");
        if (v) return clean(v.textContent);
      }
    }
    return undefined;
  };

  const headerValue = (label) => {
    const want = label.toLowerCase();
    for (const span of doc.querySelectorAll("li > span")) {
      if (clean(span.textContent).toLowerCase() === want) {
        const li = span.parentElement;
        const text = clean([...li.childNodes].filter((n) => n !== span).map((n) => n.textContent).join(" "));
        if (text) return text;
      }
    }
    return undefined;
  };

  let odometerMi;
  const odoText = optionValue("Odometer") || (description.match(/Odometer:\s*([\d\s,.]+)\s*mi/i) || [])[1];
  if (odoText) {
    const n = parseInt(odoText.replace(/\(.*$/, "").replace(/[^\d]/g, ""), 10);
    if (!Number.isNaN(n)) odometerMi = n;
  }

  const gallerySlides = [...doc.querySelectorAll("#productContainer .f-carousel__slide[data-src]")].map((el) => el.getAttribute("data-src"));
  let images = gallerySlides.filter(Boolean);
  if (!images.length) {
    const prefixes = [`https://mercury.bid.cars/${lotId}/`, `https://images.bid.cars/`];
    const seen = new Set();
    for (const img of doc.querySelectorAll("img")) {
      const src = img.getAttribute("data-lazy-src") || img.getAttribute("src") || "";
      if (src.startsWith(prefixes[0]) || (src.startsWith(prefixes[1]) && vin && src.includes(vin))) {
        if (!seen.has(src)) {
          seen.add(src);
          images.push(src);
        }
      }
    }
  }
  images = [...new Set(images)];

  const history = [];
  for (const tr of doc.querySelectorAll(".sales-history-table tbody tr")) {
    const cells = [...tr.children].map((c) => clean(c.textContent));
    const link = tr.querySelector('a[href*="/lot/"]');
    const id = link ? (link.getAttribute("href").match(/\/lot\/([01]-\d+)/) || [])[1] : undefined;
    if (!id) continue;
    history.push({
      id,
      url: link.href || link.getAttribute("href"),
      auction: cells[0] || undefined,
      saleDate: cells[1] || undefined,
      odometer: cells[4] || undefined,
      status: cells[5] || undefined,
      seller: cells[6] || undefined,
    });
  }

  const titleFromLd = ld && ld.name ? ld.name.split("|")[0] : "";
  const title = clean(titleFromLd || (doc.title || "").split("|")[0]);

  const scriptsText = [...doc.querySelectorAll("script:not([src])")].map((s) => s.textContent).join("\n");
  const archived = !!doc.querySelector("#archieved-message") || /var\s+isArchived\s*=\s*1/.test(scriptsText);
  const knownDamage = Array.isArray(ld?.knownVehicleDamages)
    ? ld.knownVehicleDamages.map(clean).filter(Boolean).join(" / ") : clean(ld?.knownVehicleDamages);

  return {
    id: lotId,
    url: url.split("?")[0],
    vin,
    vinVerified: true,
    title,
    auction: lotId.startsWith("0-") ? "IAAI" : "Copart",
    archived,
    saleDate: (ld && ld.purchaseDate) || (description.match(/Sale date:\s*([\d-]+)/i) || [])[1],
    location: headerValue("Location:") || clean((description.match(/Location:\s*([^,|]+)/i) || [])[1]) || undefined,
    seller: headerValue("Seller:"),
    saleDocument: headerValue("Sale Document:"),
    odometerMi,
    primaryDamage: optionValue("Primary damage") || knownDamage || undefined,
    secondaryDamage: optionValue("Secondary damage"),
    key: optionValue("Key"),
    startCode: optionValue("Start code"),
    color: ld && ld.color,
    images,
    history,
  };
}

if (typeof globalThis !== "undefined") globalThis.parseBidCarsLot = parseBidCarsLot;
