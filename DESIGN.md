# AgentFair — Design Document (Phase 1)

**Project:** AgentFair — fair drops and daily check-ins gated by Agent ID
**Event:** Binance Agent ID Hackathon (submission deadline 2026-12-09 08:00 UTC)
**Phase 1 scope:** design + contracts + tests. No deployment, no mainnet transactions.

---

## 1. Product summary

In the Agent ID ecosystem, dozens of projects hand-roll the same pattern:
"Agent ID holders get exactly one free share." Every project re-implements
the gating, the one-per-person accounting, and the claim flow from scratch —
each with its own bugs and trust assumptions.

**AgentFair turns that pattern into a reusable public primitive.** It is a
single, simple, non-upgradeable contract on BNB Chain with two functions:

1. **Fair drops** — any project (or individual) can deposit ERC-20 tokens and
   open a drop: a fixed amount per claim, a fixed number of claims, a
   deadline. Every Agent ID holder can claim exactly **one** share per drop,
   for free (gas only — claimers never approve anything). After the deadline
   the creator withdraws whatever was not claimed.
2. **Daily check-in** — Agent ID holders check in once per UTC day and build
   a streak. This moves no assets at all; it gives the product a living,
   zero-risk interaction surface from day one, before any drop is funded,
   and it demonstrates Agent ID as a recurring identity, not a one-off gate.

AgentFair charges no fees, takes no cut, and makes no promises about the
value of any dropped token. A drop is worth whatever the deposited token is
worth; AgentFair is plumbing, not an investment product.

## 2. Agent ID integration — verified against the live registry

Registry (BNB Chain mainnet): **SPACE ID Agent ID**, `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`,
ERC-721, symbol `AI`.

The interface below was verified on 2026-11-19 by read-only `cast call`s
against two independent BSC RPCs (bsc-dataseed.binance.org and
bsc-dataseed1.defibit.io), with identical results on both, using the ABI
published on Sourcify for the deployed contract:

| Function | Exists? | Result for a known holder |
|---|---|---|
| `balanceOf(address) → uint256` | ✅ | `balanceOf(0xd370…3f06)` = **1** |
| `handleOf(address) → string` | ✅ | `handleOf(0xd370…3f06)` = **"asepaa"** |
| `ownerOfHandle(string) → address` | ✅ | `ownerOfHandle("asepaa")` = `0xd370…3f06` |
| `ownerOf(uint256) → address` | ✅ | standard ERC-721 |
| `tokenIdOf(address)` / `idOf(address)` | ❌ | calls revert (unknown selector) — **no address→tokenId resolver exists** |
| non-holder behaviour | — | `balanceOf` = 0, `handleOf` = `""` |
| transferability | — | simulated `approve(...)` reverts with **`"Soulbound"`** — the token cannot be transferred or approved |

### Identity keying decision

There is no `tokenIdOf`, so claims cannot be keyed by tokenId. Instead:

- **Eligibility:** `balanceOf(user) > 0` — the address holds an Agent ID.
- **Identity key:** `keccak256(bytes(handleOf(user)))` — the keccak hash of
  the holder's handle (e.g. `asepaa`). Claims and check-ins are accounted
  against this key, not against the raw wallet address.

Why the handle is the right key, and why it is at least as strong as
address-keying:

- The handle **is** the Agent ID identity — unique per person, one per user.
- The token is provably soulbound (transfers/approvals revert on-chain), and
  the registry enforces one handle per address (`AddressHasHandle` error in
  the ABI). An identity therefore cannot be duplicated across wallets to
  claim twice, and cannot be sold or lent.
- Keying by identity rather than wallet means the "exactly one share per
  Agent ID" promise is enforced at the identity layer — the layer the rule
  is actually about — even if wallet tooling around an identity changes.

## 3. Contract architecture

One contract, `AgentFair` (`src/AgentFair.sol`), Solidity ^0.8.24, no
upgradeability, no proxy, no admin keys. The Agent ID registry address is an
immutable constructor parameter (the mainnet registry above is the default
for deployment; tests inject a mock).

### State

- `drops[]` — array of `Drop { creator, token, amountPerClaim, maxClaims,
  claimed, deadline, withdrawn }`.
- `hasClaimed[dropId][identityKey] → bool` — one-claim-per-identity ledger.
- `lastCheckInDay[identityKey]`, `streakOf[identityKey]` — check-in state.

### Functions

| Function | Who | What it does |
|---|---|---|
| `createDrop(token, amountPerClaim, maxClaims, durationSeconds)` | anyone | Pulls exactly `amountPerClaim × maxClaims` from the creator via `transferFrom` (creator approves the exact total first — their own wallet, their own confirmation). Verifies the received amount by balance delta, so fee-on-transfer tokens revert instead of silently underfunding a drop. Emits `DropCreated`. |
| `claim(dropId)` | Agent ID holders | Requires: drop exists, now < deadline, claims remaining, caller holds an Agent ID, identity has not claimed this drop. Marks the claim, then transfers `amountPerClaim`. Emits `Claimed` including the identity key. **Claimers never approve anything** — tokens only ever flow out to them. |
| `withdrawUnclaimed(dropId)` | the drop's creator only | Requires: now ≥ deadline, not already withdrawn. Returns `(maxClaims − claimed) × amountPerClaim` to the creator. Emits `Withdrawn`. |
| `checkIn()` | Agent ID holders | Once per UTC day per identity. Streak +1 if yesterday was the last check-in day, otherwise resets to 1. Emits `CheckedIn`. Moves no assets. |
| `identityKeyOf(address)` | anyone (view) | Returns the identity key for a holder; reverts for non-holders. |

### Safety engineering

- **Checks-effects-interactions** everywhere; a hand-written reentrancy
  guard additionally wraps every function that moves tokens
  (`createDrop`, `claim`, `withdrawUnclaimed`).
- **Safe ERC-20 helpers** (hand-written, OpenZeppelin-style): low-level
  calls that require success and accept empty return data (for non-standard
  tokens that return nothing) or a `true` boolean.
- **Balance-delta verification** on deposit: the contract credits a drop
  only with what actually arrived.
- Solidity ^0.8.x checked arithmetic throughout.
- No external dependencies in the contract itself; the only imports in the
  repo are forge-std for tests.

## 4. Fund-safety model

- **Who can move what, when:**
  - A creator's tokens move **only** when the creator calls `createDrop`
    (pulling a total the creator approved in their own wallet beforehand)
    and when the same creator calls `withdrawUnclaimed` after the deadline
    (receiving only that drop's unclaimed remainder).
  - A claimer's tokens move **only toward the claimer**, exactly
    `amountPerClaim`, exactly once per identity per drop, and only while
    the drop is open.
  - Check-ins move nothing.
- **Solvency by construction:** every drop is fully collateralised at
  creation (`maxClaims × amountPerClaim` deposited up front). Claims plus
  the creator's remainder can never exceed the deposit; drops are accounted
  independently, so one drop can never pay out of another drop's funds.
- **No admin powers over funds:** the contract has no owner, no pause, no
  sweep, no upgrade path, and no function that can move tokens out of a
  drop except `claim` (to an eligible identity) and `withdrawUnclaimed`
  (to the drop's own creator, after the deadline). Nobody — including the
  deployer — can touch a live drop's balance.
- **Known assumption:** dropped tokens are expected to be ordinary ERC-20s.
  Fee-on-transfer tokens are rejected at creation by the balance-delta
  check. Rebasing tokens are out of scope for v1 (bookkeeping is in nominal
  units).

**Every permission in the system, in one paragraph:** The only privileged
actor is a drop's own creator, and only over their own drop: they choose
the token, amounts, and duration at creation, and they alone can reclaim
their own unclaimed remainder after the deadline. AgentFair itself has no
owner or admin; the deployer retains no powers after deployment. Agent ID
holders gain no privileges beyond claiming and checking in as themselves.

## 5. Hackathon safety-red-line compliance

| Red line | How AgentFair complies |
|---|---|
| No web QR-code / pairing-code login for Agentic Wallet | The product has no login system at all. Users interact by sending ordinary transactions from their own wallet; nothing scans, pairs, or stores sessions. |
| No bypassing user transaction confirmation | Every state-changing action is a transaction the user signs in their own wallet. `createDrop`'s token pull requires the creator's own prior `approve` in their own wallet. |
| No unauthorized asset transfers | Tokens move only via `createDrop` (creator-approved pull), `claim` (out to an eligible claimer), `withdrawUnclaimed` (back to the drop's creator). No scheduled collection, no bundled extra transfers, no approval requests to claimers — claimers are never asked to approve anything. |
| Contracts open-source, owner permissions disclosed | MIT-licensed source, to be verified on BscScan at deployment. There is no contract owner; the full permission model is §4 above and will be restated in the submission materials. |
| No Binance/BNB brand impersonation | The project is named **AgentFair**. No project or token name contains "Binance" or "BNB". |
| No promises of returns | No text anywhere in the product, docs, or submission materials promises returns, income, or token value. Drops distribute whatever token a creator deposited; that is stated plainly. |
| No collection of sensitive credentials | The product collects nothing: no seed phrases, private keys, API secrets, or pairing codes are ever requested or stored — interaction is purely on-chain. |
| Risk warnings for trading products | AgentFair is not a trading product (no swaps, no prices, no orders). Docs state that dropped tokens may have no market or value. |

## 6. What remains for later phases

- **Phase 2 — testnet rehearsal:** deploy to BSC testnet, end-to-end run
  with real Agent ID test wallets, gas measurement.
- **Phase 3 — mainnet deployment:** deploy with the mainnet registry
  address, verify source on BscScan, publish the repo.
- **Phase 4 — frontend:** a minimal static page (drop list, claim button,
  check-in button, streak display) that talks directly to the contract
  from the user's own wallet — no backend, no sessions.
- **Phase 5 — submission + interactions:** submit project name, website,
  contract address, and Agent ID usage description before
  2026-12-09 08:00 UTC; then drive the **≥30 distinct Agent ID holders**
  interaction requirement (Innovation Award eligibility) through the Agent
  ID community — the daily check-in is designed to make a first interaction
  free, instant, and asset-risk-free for every holder who tries it.
- **Possible v2 (post-hackathon):** drop discovery index, per-drop claim
  pages, streak leaderboards — all read-only conveniences on top of the
  same contract guarantees.

## 7. Phase 1 test evidence

Foundry suite in `test/AgentFair.t.sol` (mock registry + mock ERC-20):
non-holders cannot claim or check in; one claim per identity; two holders
can each claim; claims stop at `maxClaims`; claims after the deadline
revert; creator withdrawal is blocked before the deadline and pays the
exact remainder after it; double check-in in one day reverts; streaks
increment on consecutive days and reset after a gap; drop creation pulls
the exact total. Full run output is recorded in the Phase 1 report.
