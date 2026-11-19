# AgentFair — static frontend

A build-free static page for the AgentFair contract (`../src/AgentFair.sol`):
a read-only drop board, a daily check-in panel, one-share claim buttons, a
two-step create-drop flow, and a "my drops" view with post-deadline
withdrawal. Plain HTML/CSS/JS; the only external asset is the ethers.js v6
UMD build loaded from the jsDelivr CDN. There is **no backend, no build
step, and no server-side state of any kind**.

## Run it locally

Any static file server works. From this directory:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(or `npx serve .`, or any static host — GitHub Pages, IPFS, etc.)

- **Browsing the drop board needs no wallet**: reads go to a public BNB
  Chain RPC (`https://bsc-dataseed.binance.org`, chain 56).
- **Claiming, checking in, creating and withdrawing need a wallet** in the
  same browser: the page uses only the standard injected provider
  (`window.ethereum`) — e.g. the Binance app's Web3 browser or a desktop
  wallet extension. Every transaction is proposed to that wallet and signed
  only after the user confirms it there.

## Deployment status

**Deployed on BSC mainnet on 2026-11-19.** The `CONFIG` block at the top of
`app.js` already carries the live address:

```js
AGENTFAIR_CONTRACT_ADDRESS: "0xB4e3ac1647f17D3676B98a61159EeA71749B8E37"
```

(See `../DEPLOY-RESULT.md` for the deployment record. BscScan source
verification is a separate step.) Before deployment this was the zero
placeholder (`0x0000000000000000000000000000000000000000`), which the page
detects and answers with a friendly "not yet deployed" state instead of
making contract calls.
The Agent ID registry (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`) and the
read RPC are already set in the same block.

## Safety properties (hackathon red lines)

- **No QR-code / pairing-code login, ever.** Connection is exclusively via
  the browser's injected wallet provider. (The words "QR" and "pairing"
  appear in the page copy only to state that they are *not* used.)
- **No sessions, no backend, nothing stored server-side.** The page stores
  nothing at all; wallet state lives in the user's own wallet.
- **No confirmation bypass.** Claims, check-ins, approvals, drop creation
  and withdrawals are ordinary transactions the user confirms in their own
  wallet. Rejections and contract reverts are shown in plain language.
- **Exact-amount approvals only.** The create-drop flow asks for an ERC-20
  `approve` of exactly `amountPerClaim × maxClaims` — never an unlimited
  approval — and labels it as step 1 of 2 before `createDrop` as step 2.
  Claimers are never asked to approve anything.
- **Honest copy.** No returns are promised anywhere; the page states that
  claims are free apart from network gas and that a dropped token may have
  no market or value.

## Contract function mapping

Every contract call the JavaScript makes, verified against
`src/AgentFair.sol` and the Foundry artifact ABI
(`out/AgentFair.sol/AgentFair.json`, embedded verbatim in `app.js` —
byte-for-byte the artifact ABI minus the constructor entry):

| JS call site | Contract function | Argument order used | Purpose |
|---|---|---|---|
| `loadBoard()` | `dropCount()` → `uint256` | — | Number of drops; sizes the board. |
| `loadBoard()` | `drops(uint256)` → `(address creator, address token, uint256 amountPerClaim, uint256 maxClaims, uint256 claimed, uint256 deadline, bool withdrawn)` | drop index | Full drop struct per index (public array getter). |
| `refreshClaimedFlags()` | `hasClaimed(uint256, bytes32)` → `bool` | `(dropId, identityKey)` | Whether the connected identity already claimed a drop. |
| `loadIdentity()` | `identityKeyOf(address)` → `bytes32` | `(wallet)` | The connected holder's identity key (reverts for non-holders; called only after the registry check). |
| `refreshCheckin()` | `streakOf(bytes32)` → `uint256` | `(identityKey)` | Current check-in streak. |
| `refreshCheckin()` | `lastCheckInDay(bytes32)` → `uint256` | `(identityKey)` | Last check-in UTC day number; compared with today's. |
| `claimDrop()` | `claim(uint256)` | `(dropId)` | Claim the caller's one share. |
| `doCheckIn()` | `checkIn()` | — | Daily check-in. |
| `doCreateDrop()` | `createDrop(address, uint256, uint256, uint256)` → `uint256` | `(token, amountPerClaim, maxClaims, durationSeconds)` | Create a drop; the returned id is read from the `DropCreated` event in the receipt. |
| `withdrawDrop()` | `withdrawUnclaimed(uint256)` | `(dropId)` | Creator withdraws the unclaimed remainder after the deadline. |

Registry calls (SPACE ID Agent ID registry, interface as declared in
`src/AgentFair.sol`'s `IAgentIDRegistry` and verified in `../DESIGN.md`):

| JS call site | Registry function | Purpose |
|---|---|---|
| `loadIdentity()` | `balanceOf(address)` → `uint256` | Eligibility: wallet holds an Agent ID iff > 0. |
| `loadIdentity()` | `handleOf(address)` → `string` | Display the holder's Agent ID handle. |

ERC-20 calls (against each drop's token contract, **not** AgentFair —
AgentFair's own source deliberately declares only
`transfer`/`transferFrom`/`balanceOf`; metadata and approval are standard
ERC-20 surface on the tokens themselves):

| JS call site | ERC-20 function | Purpose |
|---|---|---|
| `getTokenMeta()` | `symbol()`, `name()`, `decimals()` | Board display and amount formatting; each read is individually fault-tolerant. |
| `onTokenAddressChanged()` | `balanceOf(address)` | Show the creator's balance of the chosen token. |
| `currentAllowance()` | `allowance(address, address)` | `(creator, AgentFair)` — enables step 2 only when the exact total is covered. |
| `doApprove()` | `approve(address, uint256)` | `(AgentFair, exactTotal)` — step 1 of the create-drop flow. |

## Interface notes (Phase 1 contract vs. frontend needs)

- **No getter is missing for the board.** Phase 1 already provides
  `dropCount()` plus the public `drops` array getter returning the full
  struct, which is everything the board renders (token, amount per claim,
  claimed/maxClaims, deadline, status). Nothing was worked around.
- **One efficiency note, not a gap:** there is no batch getter (e.g.
  `getDrops(from, to)`) or multicall helper, so the board issues one
  `drops(i)` call per drop, batched client-side with `Promise.all` in
  chunks of 20. Fine for expected drop counts; a v2 contract could add a
  range getter if the board ever needs to list thousands of drops.
- **`registry()`** is exposed by the contract and present in the embedded
  ABI but intentionally unused by the page: the registry address is a
  config constant, and the page reads the registry directly.
- **Check-in "today"** is computed client-side as the UTC day number
  (`floor(unixTime / 86400)`), matching the contract's
  `block.timestamp / 1 days`. The contract remains authoritative — if the
  client's clock disagrees, `checkIn()` reverts with
  `AlreadyCheckedInToday`, which the page translates into plain language
  (all contract custom errors have friendly text in `app.js`).
- **Token symbols/names are untrusted display strings** read from arbitrary
  ERC-20 contracts; everything rendered from chain data is HTML-escaped.

## Files

| File | Contents |
|---|---|
| `index.html` | The single page: markup + inline CSS. |
| `app.js` | All logic: config block, embedded artifact ABI, read layer, wallet layer, rendering, actions. |
| `README.md` | This file. |

License: MIT (same as the project).
