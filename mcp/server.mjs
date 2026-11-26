import { readdir } from "node:fs/promises";
import { get } from "node:http";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { ITEM_ID_PATTERN, LOOKUP_TIMEOUT_MS, MAX_MESSAGE_BYTES, VIN_PATTERN, privateDirectory } from "./bridge.mjs";

function requestOnSocket(socketPath, path, signal) {
  return new Promise((resolve, reject) => {
    const request = get({ socketPath, path, agent: false, signal }, (response) => {
      (async () => {
        if (response.statusCode === 400 && path.startsWith("/listing/")) {
          response.resume();
          return { status: "update_required" };
        }
        if (response.statusCode !== 200) throw new Error("Invalid bridge response.");
        let size = 0;
        const chunks = [];
        for await (const chunk of response) {
          size += chunk.length;
          if (size > MAX_MESSAGE_BYTES) throw new Error("Bridge response too large.");
          chunks.push(chunk);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      })().then(resolve, reject);
    });
    request.on("error", reject);
  });
}

async function requestInBrowser(path, signal) {
  let updateRequired;
  try {
    const directory = await privateDirectory();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^b-[a-z0-9]{6}$/i.test(entry.name)) continue;
      try {
        const response = await requestOnSocket(join(directory, entry.name, "lookup.sock"), path, signal);
        if (response?.status !== "update_required") return response;
        updateRequired = response;
      } catch (error) {
        if (!["ENOENT", "ECONNREFUSED", "ECONNRESET"].includes(error.code)) throw error;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return updateRequired || { status: "disconnected" };
}

async function requestBrowser(path, ctx) {
  const timeout = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  const signal = ctx?.signal ? AbortSignal.any([timeout, ctx.signal]) : timeout;
  try {
    return await requestInBrowser(path, signal);
  } catch (error) {
    if (ctx?.signal?.aborted) throw error;
    return { status: timeout.aborted ? "timeout" : "bridge_error" };
  }
}

const BRIDGE_MESSAGES = {
  disconnected: "Open the List.am VIN History extension and select Connect MCP.",
  busy: "The browser is checking another VIN or listing. Try again when it finishes.",
  timeout: "The browser lookup timed out. Check the source website in the browser and retry.",
  update_required: "Update and reconnect the browser bridge to use listing checks.",
  bridge_error: "The local bridge could not complete the lookup. Reconnect the extension and retry.",
};

function bridgeFailure(data) {
  const status = data?.status;
  if (typeof status === "string" && Object.hasOwn(BRIDGE_MESSAGES, status)) {
    return { status: status === "bridge_error" ? "error" : status, message: BRIDGE_MESSAGES[status] };
  }
}

function safeUrl(value, hosts) {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && hosts.includes(url.hostname) && !url.username && !url.password && !url.port) {
      return url.href;
    }
  } catch (_) {}
}

function auctionRecord(value, fields) {
  if (typeof value?.id !== "string" || !/^[01]-\d+$/.test(value.id)) return;
  const url = safeUrl(value.url, ["bid.cars"]);
  if (!url || !new RegExp(`^(?:/[a-z]{2})?/lot/${value.id}(?:/|$)`).test(new URL(url).pathname)) return;
  const record = { id: value.id, url };
  for (const key of fields) {
    if (typeof value[key] === "string") record[key] = value[key].slice(0, 500);
    if (Number.isFinite(value[key])) record[key] = value[key];
  }
  return record;
}

function format(data) {
  return { structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) }] };
}

function result(vin, status, message, details = {}) {
  return { status, vin, message, ...details };
}

function report(vin, data) {
  const failure = bridgeFailure(data);
  if (failure) return { vin, ...failure };
  if (data?.vin !== vin) return result(vin, "error", "The browser returned an unverifiable result.");
  const freshness = {
    ...(Number.isFinite(data.checkedAt) ? { checkedAt: data.checkedAt } : {}),
    fromCache: data.fromCache === true,
  };
  switch (data.status) {
    case "found": {
      const lot = auctionRecord(data.lot, ["title", "auction", "saleDate", "location", "saleDocument",
        "odometerMi", "primaryDamage", "secondaryDamage"]);
      if (!lot || data.lot.vin !== vin) return result(vin, "error", "The auction lot did not confirm this VIN.");
      lot.images = (Array.isArray(data.lot.images) ? data.lot.images : []).slice(0, 30)
        .map((image) => safeUrl(image, ["mercury.bid.cars", "images.bid.cars"])).filter(Boolean);
      const otherLots = (Array.isArray(data.otherLots) ? data.otherLots : []).slice(0, 20)
        .map((row) => auctionRecord(row, ["auction", "saleDate", "odometer", "status"])).filter(Boolean);
      return result(vin, "found", "Auction history found on Bid.Cars.", { ...freshness, lot, otherLots });
    }
    case "not_found":
      return result(vin, "not_found", "No matching auction record was found on Bid.Cars.", freshness);
    case "blocked":
      return result(vin, "blocked", "Open Bid.Cars in the connected browser, complete its human check, then retry.", {
        verificationUrl: "https://bid.cars/",
      });
    default:
      return result(vin, "error", "The browser could not complete the auction lookup. Try again.");
  }
}

function listingId(input) {
  const url = safeUrl(input, ["list.am", "www.list.am"]);
  if (!url) return;
  const id = new URL(url).pathname.match(/^\/(?:[a-z]{2}\/)?item\/(\d+)\/?$/)?.[1];
  return ITEM_ID_PATTERN.test(id) ? id : undefined;
}

function listingReport(itemId, data) {
  const listing = { url: `https://www.list.am/item/${itemId}` };
  const failure = bridgeFailure(data);
  if (failure) return { ...failure, listing };
  if (data?.itemId !== itemId) {
    return { status: "error", listing, message: "The browser did not confirm the requested listing." };
  }

  const source = data.listing;
  listing.mileage = typeof source?.mileage === "string" ? source.mileage.slice(0, 200) : null;
  listing.mileageKm = Number.isSafeInteger(source?.mileageKm) && source.mileageKm >= 0 ? source.mileageKm : null;
  listing.condition = typeof source?.condition === "string" ? source.condition.slice(0, 200) : null;
  if (source?.status === "error") {
    return { status: "error", listing, message: "The browser could not parse this listing. Reconnect the extension and retry." };
  }
  if (source?.status === "no_vin") {
    return { status: "no_vin", listing, message: "The listing does not show a VIN in its vehicle details." };
  }
  if (source?.status === "invalid_vin") {
    return { status: "invalid_vin", listing, message: "The VIN in the listing is invalid. Check it with the seller." };
  }
  if (source?.status !== "ok" || typeof source.vin !== "string" || !VIN_PATTERN.test(source.vin)) {
    return { status: "listing_unavailable", listing, message: "Could not read the vehicle details. Open the listing in the connected browser, then retry." };
  }

  const auction = report(source.vin, data.auction);
  const comparison = data.comparison;
  if (auction.status !== "found" || !comparison) return { ...auction, listing };
  const findings = [];
  if (comparison.historicalDamage === true) {
    findings.push({ type: "historical_damage", message: "The listing is marked undamaged. The auction recorded prior damage." });
  }
  const auctionMileageKm = Number.isSafeInteger(comparison.auctionKm) ? comparison.auctionKm : null;
  if (comparison.lowerMileage === true && listing.mileageKm !== null && auctionMileageKm !== null) {
    findings.push({ type: "lower_mileage", message: "The listed mileage is more than 1,000 km below the auction reading." });
  }
  return { ...auction, listing, auctionMileageKm, findings };
}

function createServer() {
  const server = new McpServer({ name: "listam-vin-history", version: "1.0.0" });
  server.registerTool("lookup_vin", {
    title: "Look up a VIN’s auction history",
    description: "Check Bid.Cars auction history by VIN through the connected List.am VIN History extension. " +
      "Returns damage, title type, mileage, sale details, source lots, and photo links when available. " +
      "Use for a single VIN. Report a no-match as limited to Bid.Cars and ask the user to complete any human check.",
    inputSchema: z.object({ vin: z.string().min(17).max(40).describe("17-character vehicle identification number") }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ vin: input }, ctx) => {
    const vin = input.replace(/\s+/g, "").toUpperCase();
    if (!VIN_PATTERN.test(vin)) {
      return { isError: true, content: [{ type: "text", text: "Enter a 17-character VIN without I, O, or Q." }] };
    }
    return format(report(vin, await requestBrowser(`/vin/${vin}`, ctx)));
  });
  server.registerTool("check_listing", {
    title: "Compare a List.am listing with its auction history",
    description: "Read a single List.am car listing and check the listed VIN on Bid.Cars. Compare the seller's mileage and condition " +
      "with the matched auction record, using both source links. Treat any damage finding as historical evidence.",
    inputSchema: z.object({ url: z.string().min(1).max(2048).describe("HTTPS URL for a List.am item page") }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ url }, ctx) => {
    const itemId = listingId(url);
    if (!itemId) {
      return { isError: true, content: [{ type: "text", text: "Enter an HTTPS link to an item on List.am." }] };
    }
    return format(listingReport(itemId, await requestBrowser(`/listing/${itemId}`, ctx)));
  });
  return server;
}

serveStdio(createServer, { onerror: (error) => console.error(error.message) });
