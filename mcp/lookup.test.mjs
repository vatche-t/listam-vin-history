import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { readNativeMessages, sendNativeMessage } from "./bridge.mjs";

const vin = "JM1GL1VM3L1522160";
const popup = "chrome-extension://fixture/popup.html";
const otherSender = "https://www.list.am/item/123";
const listingHtml = "<html>listing fixture</html>";

function event() {
  let listener;
  return { addListener: (fn) => { listener = fn; }, emit: (...args) => listener?.(...args) };
}

function run(context, ...files) {
  for (const file of files) {
    runInContext(readFileSync(new URL(`../extension/${file}`, import.meta.url), "utf8"), context);
  }
}

function listingDocument({ mileage, condition, vin: value }) {
  const tile = (text) => ({ querySelector: () => ({ textContent: text }) });
  const content = {
    querySelector: (selector) => {
      if (selector === ".attr-value") return { textContent: mileage };
      if (selector.includes("mileage")) return { closest: () => tile(mileage) };
      if (selector.includes("general-condition")) return { closest: () => tile(condition) };
      return null;
    },
    querySelectorAll: () => value === undefined ? [] : [{ textContent: "VIN", closest: () => tile(value) }],
  };
  return { querySelector: (selector) => selector === "#pcontent .vi" ? content : null };
}

test("auction records require VIN evidence from the document", () => {
  const context = createContext({});
  run(context, "lotparser.js");
  const url = `https://bid.cars/en/lot/1-61989692/2020-Mazda-6-${vin}`;
  const source = {
    title: "Service Unavailable", location: { href: url }, querySelector: () => null, querySelectorAll: () => [],
  };
  context.source = source;
  context.expectedVin = vin;
  const parse = () => runInContext("parseBidCarsLot(source, expectedVin)", context);
  assert.equal(parse(), null);

  source.querySelectorAll = (selector) => selector === 'script[type="application/ld+json"]' ? [{
    textContent: JSON.stringify({
      "@type": "Vehicle", url, name: "Mazda 6", vehicleIdentificationNumber: vin,
      knownVehicleDamages: ["Front end", "Rear"],
    }),
  }] : [];
  assert.equal(parse().vin, vin);
  assert.equal(parse().primaryDamage, "Front end / Rear");
});

function worker(port, record, page = {}) {
  const onMessage = event();
  const onOffscreenMessage = event();
  const onContentMessage = event();
  const cacheReads = [];
  const fetches = [];
  const tabsRead = [];
  let connections = 0;
  const offscreen = createContext({
    chrome: { runtime: { onMessage: onOffscreenMessage } },
    Document: { parseHTML: (html) => {
      assert.equal(html, listingHtml);
      return page.doc;
    } },
  });
  run(offscreen, "config.js", "listing.js", "offscreen.js");
  const content = createContext({
    window: { addEventListener: () => {} }, location: { pathname: "/ru/item/24173931" },
    document: {
      querySelector: (selector) => page.doc?.querySelector(selector) ?? null,
      querySelectorAll: () => [],
    },
    chrome: {
      storage: { local: { get: async () => ({}) } },
      runtime: { onMessage: onContentMessage, sendMessage: (_msg, respond) => respond?.() },
    },
  });
  run(content, "config.js", "listing.js", "listam.js");
  const context = createContext({
    AbortSignal,
    TextDecoder,
    URL,
    importScripts: (...files) => run(context, ...files),
    fetch: async (url, options) => {
      fetches.push({ url, options });
      if (page.fetchResponse) return page.fetchResponse();
      return new Response(page.body ?? listingHtml, {
        status: page.httpStatus || 200, headers: { "Content-Type": "text/html" },
      });
    },
    chrome: {
      runtime: {
        onMessage,
        getURL: () => popup,
        connectNative: () => { connections++; return port; },
        sendMessage: async (msg) => {
          let response;
          onOffscreenMessage.emit(msg, {}, (value) => { response = value; });
          return response;
        },
      },
      tabs: {
        onRemoved: event(),
        query: async () => page.open ? [
          { id: 1, url: "https://www.list.am/item/777" },
          { id: 2, url: "https://www.list.am/ru/item/24173931?from=favorites" },
        ] : [],
        sendMessage: async (tabId, msg, { frameId }) => {
          tabsRead.push({ tabId, type: msg.type, itemId: msg.itemId, frameId });
          let result;
          onContentMessage.emit(msg, {}, (value) => { result = value; });
          return result;
        },
      },
      offscreen: { hasDocument: async () => true },
      storage: { local: { get: async (key) => {
        cacheReads.push(key);
        return { [key]: record };
      } } },
    },
  });
  run(context, "background.js");
  return {
    send(type, sender = popup) {
      let result;
      onMessage.emit({ type }, { url: sender }, (value) => { result = value; });
      return result;
    },
    cacheReads,
    fetches,
    tabsRead,
    get connections() { return connections; },
  };
}

test("only the popup connects MCP, and invalid native requests never reach a source", { timeout: 3000 }, async () => {
  const onMessage = event();
  const onDisconnect = event();
  const posted = Promise.withResolvers();
  const browser = worker({ onMessage, onDisconnect, postMessage: posted.resolve }, {
    status: "found", vin, checkedAt: Date.now(), lot: { vin, vinVerified: true },
  });

  browser.send("mcpConnect", otherSender);
  assert.equal(browser.connections, 0);
  assert.equal(browser.send("mcpConnect"), "connecting");
  assert.equal(browser.connections, 1);
  onMessage.emit({ type: "ready" });
  assert.equal(browser.send("mcpStatus"), "connected");
  await onMessage.emit({ type: "lookup", id: "bad", vin: "https://example.com/" });
  await onMessage.emit({ type: "checkListing", id: "bad", itemId: "../24173931" });
  assert.deepEqual(browser.cacheReads, []);
  assert.deepEqual(browser.fetches, []);
  await onMessage.emit({ type: "lookup", id: "first", vin });
  const response = await posted.promise;
  assert.equal(response.id, "first");
  assert.equal(response.result.fromCache, true);
  assert.deepEqual(browser.cacheReads, [`vin:${vin}`]);
  onDisconnect.emit();
  assert.notEqual(browser.send("mcpStatus"), "connected");
});

test("a disconnected MCP port cannot start an auction lookup after reading a listing", async () => {
  const onMessage = event();
  const onDisconnect = event();
  const fetching = Promise.withResolvers();
  const html = Promise.withResolvers();
  const browser = worker({ onMessage, onDisconnect, postMessage: assert.fail }, null, {
    doc: listingDocument({ vin, mileage: "113,000 կմ", condition: "Չվթարված" }),
    fetchResponse: () => { fetching.resolve(); return html.promise; },
  });
  browser.send("mcpConnect");
  onMessage.emit({ type: "ready" });
  const checking = onMessage.emit({ type: "checkListing", id: "first", itemId: "24173931" });
  await fetching.promise;
  onDisconnect.emit();
  html.resolve(new Response(listingHtml, { headers: { "Content-Type": "text/html" } }));
  await checking;
  assert.deepEqual(browser.cacheReads, []);
});

test("local MCP returns verified VIN history and compares exact List.am items", { timeout: 10000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "listam-"));
  const children = [];
  t.after(async () => {
    await Promise.all(children.map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }));
    await rm(directory, { recursive: true, force: true });
  });
  function start(file) {
    const child = spawn(process.execPath, [fileURLToPath(new URL(file, import.meta.url))], {
      env: { ...process.env, LISTAM_MCP_STATE_DIR: join(directory, "state") },
      stdio: ["pipe", "pipe", "inherit"],
    });
    children.push(child);
    return child;
  }

  const mcp = start("server.mjs");
  const replies = new Map();
  createInterface({ input: mcp.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    replies.get(message.id)?.(message);
    replies.delete(message.id);
  });
  let nextId = 0;
  async function call(method, params) {
    const id = ++nextId;
    const reply = new Promise((resolve) => replies.set(id, resolve));
    mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    const message = await reply;
    assert.equal(message.error, undefined, JSON.stringify(message.error));
    return message.result;
  }
  const lookup = (vin) => call("tools/call", { name: "lookup_vin", arguments: { vin } });
  const checkListing = (url) => call("tools/call", { name: "check_listing", arguments: { url } });
  await call("initialize", {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "listam-test", version: "1.0.0" },
  });
  mcp.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  assert.equal((await checkListing("https://www.list.am/item/24173931")).structuredContent?.status, "disconnected");
  assert.deepEqual((await call("tools/list", {})).tools.map((tool) => tool.name).sort(), ["check_listing", "lookup_vin"]);
  assert.equal((await lookup(vin)).structuredContent.status, "disconnected");
  assert.equal((await lookup("IIIIIIIIIIIIIIIII")).isError, true);
  for (const url of ["https://www.list.am.evil.test/item/24173931", "https://name@list.am/item/24173931",
    "https://list.am:8443/item/24173931", "http://www.list.am/item/24173931", "https://www.list.am/item/24173931/extra"]) {
    assert.equal((await checkListing(url)).isError, true);
  }

  const host = start("native-host.mjs");
  const fromHost = readNativeMessages(host.stdout);
  const onMessage = event();
  const photo = "https://mercury.bid.cars/1-61989692/photo.jpg";
  const lot = {
    vin, vinVerified: true, id: "1-61989692", url: "https://bid.cars/en/lot/1-61989692/fixture", odometerMi: 42090,
    primaryDamage: "Front end", secondaryDamage: "Rear", saleDocument: "Salvage",
    images: [photo, "https://images.bid.cars.example/original.jpg"],
  };
  const page = { doc: listingDocument({ vin, mileage: "113,000 կմ", condition: "Չվթարված" }) };
  const browser = worker({
    onMessage, onDisconnect: event(), postMessage: (message) => sendNativeMessage(host.stdin, message),
  }, { status: "found", vin, checkedAt: Date.now(), lot }, page);
  browser.send("mcpConnect");
  const ready = (await fromHost.next()).value;
  assert.equal((await checkListing("https://www.list.am/item/24173931")).structuredContent.status, "update_required");
  await onMessage.emit(ready);
  await onMessage.emit((await fromHost.next()).value);
  assert.equal(browser.send("mcpStatus"), "connected");

  const found = lookup(` ${vin.slice(0, 3).toLowerCase()} ${vin.slice(3).toLowerCase()} `);
  const request = (await fromHost.next()).value;
  assert.equal(request.vin, vin);
  await onMessage.emit(request);
  const { structuredContent } = await found;
  assert.equal(structuredContent.status, "found");
  assert.equal(structuredContent.fromCache, true);
  assert.equal(structuredContent.lot.odometerMi, 42090);
  assert.equal(structuredContent.lot.saleDocument, "Salvage");
  assert.deepEqual(structuredContent.lot.images, [photo]);

  async function compare() {
    const waiting = checkListing("https://list.am/en/item/24173931/?source=share#photos");
    const query = (await fromHost.next()).value;
    assert.equal(query.type, "checkListing");
    assert.equal(query.itemId, "24173931");
    await onMessage.emit(query);
    return (await waiting).structuredContent;
  }
  const mazda = await compare();
  assert.equal(mazda.status, "found");
  assert.equal(mazda.vin, vin);
  assert.equal(mazda.listing.url, "https://www.list.am/item/24173931");
  assert.equal(mazda.listing.mileageKm, 113000);
  assert.equal(mazda.listing.condition, "Չվթարված");
  assert.equal(mazda.auctionMileageKm, 67737);
  assert.deepEqual(mazda.findings.map((finding) => finding.type), ["historical_damage"]);
  assert.equal(browser.fetches[0].url, mazda.listing.url);
  assert.equal(browser.fetches[0].options.redirect, "error");
  assert.equal(browser.fetches[0].options.credentials, "omit");

  const cacheReadsBefore = browser.cacheReads.length;
  page.body = new Uint8Array(4 * 1024 * 1024 + 1);
  assert.equal((await compare()).status, "listing_unavailable");
  assert.equal(browser.cacheReads.length, cacheReadsBefore);
  delete page.body;

  page.httpStatus = 403;
  assert.equal((await compare()).status, "listing_unavailable");
  assert.equal(browser.cacheReads.length, cacheReadsBefore);

  page.open = true;
  page.doc = listingDocument({ vin, mileage: "40,000 mi", condition: "Undamaged" });
  const lowMileage = await compare();
  assert.equal(lowMileage.listing.mileageKm, 64374);
  assert.deepEqual(lowMileage.findings.map((finding) => finding.type), ["historical_damage", "lower_mileage"]);
  assert.deepEqual(browser.tabsRead, [{ tabId: 2, type: "readMcpListing", itemId: "24173931", frameId: 0 }]);
  assert.equal(browser.fetches.length, 3, "an open matching tab avoids a background request");

  const both = [lookup(vin), checkListing("https://www.list.am/item/24173931")];
  const first = (await fromHost.next()).value;
  const second = (await fromHost.next()).value;
  assert.deepEqual([first.type, second.type].sort(), ["checkListing", "lookup"]);
  await Promise.all([onMessage.emit(second), onMessage.emit(first)]);
  assert.deepEqual((await Promise.all(both)).map((answer) => answer.structuredContent.status), ["found", "found"]);

  page.doc = listingDocument({ vin, mileage: "42,000 mi", condition: "" });
  assert.deepEqual((await compare()).findings, [], "small odometer differences stay within tolerance");
  const lastCacheReads = browser.cacheReads.length;
  page.doc = listingDocument({ mileage: "113,000 կմ", condition: "Undamaged" });
  assert.equal((await compare()).status, "no_vin");
  page.doc = listingDocument({ vin: "INVALID", mileage: "113,000 կմ", condition: "Undamaged" });
  assert.equal((await compare()).status, "invalid_vin");
  assert.equal(browser.cacheReads.length, lastCacheReads);

  for (const [status, record] of [
    ["not_found", { status: "not_found", vin }],
    ["blocked", { status: "blocked", vin }],
    ["error", { status: "found", vin, lot: { ...lot, vin: "1HGCM82633A000000" } }],
  ]) {
    const waiting = lookup(vin);
    const { id } = (await fromHost.next()).value;
    sendNativeMessage(host.stdin, { type: "lookupResult", id, result: record });
    const data = (await waiting).structuredContent;
    assert.equal(data.status, status);
    if (status === "blocked") assert.equal(data.verificationUrl, "https://bid.cars/");
  }

  const interrupted = lookup(vin);
  await fromHost.next();
  host.stdin.end();
  assert.equal((await interrupted).structuredContent.status, "disconnected");
});
