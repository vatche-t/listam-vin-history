# Auction detective with MCP

The local server uses standard MCP over `stdio`, so any local MCP client that can launch a command can use it
with its own supported model. Both tools use the installed List.am VIN History extension.

| Tool | What it returns |
| --- | --- |
| `lookup_vin(vin)` | A matching Bid.Cars lot, damage, title type, mileage, sale date, and photo links when available. |
| `check_listing(url)` | The seller’s listed mileage and condition, the auction record for the exact VIN, and any differences with links to both sources. |

## Setup on macOS

1. Install Node.js 22 or newer. Load the repo’s `extension/` folder as an unpacked extension in desktop Brave
   or Chrome. If it is already loaded from this checkout, reload it. Copy the extension ID from the browser’s
   extensions page with **Developer mode** on.
2. Run the following from the repo root, replacing `YOUR_EXTENSION_ID` with the ID you copied.

   ```sh
   cd mcp
   npm ci
   npm run setup -- YOUR_EXTENSION_ID
   ```

3. Merge the printed `listam-vin-history` entry into your client’s settings and restart the client.

   | Client | Config location |
   | --- | --- |
   | Codex | `~/.codex/config.toml` using the printed TOML entry |
   | [Claude Desktop](https://modelcontextprotocol.io/docs/develop/connect-local-servers) | `~/Library/Application Support/Claude/claude_desktop_config.json` using the printed JSON |
   | [Claude Code](https://code.claude.com/docs/en/mcp) | `.mcp.json` in your project using the printed JSON |
   | [Cursor](https://cursor.com/docs/mcp) | `~/.cursor/mcp.json` or `.cursor/mcp.json` in your project using the printed JSON |
   | [Gemini CLI](https://geminicli.com/docs/tools/mcp-server/) | `~/.gemini/settings.json` using the printed JSON |
   | Other local MCP clients | Add a `stdio` server with the printed `command` and `args` |

   Keep the printed Codex timeout. If your client exposes a tool timeout, allow at least 125 seconds for slow
   lookups. Use the absolute paths from setup so desktop apps can find Node and the server.
4. Allow the browser’s native messaging permission when loading or updating the extension. Open the extension
   popup and choose **Connect MCP** to start the bridge. Keep the browser open while using the tools. Connect
   again after restarting the browser or reloading the extension. If you already use the VIN tool, reload
   the updated extension and reconnect before trying the listing tool.

## Try it

> 🔎 Check `https://www.list.am/item/24173931` against its auction history. What differs, and where are the photos?

> Give me the auction backstory for VIN `JM1GL1VM3L1522160`. Show the damage and photo links.

The listing tool prefers an open tab for the requested item. If it cannot read the page in the background,
open the listing in the connected browser, wait for the vehicle details, and retry. A damage finding describes
an earlier auction. The car may have been repaired since then. A mileage finding requires the seller’s reading
to be more than 1,000 km below the auction reading after unit conversion.

If Bid.Cars asks for a human check, open [Bid.Cars](https://bid.cars/) in the connected browser, complete the
check, and retry. An empty result means Bid.Cars has no matching record for that lookup. Its archive covers
only part of a car’s history.

The bridge shares the VIN, requested listing fields, and auction results with the MCP client. Browser cookies
stay in the browser. Choose **Disconnect MCP** in the popup to close the local connection. To remove the setup,
remove the MCP entry from your client and delete `io.github.mysticcode99.listam_vin_history.json` from
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`. The local launcher lives in
`~/.listam-vin-history/`.

## Verify locally

Run `npm test` in `mcp/`. The tests use a simulated browser and never query the auction site.
