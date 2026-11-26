import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { ITEM_ID_PATTERN, VIN_PATTERN, privateDirectory, readNativeMessages, sendNativeMessage } from "./bridge.mjs";

const pending = new Map();
let listingReady = false;
const server = createServer((request, response) => {
  const [, route, value] = request.url?.split("/") ?? [];
  const payload = route === "vin" && VIN_PATTERN.test(value) ? { type: "lookup", vin: value }
    : route === "listing" && ITEM_ID_PATTERN.test(value) ? { type: "checkListing", itemId: value } : null;
  if (request.method !== "GET" || !payload || request.url !== `/${route}/${value}`) {
    response.writeHead(400).end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  if (route === "listing" && !listingReady) {
    response.end(JSON.stringify({ status: "update_required" }));
    return;
  }
  if (pending.size >= 4) {
    response.end(JSON.stringify({ status: "busy" }));
    return;
  }
  const id = randomUUID();
  pending.set(id, response);
  response.on("close", () => pending.delete(id));
  sendNativeMessage(process.stdout, { ...payload, id });
});

let session;
try {
  session = await mkdtemp(join(await privateDirectory(true), "b-"));
  await once(server.listen(join(session, "lookup.sock")), "listening");
  process.stdout.on("error", () => process.stdin.destroy());
  sendNativeMessage(process.stdout, { type: "ready", listingHandshake: true });

  for await (const message of readNativeMessages(process.stdin)) {
    if (message?.type === "listingCapability") {
      listingReady = true;
      sendNativeMessage(process.stdout, { type: "listingReady" });
    } else if (message?.type === "lookupResult") {
      pending.get(message.id)?.end(JSON.stringify(message.result ?? null));
      pending.delete(message.id);
    }
  }
} catch (error) {
  console.error(`List.am native host: ${error.message}`);
  process.exitCode = 1;
} finally {
  server.close();
  server.closeAllConnections();
  if (session) await rm(session, { recursive: true, force: true });
}
