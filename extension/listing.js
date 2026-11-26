const LAVC_LISTING = (() => {
  const { LISTAM: L, VIN_RE } = LAVC_CONFIG;
  const MI_TO_KM = 1.609344;
  const itemId = (path) => path.match(L.itemPathRe)?.[1];

  function attrTileByIcon(doc, iconSelector) {
    return doc.querySelector(iconSelector)?.closest(L.attrTile) || null;
  }

  function findVin(doc) {
    let tile = attrTileByIcon(doc, L.vinIcon);
    if (!tile) {
      const label = [...doc.querySelectorAll(`${L.attrTile} .attr-info-wraper p:not(${L.attrValue})`)]
        .find((p) => p.textContent.trim().toUpperCase() === "VIN");
      tile = label?.closest(L.attrTile);
    }
    const valueEl = tile?.querySelector(L.attrValue);
    if (!valueEl) return { status: "no_vin" };
    const raw = valueEl.textContent.trim();
    const vin = raw.replace(/\s+/g, "").toUpperCase();
    return VIN_RE.test(vin) ? { status: "ok", vin, tile, valueEl } : { status: "invalid_vin", raw, tile, valueEl };
  }

  function details(doc) {
    const text = (icon) => (attrTileByIcon(doc, icon)?.querySelector(L.attrValue)?.textContent || "").trim().slice(0, 200);
    const mileage = text(L.mileageIcon);
    const parts = mileage.match(/^(\d{1,3}(?:[ ,.\u00a0\u202f]\d{3})+|\d+)\s*(.*)$/);
    const count = parts ? Number(parts[1].replace(/\D/g, "")) : null;
    const unit = parts?.[2];
    const inMiles = /^(?:mi|miles?|մղոն|миль|мили|миля)\.?$/i.test(unit);
    const inKilometers = unit === "" || /^(?:km|kilomet(?:er|re)s?|կմ|км)\.?$/i.test(unit);
    const mileageKm = Number.isSafeInteger(count) && (inMiles || inKilometers) ? Math.round(count * (inMiles ? MI_TO_KM : 1)) : null;
    return { mileage, mileageKm, inMiles, condition: text(L.conditionIcon) };
  }

  function read(doc) {
    const content = doc.querySelector(L.itemContent);
    if (!content?.querySelector(L.attrValue)) return { status: "listing_unavailable" };
    const { status, vin } = findVin(content);
    return { status, vin, ...details(content) };
  }

  function compare(listing, lot) {
    const auctionKm = Number.isFinite(lot?.odometerMi) && lot.odometerMi > 0 ? Math.round(lot.odometerMi * MI_TO_KM) : null;
    const damaged = [lot?.primaryDamage, lot?.secondaryDamage]
      .flatMap((value) => typeof value === "string" ? value.split(" / ") : [])
      .some((text) => !!text.trim() && !/^(-|none|normal wear.*|no damage)$/i.test(text.trim()));
    return {
      auctionKm,
      damaged,
      lowerMileage: Number.isSafeInteger(listing.mileageKm) && auctionKm !== null && listing.mileageKm + 1000 < auctionKm,
      historicalDamage: damaged && typeof listing.condition === "string" && L.notDamagedTexts.includes(listing.condition.toLowerCase()),
    };
  }

  return { itemId, attrTileByIcon, findVin, details, read, compare };
})();
