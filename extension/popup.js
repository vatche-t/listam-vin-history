const statusEl = document.getElementById("status");
const recheckBtn = document.getElementById("recheck");
const clearBtn = document.getElementById("clear");
const manualVin = document.getElementById("manualVin");
const msgEl = document.getElementById("msg");

function setStatus(cls, ...parts) {
  statusEl.className = cls || "";
  statusEl.replaceChildren(...parts);
}

function code(text) {
  const c = document.createElement("code");
  c.textContent = text;
  return c;
}

function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.textContent = text;
  return a;
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onListam = tab && /^https:\/\/www\.list\.am\/(?:[a-z]{2}\/)?item\//.test(tab.url || "");
  if (!onListam) {
    setStatus("", "Open a car listing on list.am to check its auction history.");
    recheckBtn.disabled = true;
    return;
  }

  const s = await chrome.runtime.sendMessage({ type: "getTabStatus", tabId: tab.id });
  recheckBtn.disabled = !(s && s.vin);
  recheckBtn.onclick = async () => {
    await chrome.tabs.sendMessage(tab.id, { type: "recheck" }).catch(() => {});
    setStatus("", "Checking ", code(s.vin), "…");
    setTimeout(refresh, 1500);
  };

  if (!s) return setStatus("", "Waiting for the page…");
  switch (s.status) {
    case "loading":
      return setStatus("", "Checking ", code(s.vin), " on bid.cars…");
    case "found":
      return setStatus("found", "Auction history found for ", code(s.vin), ". ", link(s.lotUrl, `Lot ${s.lotId} ↗`));
    case "not_found":
      return setStatus("not_found", "No auction history on bid.cars for ", code(s.vin), ".");
    case "no_vin":
      return setStatus("", "This listing has no VIN.");
    case "invalid_vin":
      return setStatus("invalid_vin", "The VIN on this listing looks invalid: ", code(s.raw || ""));
    case "blocked":
      return setStatus("blocked", "bid.cars asks for a human check. Open bid.cars, pass the check, then Re-check.");
    case "unsupported":
      return setStatus("error", "Unsupported list.am page layout. The extension may need an update.");
    default:
      return setStatus("error", "Error: ", s.error || "unknown");
  }
}

clearBtn.onclick = async () => {
  await chrome.runtime.sendMessage({ type: "clearCache" });
  msgEl.textContent = "Cache cleared.";
};

chrome.storage.local.get("settings").then(({ settings }) => {
  manualVin.checked = !!(settings && settings.manualVinInput);
});

manualVin.onchange = async () => {
  const { settings } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({ settings: { ...(settings || {}), manualVinInput: manualVin.checked } });
  msgEl.textContent = "Saved. Reload the listing to apply.";
};

const mcpButton = document.getElementById("mcp");
const mcpStatus = document.getElementById("mcp-status");
let mcpConnected = false;

function showMcpState(state) {
  mcpConnected = state === "connected";
  mcpButton.disabled = state === "connecting";
  mcpButton.textContent = mcpConnected ? "Disconnect MCP" : "Connect MCP";
  mcpStatus.textContent = {
    connected: "Ready for VIN and listing checks from your MCP client.",
    connecting: "Opening the local connection…",
    unavailable: "Couldn’t start the local bridge. Check the MCP setup in the README.",
    disconnected: "Optional. Set up the local MCP before connecting.",
  }[state] || "";
}

mcpButton.onclick = async () => {
  try {
    await chrome.runtime.sendMessage({ type: mcpConnected ? "mcpDisconnect" : "mcpConnect" });
  } catch (_) {
    showMcpState("unavailable");
  }
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "mcpStateChanged") showMcpState(msg.state);
});
chrome.runtime.sendMessage({ type: "mcpStatus" }).then(showMcpState, () => showMcpState("unavailable"));

refresh();
