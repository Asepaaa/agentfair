"use strict";

/* =====================================================================
 * AgentFair — static frontend
 *
 * No backend, no accounts, no sessions, no QR / pairing-code login.
 * Reads go to a public BNB Chain RPC. Writes are proposed to the user's
 * own injected wallet (window.ethereum) and signed only after the user
 * confirms them there. Nothing is ever sent anywhere else.
 * ===================================================================== */

/* ============================ CONFIG ============================ *
 * After deployment, set AGENTFAIR_CONTRACT_ADDRESS to the deployed,
 * BscScan-verified AgentFair address. Everything else stays as-is.  */
const CONFIG = {
  // Deployed on BSC mainnet 2026-11-19 (see ../DEPLOY-RESULT.md).
  AGENTFAIR_CONTRACT_ADDRESS: "0xB4e3ac1647f17D3676B98a61159EeA71749B8E37",
  AGENT_ID_REGISTRY: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",
  BSC_RPC_URL: "https://bsc-dataseed.binance.org",
  CHAIN_ID: 56,
  CHAIN_NAME: "BNB Smart Chain",
};
/* ========================== END CONFIG ========================== */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEPLOYED = CONFIG.AGENTFAIR_CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS;

// ABI of src/AgentFair.sol, extracted verbatim from the Foundry build
// artifact (out/AgentFair.sol/AgentFair.json), constructor entry omitted.
const AGENTFAIR_ABI = [{"type":"function","name":"checkIn","inputs":[],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"claim","inputs":[{"name":"dropId","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"createDrop","inputs":[{"name":"token","type":"address","internalType":"address"},{"name":"amountPerClaim","type":"uint256","internalType":"uint256"},{"name":"maxClaims","type":"uint256","internalType":"uint256"},{"name":"durationSeconds","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"dropId","type":"uint256","internalType":"uint256"}],"stateMutability":"nonpayable"},{"type":"function","name":"dropCount","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"drops","inputs":[{"name":"","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"creator","type":"address","internalType":"address"},{"name":"token","type":"address","internalType":"address"},{"name":"amountPerClaim","type":"uint256","internalType":"uint256"},{"name":"maxClaims","type":"uint256","internalType":"uint256"},{"name":"claimed","type":"uint256","internalType":"uint256"},{"name":"deadline","type":"uint256","internalType":"uint256"},{"name":"withdrawn","type":"bool","internalType":"bool"}],"stateMutability":"view"},{"type":"function","name":"hasClaimed","inputs":[{"name":"","type":"uint256","internalType":"uint256"},{"name":"","type":"bytes32","internalType":"bytes32"}],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view"},{"type":"function","name":"identityKeyOf","inputs":[{"name":"user","type":"address","internalType":"address"}],"outputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"stateMutability":"view"},{"type":"function","name":"lastCheckInDay","inputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"registry","inputs":[],"outputs":[{"name":"","type":"address","internalType":"contract IAgentIDRegistry"}],"stateMutability":"view"},{"type":"function","name":"streakOf","inputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"withdrawUnclaimed","inputs":[{"name":"dropId","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"event","name":"CheckedIn","inputs":[{"name":"user","type":"address","indexed":true,"internalType":"address"},{"name":"identityKey","type":"bytes32","indexed":true,"internalType":"bytes32"},{"name":"streak","type":"uint256","indexed":false,"internalType":"uint256"},{"name":"day","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},{"type":"event","name":"Claimed","inputs":[{"name":"dropId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"claimer","type":"address","indexed":true,"internalType":"address"},{"name":"identityKey","type":"bytes32","indexed":true,"internalType":"bytes32"},{"name":"amount","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},{"type":"event","name":"DropCreated","inputs":[{"name":"dropId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"creator","type":"address","indexed":true,"internalType":"address"},{"name":"token","type":"address","indexed":true,"internalType":"address"},{"name":"amountPerClaim","type":"uint256","indexed":false,"internalType":"uint256"},{"name":"maxClaims","type":"uint256","indexed":false,"internalType":"uint256"},{"name":"deadline","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},{"type":"event","name":"Withdrawn","inputs":[{"name":"dropId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"creator","type":"address","indexed":true,"internalType":"address"},{"name":"amount","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},{"type":"error","name":"AlreadyCheckedInToday","inputs":[]},{"type":"error","name":"AlreadyClaimed","inputs":[]},{"type":"error","name":"AlreadyWithdrawn","inputs":[]},{"type":"error","name":"DepositShortfall","inputs":[]},{"type":"error","name":"DropExhausted","inputs":[]},{"type":"error","name":"DropExpired","inputs":[]},{"type":"error","name":"DropNotFound","inputs":[]},{"type":"error","name":"DropStillActive","inputs":[]},{"type":"error","name":"MissingHandle","inputs":[]},{"type":"error","name":"NotAnAgentIDHolder","inputs":[]},{"type":"error","name":"NotDropCreator","inputs":[]},{"type":"error","name":"ReentrantCall","inputs":[]},{"type":"error","name":"TransferFailed","inputs":[]},{"type":"error","name":"ZeroAddress","inputs":[]},{"type":"error","name":"ZeroAmountPerClaim","inputs":[]},{"type":"error","name":"ZeroDuration","inputs":[]},{"type":"error","name":"ZeroMaxClaims","inputs":[]}];

// Minimal registry interface — only the two functions verified to exist
// on the SPACE ID Agent ID registry (see ../DESIGN.md, section 2).
const REGISTRY_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function handleOf(address owner) view returns (string)",
];

// Standard ERC-20 surface used for token metadata and the create-drop flow.
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// Plain-language text for the contract's custom errors.
const ERROR_TEXT = {
  NotAnAgentIDHolder: "This wallet does not hold an Agent ID, so it cannot claim or check in.",
  MissingHandle: "Your Agent ID has no handle set, so it cannot be used here yet.",
  AlreadyClaimed: "This Agent ID has already claimed its one share of this drop.",
  DropExpired: "This drop's deadline has passed, so it can no longer be claimed.",
  DropExhausted: "All shares of this drop have already been claimed.",
  DropNotFound: "That drop does not exist.",
  NotDropCreator: "Only the drop's own creator can do that.",
  DropStillActive: "The drop is still active — the unclaimed remainder can only be withdrawn after its deadline.",
  AlreadyWithdrawn: "The unclaimed remainder of this drop was already withdrawn.",
  AlreadyCheckedInToday: "This Agent ID has already checked in today (UTC). The next check-in opens tomorrow.",
  DepositShortfall: "The deposit did not arrive in full — the token may charge a transfer fee. The drop was not created.",
  TransferFailed: "A token transfer failed.",
  ZeroAddress: "A zero address was supplied.",
  ZeroAmountPerClaim: "The amount per claim must be more than zero.",
  ZeroMaxClaims: "The maximum number of claims must be more than zero.",
  ZeroDuration: "The duration must be more than zero.",
};

/* ------------------------------ state ------------------------------ */

const state = {
  account: null,
  signer: null,
  walletProvider: null,
  isHolder: false,
  handle: null,
  identityKey: null,
  drops: [],
  tokenMeta: new Map(),   // lowercase token address -> meta object
  claimedByMe: new Map(), // dropId -> bool
  checkin: null,          // { streak: number, lastDay: number }
  formToken: null,        // { address, symbol, decimals, metaOk }
  walletEventsBound: false,
};

let readProvider = null;
let agentFairRead = null;
let registryRead = null;
let agentFairIface = null;

/* --------------------------- DOM helpers --------------------------- */

const $ = (id) => document.getElementById(id);
const boardList = $("boardList"), boardMsg = $("boardMsg");
const checkinBody = $("checkinBody"), checkinMsg = $("checkinMsg");
const createMsg = $("createMsg"), myDropsList = $("myDropsList"), myDropsMsg = $("myDropsMsg");
const globalMsg = $("globalMsg");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function setMsg(el, text, kind) {
  el.textContent = text || "";
  el.className = "msg " + (kind || "info");
}

function showGlobal(text) {
  if (!text) { globalMsg.hidden = true; globalMsg.textContent = ""; return; }
  globalMsg.hidden = false;
  globalMsg.textContent = text;
}

function shortenAddress(a) {
  return a && a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a;
}

function fmtAmount(raw, meta) {
  // raw: BigInt in the token's smallest units.
  if (!meta || !meta.decimalsOk) return raw.toString() + " (raw units — token metadata unavailable)";
  let s = ethers.formatUnits(raw, meta.decimals);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s;
}

function fmtDateTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium", timeStyle: "short",
  });
}

function fmtRelative(unixSeconds) {
  const diff = unixSeconds - Math.floor(Date.now() / 1000);
  const abs = Math.abs(diff);
  const parts = [];
  const d = Math.floor(abs / 86400), h = Math.floor((abs % 86400) / 3600), m = Math.floor((abs % 3600) / 60);
  if (d > 0) parts.push(d + "d");
  if (h > 0) parts.push(h + "h");
  if (parts.length === 0) parts.push(Math.max(m, 1) + "m");
  return diff >= 0 ? "in " + parts.join(" ") : parts.join(" ") + " ago";
}

function todayUtcDay() {
  return Math.floor(Date.now() / 1000 / 86400);
}

/* --------------------------- error text ---------------------------- */

function friendlyError(e) {
  if (!e) return "Unknown error.";
  const message = e.message || "";
  if (e.code === 4001 || /user rejected|user denied/i.test(message)) {
    return "You rejected the request in your wallet. Nothing was sent.";
  }
  // Try to decode a custom error from the revert data.
  const data = e.data || (e.info && e.info.error && e.info.error.data) || null;
  if (agentFairIface && typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
    try {
      const parsed = agentFairIface.parseError(data);
      if (parsed && ERROR_TEXT[parsed.name]) return ERROR_TEXT[parsed.name];
    } catch (_) { /* fall through */ }
  }
  // Some providers surface the error name in the message itself.
  for (const name of Object.keys(ERROR_TEXT)) {
    if (message.includes(name)) return ERROR_TEXT[name];
  }
  if (e.shortMessage) return e.shortMessage;
  return message ? message.slice(0, 300) : String(e);
}

/* --------------------------- providers ----------------------------- */

function initReadLayer() {
  readProvider = new ethers.JsonRpcProvider(CONFIG.BSC_RPC_URL, CONFIG.CHAIN_ID, { staticNetwork: true });
  registryRead = new ethers.Contract(CONFIG.AGENT_ID_REGISTRY, REGISTRY_ABI, readProvider);
  agentFairIface = new ethers.Interface(AGENTFAIR_ABI);
  if (DEPLOYED) {
    agentFairRead = new ethers.Contract(CONFIG.AGENTFAIR_CONTRACT_ADDRESS, AGENTFAIR_ABI, readProvider);
  }
}

function agentFairWithSigner() {
  return new ethers.Contract(CONFIG.AGENTFAIR_CONTRACT_ADDRESS, AGENTFAIR_ABI, state.signer);
}

function erc20Read(address) {
  return new ethers.Contract(address, ERC20_ABI, readProvider);
}

function erc20WithSigner(address) {
  return new ethers.Contract(address, ERC20_ABI, state.signer);
}

/* ------------------------- token metadata -------------------------- */

async function getTokenMeta(address) {
  const key = address.toLowerCase();
  if (state.tokenMeta.has(key)) return state.tokenMeta.get(key);
  const token = erc20Read(address);
  const meta = { address, symbol: null, name: null, decimals: 18, decimalsOk: false, ok: false };
  try { meta.symbol = await token.symbol(); meta.ok = true; } catch (_) { /* non-standard token */ }
  try { meta.name = await token.name(); } catch (_) { /* optional */ }
  try { meta.decimals = Number(await token.decimals()); meta.decimalsOk = true; meta.ok = true; } catch (_) { /* keep fallback */ }
  if (!meta.symbol) meta.symbol = "Token " + shortenAddress(address);
  state.tokenMeta.set(key, meta);
  return meta;
}

/* ------------------------------ board ------------------------------ */

async function mapChunked(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

function normalizeDrop(id, d) {
  return {
    id,
    creator: d.creator,
    token: d.token,
    amountPerClaim: d.amountPerClaim,       // BigInt
    maxClaims: Number(d.maxClaims),
    claimed: Number(d.claimed),
    deadline: Number(d.deadline),           // unix seconds
    withdrawn: d.withdrawn,
  };
}

function dropStatus(d) {
  const now = Math.floor(Date.now() / 1000);
  if (d.claimed >= d.maxClaims) return "exhausted";
  if (now >= d.deadline) return "expired";
  return "open";
}

async function refreshClaimedFlags() {
  state.claimedByMe.clear();
  if (!state.identityKey || state.drops.length === 0) return;
  const flags = await mapChunked(state.drops, 20, (d) => agentFairRead.hasClaimed(d.id, state.identityKey));
  state.drops.forEach((d, i) => state.claimedByMe.set(d.id, flags[i]));
}

async function loadBoard() {
  if (!DEPLOYED) {
    boardList.innerHTML = '<p class="empty">The AgentFair contract is not deployed yet, so there are no drops to show. This board will list every drop — token, amount per claim, claims made, deadline and status — as soon as the contract is live.</p>';
    setMsg(boardMsg, "", "info");
    return;
  }
  setMsg(boardMsg, "Loading drops from the contract…", "info");
  try {
    const count = Number(await agentFairRead.dropCount());
    const ids = Array.from({ length: count }, (_, i) => i);
    const raw = await mapChunked(ids, 20, (i) => agentFairRead.drops(i));
    state.drops = raw.map((d, i) => normalizeDrop(i, d));
    const uniqueTokens = [...new Set(state.drops.map((d) => d.token))];
    await Promise.all(uniqueTokens.map((t) => getTokenMeta(t)));
    await refreshClaimedFlags();
    renderBoard();
    renderMyDrops();
    setMsg(boardMsg, count === 0 ? "" : "Showing " + count + " drop" + (count === 1 ? "" : "s") + ".", "info");
  } catch (e) {
    boardList.innerHTML = '<p class="empty">The drop board could not be loaded.</p>';
    setMsg(boardMsg, "Could not load drops: " + friendlyError(e), "err");
  }
}

function claimButtonState(d, status) {
  // Returns { disabled, label, note } for a drop's claim button.
  if (status === "exhausted") return { disabled: true, label: "Fully claimed", note: "" };
  if (status === "expired") return { disabled: true, label: "Deadline passed", note: "" };
  if (!state.account) return { disabled: true, label: "Claim one share", note: "Connect a wallet holding an Agent ID to claim." };
  if (!state.isHolder) return { disabled: true, label: "Claim one share", note: "This wallet holds no Agent ID, so it cannot claim." };
  if (state.claimedByMe.get(d.id)) return { disabled: true, label: "Claimed", note: "Your Agent ID has already claimed its one share of this drop." };
  return { disabled: false, label: "Claim one share", note: "Free apart from network gas. One share per Agent ID." };
}

function renderBoard() {
  if (state.drops.length === 0) {
    boardList.innerHTML = '<p class="empty">No drops have been created yet. Anyone can open the first one below.</p>';
    return;
  }
  boardList.innerHTML = state.drops.map((d) => {
    const meta = state.tokenMeta.get(d.token.toLowerCase());
    const status = dropStatus(d);
    const pct = d.maxClaims > 0 ? Math.min(100, Math.round((d.claimed / d.maxClaims) * 100)) : 0;
    const btn = claimButtonState(d, status);
    const badgeText = status === "open" ? "Open" : status === "expired" ? "Expired" : "Exhausted";
    return (
      '<article class="drop">' +
        '<div class="drop-head">' +
          '<span class="drop-title">Drop #' + d.id + " — " + escapeHtml(meta ? meta.symbol : "Token") + "</span>" +
          '<span class="badge ' + status + '">' + badgeText + "</span>" +
        "</div>" +
        '<dl class="kv">' +
          "<div><dt>Token</dt><dd class=\"mono\" title=\"" + escapeHtml(d.token) + "\">" + escapeHtml(shortenAddress(d.token)) + "</dd></div>" +
          "<div><dt>Amount per claim</dt><dd>" + escapeHtml(fmtAmount(d.amountPerClaim, meta)) + " " + escapeHtml(meta ? meta.symbol : "") + "</dd></div>" +
          "<div><dt>Claims</dt><dd>" + d.claimed + " / " + d.maxClaims + "</dd></div>" +
          "<div><dt>Deadline</dt><dd>" + escapeHtml(fmtDateTime(d.deadline)) + " (" + escapeHtml(fmtRelative(d.deadline)) + ")</dd></div>" +
          "<div><dt>Creator</dt><dd class=\"mono\" title=\"" + escapeHtml(d.creator) + "\">" + escapeHtml(shortenAddress(d.creator)) + "</dd></div>" +
        "</dl>" +
        '<div class="progress"><div style="width:' + pct + '%"></div></div>' +
        '<div class="drop-actions">' +
          '<button type="button" class="primary" data-claim="' + d.id + '"' + (btn.disabled ? " disabled" : "") + ">" + btn.label + "</button>" +
          (btn.note ? '<span class="note">' + escapeHtml(btn.note) + "</span>" : "") +
        "</div>" +
      "</article>"
    );
  }).join("");
  boardList.querySelectorAll("[data-claim]").forEach((b) => {
    b.addEventListener("click", () => claimDrop(Number(b.getAttribute("data-claim"))));
  });
}

/* ---------------------------- my drops ----------------------------- */

function renderMyDrops() {
  if (!DEPLOYED) {
    myDropsList.innerHTML = '<p class="empty">Available once the AgentFair contract is deployed.</p>';
    return;
  }
  if (!state.account) {
    myDropsList.innerHTML = '<p class="empty">Connect your wallet to see drops you created.</p>';
    return;
  }
  const mine = state.drops.filter((d) => d.creator.toLowerCase() === state.account.toLowerCase());
  if (mine.length === 0) {
    myDropsList.innerHTML = '<p class="empty">This wallet has not created any drops.</p>';
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  myDropsList.innerHTML = mine.map((d) => {
    const meta = state.tokenMeta.get(d.token.toLowerCase());
    const remaining = BigInt(d.maxClaims - d.claimed) * d.amountPerClaim;
    const pastDeadline = now >= d.deadline;
    let action;
    if (d.withdrawn) {
      action = '<span class="badge withdrawn">Withdrawn</span>';
    } else if (pastDeadline) {
      action = '<button type="button" class="primary" data-withdraw="' + d.id + '">Withdraw unclaimed (' +
        escapeHtml(fmtAmount(remaining, meta)) + " " + escapeHtml(meta ? meta.symbol : "") + ")</button>";
    } else {
      action = '<button type="button" disabled>Withdraw unclaimed</button>' +
        '<span class="note">Available after the deadline, ' + escapeHtml(fmtDateTime(d.deadline)) + ".</span>";
    }
    return (
      '<article class="drop">' +
        '<div class="drop-head">' +
          '<span class="drop-title">Drop #' + d.id + " — " + escapeHtml(meta ? meta.symbol : "Token") + "</span>" +
          '<span class="badge ' + dropStatus(d) + '">' + escapeHtml(dropStatus(d)) + "</span>" +
        "</div>" +
        '<dl class="kv">' +
          "<div><dt>Amount per claim</dt><dd>" + escapeHtml(fmtAmount(d.amountPerClaim, meta)) + " " + escapeHtml(meta ? meta.symbol : "") + "</dd></div>" +
          "<div><dt>Claims</dt><dd>" + d.claimed + " / " + d.maxClaims + "</dd></div>" +
          "<div><dt>Unclaimed remainder</dt><dd>" + escapeHtml(fmtAmount(remaining, meta)) + " " + escapeHtml(meta ? meta.symbol : "") + "</dd></div>" +
          "<div><dt>Deadline</dt><dd>" + escapeHtml(fmtDateTime(d.deadline)) + "</dd></div>" +
        "</dl>" +
        '<div class="drop-actions">' + action + "</div>" +
      "</article>"
    );
  }).join("");
  myDropsList.querySelectorAll("[data-withdraw]").forEach((b) => {
    b.addEventListener("click", () => withdrawDrop(Number(b.getAttribute("data-withdraw"))));
  });
}

/* ----------------------------- wallet ------------------------------ */

function renderWallet() {
  const btn = $("btnConnect");
  const chip = $("accountChip");
  const handleLine = $("handleLine");
  if (!state.account) {
    btn.hidden = false;
    btn.textContent = "Connect Wallet";
    chip.hidden = true;
    handleLine.hidden = true;
    return;
  }
  btn.hidden = true;
  chip.hidden = false;
  chip.textContent = state.account;
  chip.title = state.account;
  handleLine.hidden = false;
  if (state.isHolder && state.handle) {
    handleLine.innerHTML = "Agent ID: <strong>" + escapeHtml(state.handle) + ".ai</strong>";
  } else if (state.isHolder) {
    handleLine.textContent = "Agent ID: held (no handle set)";
  } else {
    handleLine.textContent = "This wallet holds no Agent ID.";
  }
}

async function loadIdentity() {
  state.isHolder = false;
  state.handle = null;
  state.identityKey = null;
  if (!state.account) return;
  try {
    const balance = await registryRead.balanceOf(state.account);
    state.isHolder = balance > 0n;
    if (state.isHolder) {
      const handle = await registryRead.handleOf(state.account);
      state.handle = handle && handle.length > 0 ? handle : null;
      if (DEPLOYED && agentFairRead) {
        try { state.identityKey = await agentFairRead.identityKeyOf(state.account); }
        catch (_) { state.identityKey = null; }
      }
    }
  } catch (e) {
    showGlobal("Could not read Agent ID status for this wallet: " + friendlyError(e));
  }
}

async function connectWallet() {
  showGlobal("");
  if (!window.ethereum) {
    showGlobal("No injected wallet provider was found in this browser. Open this page inside a wallet browser (for example the Binance app's Web3 browser or a desktop browser with a wallet extension) — AgentFair connects through the standard provider your wallet injects, never through QR codes or pairing codes.");
    return;
  }
  try {
    state.walletProvider = new ethers.BrowserProvider(window.ethereum);
    await state.walletProvider.send("eth_requestAccounts", []);
    let network = await state.walletProvider.getNetwork();
    if (Number(network.chainId) !== CONFIG.CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CONFIG.CHAIN_ID.toString(16) }],
        });
        state.walletProvider = new ethers.BrowserProvider(window.ethereum);
        network = await state.walletProvider.getNetwork();
      } catch (_) { /* handled by the check below */ }
      if (Number(network.chainId) !== CONFIG.CHAIN_ID) {
        showGlobal("Your wallet is not on " + CONFIG.CHAIN_NAME + " (chain " + CONFIG.CHAIN_ID + "). Switch networks in your wallet, then connect again.");
        state.walletProvider = null;
        return;
      }
    }
    state.signer = await state.walletProvider.getSigner();
    state.account = await state.signer.getAddress();
    bindWalletEvents();
    await afterWalletChange();
  } catch (e) {
    showGlobal(friendlyError(e));
  }
}

async function afterWalletChange() {
  await loadIdentity();
  renderWallet();
  await refreshAllowanceAndRender();
  await refreshCheckin();
  if (DEPLOYED) await loadBoard();
}

function bindWalletEvents() {
  if (state.walletEventsBound || !window.ethereum || !window.ethereum.on) return;
  state.walletEventsBound = true;
  window.ethereum.on("accountsChanged", async (accounts) => {
    if (!accounts || accounts.length === 0) {
      state.account = null; state.signer = null; state.isHolder = false;
      state.handle = null; state.identityKey = null; state.checkin = null;
      renderWallet(); renderCheckin(); renderCreateState(); renderMyDrops();
      if (DEPLOYED) await loadBoard();
      return;
    }
    try {
      state.walletProvider = new ethers.BrowserProvider(window.ethereum);
      state.signer = await state.walletProvider.getSigner();
      state.account = await state.signer.getAddress();
      await afterWalletChange();
    } catch (e) { showGlobal(friendlyError(e)); }
  });
  window.ethereum.on("chainChanged", () => { window.location.reload(); });
}

async function trySilentReconnect() {
  // If the wallet already authorised this page in a previous visit, pick the
  // session back up without a popup. Read-only until the user signs anything.
  if (!window.ethereum) return;
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_accounts", []);
    if (!accounts || accounts.length === 0) return;
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CONFIG.CHAIN_ID) return; // stay read-only; user can connect to switch
    state.walletProvider = provider;
    state.signer = await provider.getSigner();
    state.account = await state.signer.getAddress();
    bindWalletEvents();
    await afterWalletChange();
  } catch (_) { /* silent reconnect is best-effort */ }
}

/* ---------------------------- check-in ----------------------------- */

async function refreshCheckin() {
  state.checkin = null;
  if (state.account && state.isHolder && state.identityKey && DEPLOYED && agentFairRead) {
    try {
      const [streak, lastDay] = await Promise.all([
        agentFairRead.streakOf(state.identityKey),
        agentFairRead.lastCheckInDay(state.identityKey),
      ]);
      state.checkin = { streak: Number(streak), lastDay: Number(lastDay) };
    } catch (_) { state.checkin = null; }
  }
  renderCheckin();
}

function renderCheckin() {
  if (!DEPLOYED) {
    checkinBody.innerHTML = '<p class="empty">Check-in opens once the AgentFair contract is deployed. Your streak will be tied to your Agent ID identity, not just this wallet.</p>';
    return;
  }
  if (!state.account) {
    checkinBody.innerHTML = '<p class="empty">Connect your wallet to see your check-in status.</p>';
    return;
  }
  if (!state.isHolder) {
    checkinBody.innerHTML =
      '<p class="empty">This wallet holds no Agent ID, so it cannot check in. ' +
      "Check-ins are recorded against an Agent ID identity. You can still browse the drop board and create drops.</p>" +
      '<button type="button" disabled>Check in</button>';
    return;
  }
  const c = state.checkin || { streak: 0, lastDay: 0 };
  const checkedToday = c.streak > 0 && c.lastDay === todayUtcDay();
  const lastText = c.lastDay > 0
    ? new Date(c.lastDay * 86400000).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }) + " (UTC)"
    : "never";
  checkinBody.innerHTML =
    '<p>Agent ID <strong>' + escapeHtml(state.handle ? state.handle + ".ai" : "(no handle)") + "</strong></p>" +
    '<p><span class="streak-big">' + c.streak + "</span> day streak</p>" +
    "<p class=\"note\">Last check-in: " + escapeHtml(lastText) + " · " +
    (checkedToday ? "You have already checked in today." : "You have not checked in yet today (UTC).") + "</p>" +
    '<button type="button" class="primary" id="btnCheckIn"' + (checkedToday ? " disabled" : "") + ">" +
    (checkedToday ? "Checked in today" : "Check in for today") + "</button>" +
    '<p class="note">Check-in is a transaction you confirm in your wallet; it moves no assets and costs only network gas.</p>';
  const btn = $("btnCheckIn");
  if (btn) btn.addEventListener("click", doCheckIn);
}

/* ---------------------------- actions ------------------------------ */

async function claimDrop(dropId) {
  if (!state.signer) return;
  setMsg(boardMsg, "Preparing your claim — confirm it in your wallet…", "info");
  try {
    const tx = await agentFairWithSigner().claim(dropId);
    setMsg(boardMsg, "Claim sent. Waiting for confirmation…", "info");
    await tx.wait();
    setMsg(boardMsg, "Claim confirmed: your Agent ID received its share of drop #" + dropId + ".", "ok");
    await loadBoard();
  } catch (e) {
    setMsg(boardMsg, "Claim failed: " + friendlyError(e), "err");
  }
}

async function withdrawDrop(dropId) {
  if (!state.signer) return;
  setMsg(myDropsMsg, "Preparing the withdrawal — confirm it in your wallet…", "info");
  try {
    const tx = await agentFairWithSigner().withdrawUnclaimed(dropId);
    setMsg(myDropsMsg, "Withdrawal sent. Waiting for confirmation…", "info");
    await tx.wait();
    setMsg(myDropsMsg, "Withdrawal confirmed for drop #" + dropId + ".", "ok");
    await loadBoard();
  } catch (e) {
    setMsg(myDropsMsg, "Withdrawal failed: " + friendlyError(e), "err");
  }
}

async function doCheckIn() {
  if (!state.signer) return;
  setMsg(checkinMsg, "Preparing your check-in — confirm it in your wallet…", "info");
  try {
    const tx = await agentFairWithSigner().checkIn();
    setMsg(checkinMsg, "Check-in sent. Waiting for confirmation…", "info");
    await tx.wait();
    await refreshCheckin();
    const streak = state.checkin ? state.checkin.streak : "?";
    setMsg(checkinMsg, "Checked in. Current streak: " + streak + " day(s).", "ok");
  } catch (e) {
    setMsg(checkinMsg, "Check-in failed: " + friendlyError(e), "err");
  }
}

/* --------------------------- create drop --------------------------- */

function parseCreateForm() {
  // Returns { token, perClaim, maxClaims, durationSeconds, total } or null.
  const tokenAddr = $("fToken").value.trim();
  const amountStr = $("fAmount").value.trim();
  const maxClaimsStr = $("fMaxClaims").value.trim();
  const daysStr = $("fDays").value.trim();
  if (!state.formToken || !ethers.isAddress(tokenAddr)) return null;
  if (tokenAddr.toLowerCase() !== state.formToken.address.toLowerCase()) return null;
  if (!state.formToken.decimalsOk) return null;
  let perClaim;
  try { perClaim = ethers.parseUnits(amountStr, state.formToken.decimals); }
  catch (_) { return null; }
  if (perClaim <= 0n) return null;
  const maxClaims = BigInt(Math.trunc(Number(maxClaimsStr) || 0));
  if (maxClaims <= 0n) return null;
  const days = Number(daysStr);
  if (!Number.isFinite(days) || days < 1) return null;
  const durationSeconds = BigInt(Math.trunc(days) * 86400);
  return {
    token: tokenAddr,
    perClaim,
    maxClaims,
    durationSeconds,
    total: perClaim * maxClaims,
  };
}

async function onTokenAddressChanged() {
  const addr = $("fToken").value.trim();
  const metaEl = $("tokenMeta");
  state.formToken = null;
  if (!addr) {
    metaEl.textContent = "Paste a token address to load its symbol and decimals.";
    renderCreateState();
    return;
  }
  if (!ethers.isAddress(addr)) {
    metaEl.textContent = "That is not a valid address.";
    renderCreateState();
    return;
  }
  metaEl.textContent = "Loading token metadata…";
  const meta = await getTokenMeta(addr);
  state.formToken = { address: addr, symbol: meta.symbol, decimals: meta.decimals, decimalsOk: meta.decimalsOk };
  if (!meta.ok) {
    metaEl.textContent = "Could not read this contract's ERC-20 metadata. Check the address is an ERC-20 token on BNB Chain.";
  } else if (!meta.decimalsOk) {
    metaEl.textContent = "Loaded " + meta.symbol + ", but its decimals() could not be read, so amounts cannot be computed safely. Creation is disabled for this token.";
  } else {
    let text = "Token: " + meta.symbol + (meta.name ? " (" + meta.name + ")" : "") + " · decimals: " + meta.decimals;
    if (state.account) {
      try {
        const bal = await erc20Read(addr).balanceOf(state.account);
        text += " · your balance: " + fmtAmount(bal, meta) + " " + meta.symbol;
      } catch (_) { /* balance is a convenience only */ }
    }
    metaEl.textContent = text;
  }
  await refreshAllowanceAndRender();
}

async function currentAllowance() {
  const parsed = parseCreateForm();
  if (!parsed || !state.account || !DEPLOYED) return null;
  try {
    return await erc20Read(parsed.token).allowance(state.account, CONFIG.AGENTFAIR_CONTRACT_ADDRESS);
  } catch (_) { return null; }
}

async function refreshAllowanceAndRender() {
  renderCreateState(await currentAllowance());
}

function renderCreateState(allowance) {
  const btnApprove = $("btnApprove");
  const btnCreate = $("btnCreate");
  const approveText = $("approveText");
  const createText = $("createText");
  const parsed = parseCreateForm();
  const meta = state.formToken;

  if (!DEPLOYED) {
    btnApprove.disabled = true;
    btnCreate.disabled = true;
    approveText.textContent = "Available once the AgentFair contract is deployed.";
    createText.textContent = "Available once the AgentFair contract is deployed.";
    return;
  }
  if (!state.account) {
    btnApprove.disabled = true;
    btnCreate.disabled = true;
    approveText.textContent = "Connect your wallet first. Step 1 will then ask your wallet to approve the exact deposit total for your token — no more.";
    createText.textContent = "After the approval is confirmed, this step creates the drop and the contract pulls exactly the approved total.";
    return;
  }
  if (!parsed) {
    btnApprove.disabled = true;
    btnCreate.disabled = true;
    approveText.textContent = "Fill in a valid token, amount per claim, max claims and duration. This step will ask your wallet to approve the AgentFair contract to pull the exact total (amount per claim × max claims) of your token — no more.";
    createText.textContent = "After the approval is confirmed, this step calls createDrop and the contract pulls exactly the approved total. The drop is fully funded from that moment.";
    return;
  }
  const totalText = fmtAmount(parsed.total, meta) + " " + (meta ? meta.symbol : "");
  const enough = allowance !== null && allowance !== undefined && allowance >= parsed.total;
  approveText.innerHTML =
    "Your wallet will be asked to approve the AgentFair contract (" +
    escapeHtml(shortenAddress(CONFIG.AGENTFAIR_CONTRACT_ADDRESS)) +
    ") to pull exactly <strong>" + escapeHtml(totalText) + "</strong> — the full deposit for this drop, and nothing beyond it." +
    (enough ? "<br>Your current approval already covers this total, so you can go straight to step 2." : "");
  createText.innerHTML =
    "This calls <span class=\"mono\">createDrop</span>: the contract pulls exactly <strong>" + escapeHtml(totalText) +
    "</strong> from your wallet and opens the drop for " + parsed.maxClaims.toString() + " claims of " +
    escapeHtml(fmtAmount(parsed.perClaim, meta)) + " " + escapeHtml(meta ? meta.symbol : "") + " each.";
  btnApprove.disabled = false;
  btnCreate.disabled = !enough;
  btnCreate.textContent = enough ? "Create drop" : "Create drop (approve first)";
}

async function doApprove() {
  const parsed = parseCreateForm();
  if (!parsed || !state.signer) return;
  setMsg(createMsg, "Step 1: approve the exact total in your wallet…", "info");
  try {
    const tx = await erc20WithSigner(parsed.token).approve(CONFIG.AGENTFAIR_CONTRACT_ADDRESS, parsed.total);
    setMsg(createMsg, "Approval sent. Waiting for confirmation…", "info");
    await tx.wait();
    setMsg(createMsg, "Approval confirmed. You can now create the drop in step 2.", "ok");
    await refreshAllowanceAndRender();
  } catch (e) {
    setMsg(createMsg, "Approval failed: " + friendlyError(e), "err");
  }
}

async function doCreateDrop() {
  const parsed = parseCreateForm();
  if (!parsed || !state.signer) return;
  setMsg(createMsg, "Step 2: confirm createDrop in your wallet…", "info");
  try {
    const tx = await agentFairWithSigner().createDrop(
      parsed.token, parsed.perClaim, parsed.maxClaims, parsed.durationSeconds
    );
    setMsg(createMsg, "createDrop sent. Waiting for confirmation…", "info");
    const receipt = await tx.wait();
    let newId = null;
    for (const log of receipt.logs) {
      try {
        const parsedLog = agentFairIface.parseLog(log);
        if (parsedLog && parsedLog.name === "DropCreated") { newId = Number(parsedLog.args.dropId); break; }
      } catch (_) { /* not an AgentFair log */ }
    }
    setMsg(createMsg, "Drop created" + (newId !== null ? " as drop #" + newId : "") + ". It is fully funded and open for claims.", "ok");
    await loadBoard();
    await refreshAllowanceAndRender();
  } catch (e) {
    setMsg(createMsg, "Creating the drop failed: " + friendlyError(e), "err");
  }
}

/* ------------------------------ init ------------------------------- */

function init() {
  if (typeof ethers === "undefined") {
    showGlobal("The ethers.js library failed to load from its CDN. Check your connection and reload the page.");
    return;
  }
  initReadLayer();

  if (!DEPLOYED) {
    $("deployBanner").hidden = false;
  } else {
    const ref = $("contractRef");
    ref.innerHTML = '<a href="https://bscscan.com/address/' + CONFIG.AGENTFAIR_CONTRACT_ADDRESS +
      '" target="_blank" rel="noopener">' + CONFIG.AGENTFAIR_CONTRACT_ADDRESS + "</a> (verified source)";
  }

  $("btnConnect").addEventListener("click", connectWallet);
  $("btnRefresh").addEventListener("click", async () => { await loadBoard(); await refreshCheckin(); });
  $("btnApprove").addEventListener("click", doApprove);
  $("btnCreate").addEventListener("click", doCreateDrop);

  let tokenTimer = null;
  $("fToken").addEventListener("input", () => {
    window.clearTimeout(tokenTimer);
    tokenTimer = window.setTimeout(onTokenAddressChanged, 500);
  });
  ["fAmount", "fMaxClaims", "fDays"].forEach((id) => {
    $(id).addEventListener("input", () => { refreshAllowanceAndRender(); });
  });

  renderWallet();
  renderCheckin();
  renderCreateState();
  renderMyDrops();
  loadBoard();
  trySilentReconnect();
}

document.addEventListener("DOMContentLoaded", init);
