import { lstat, mkdir } from "node:fs/promises";
import { endianness, homedir } from "node:os";
import { join, resolve } from "node:path";

export const HOST_NAME = "io.github.mysticcode99.listam_vin_history";
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
export const ITEM_ID_PATTERN = /^\d{1,12}$/;
export const LOOKUP_TIMEOUT_MS = 115_000;
export const MAX_MESSAGE_BYTES = 1024 * 1024;

export async function privateDirectory(create = false) {
  const directory = resolve(process.env.LISTAM_MCP_STATE_DIR || join(homedir(), ".listam-vin-history"));
  if (create) {
    await mkdir(directory, { mode: 0o700 }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
  }
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.uid !== process.geteuid() || (stat.mode & 0o077)) {
    throw new Error("The bridge directory must be privately owned with mode 0700.");
  }
  return directory;
}

const littleEndian = endianness() === "LE";

export async function* readNativeMessages(stream) {
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = littleEndian ? buffer.readUInt32LE() : buffer.readUInt32BE();
      if (size < 1 || size > MAX_MESSAGE_BYTES) throw new Error("Invalid native message size.");
      if (buffer.length < 4 + size) break;
      yield JSON.parse(buffer.toString("utf8", 4, 4 + size));
      buffer = buffer.subarray(4 + size);
    }
  }
  if (buffer.length) throw new Error("Incomplete native message.");
}

export function sendNativeMessage(stream, value) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > MAX_MESSAGE_BYTES) throw new Error("Native message too large.");
  const prefix = Buffer.alloc(4);
  if (littleEndian) prefix.writeUInt32LE(body.length);
  else prefix.writeUInt32BE(body.length);
  stream.write(Buffer.concat([prefix, body]));
}
