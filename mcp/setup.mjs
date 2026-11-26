import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_NAME, LOOKUP_TIMEOUT_MS, privateDirectory } from "./bridge.mjs";

async function replaceFile(path, content, mode) {
  const temp = `${path}.${randomUUID()}`;
  try {
    await writeFile(temp, content, { mode, flag: "wx" });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

const extensionId = process.argv[2];
const shellArg = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
try {
  if (!/^[a-p]{32}$/.test(extensionId || "")) {
    throw new Error("Run npm run setup -- <extension-id> with the ID from the browser’s extensions page.");
  }
  if (process.platform !== "darwin") throw new Error("This installer supports Chrome and Brave on macOS.");

  const launcher = join(await privateDirectory(true), "native-host");
  const nativeHost = fileURLToPath(new URL("native-host.mjs", import.meta.url));
  await replaceFile(launcher, `#!/bin/sh\nexec ${shellArg(process.execPath)} ${shellArg(nativeHost)}\n`, 0o700);

  const directory = join(homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
  await mkdir(directory, { recursive: true });
  const manifest = {
    name: HOST_NAME,
    description: "List.am VIN History local MCP bridge",
    path: launcher,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  await replaceFile(join(directory, `${HOST_NAME}.json`), JSON.stringify(manifest, null, 2) + "\n", 0o600);

  const server = fileURLToPath(new URL("server.mjs", import.meta.url));
  const settings = { mcpServers: { "listam-vin-history": { command: process.execPath, args: [server] } } };
  console.log(`Browser bridge installed. Open the extension popup and choose Connect MCP.

JSON settings for Claude Desktop, Claude Code, Cursor, and Gemini CLI

${JSON.stringify(settings, null, 2)}

Codex settings for ~/.codex/config.toml

[mcp_servers.listam-vin-history]
command = ${JSON.stringify(process.execPath)}
args = [${JSON.stringify(server)}]
tool_timeout_sec = ${LOOKUP_TIMEOUT_MS / 1000 + 10}
`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
