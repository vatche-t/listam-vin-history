chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return false;
  try {
    if (msg.type === "parseLot") {
      const doc = new DOMParser().parseFromString(msg.html, "text/html");
      sendResponse({ ok: true, lot: parseBidCarsLot(doc, msg.vin, msg.url) });
    } else if (msg.type === "parseListing") {
      const listing = typeof Document.parseHTML === "function"
        ? LAVC_LISTING.read(Document.parseHTML(msg.html, {
          sanitizer: { elements: ["html", "head", "body", "main", "section", "article", "div", "p", "span", "a", "b", "strong"],
            attributes: ["id", "class", "style"] },
        }))
        : { status: "listing_unavailable" };
      sendResponse({ ok: true, listing });
    }
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }
  return false;
});
