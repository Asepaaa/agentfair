# AgentFair

**Fair drops and daily check-ins, gated by Agent ID.**

## Live

- App: https://asepaaa.github.io/agentfair/
- Contract (BNB Chain mainnet): [`0xB4e3ac1647f17D3676B98a61159EeA71749B8E37`](https://bscscan.com/address/0xB4e3ac1647f17D3676B98a61159EeA71749B8E37) — verified on BscScan and on Sourcify (exact match)
- Built for the Binance Wallet Agent ID Hackathon

In the Agent ID ecosystem, every project hand-rolls the same pattern —
"Agent ID holders get exactly one free share" — with its own gating, its
own one-per-person accounting, and its own claim flow. AgentFair turns that
pattern into a single reusable public primitive: one simple,
non-upgradeable contract that any project can use, and that any Agent ID
holder can use without trusting anyone.

## What it does

### Fair drops

Anyone can create a drop by depositing ERC-20 tokens into the contract:

- A drop is defined by a **token**, an **amount per claim**, a **maximum
  number of claims**, and a **deadline**.
- Creating a drop deposits the full amount up front
  (`amount per claim × max claims`), so every drop is fully funded before
  the first claim.
- Every Agent ID holder can claim **exactly one share per drop** — free,
  gas only. Claimers are never asked to approve anything; tokens only ever
  flow *out* to them.
- After the deadline, the drop's creator — and only the creator — can
  withdraw whatever was not claimed. Nobody else can touch a drop's funds,
  ever. The contract has no owner, no admin, no pause, and no upgrade path.

### Daily check-in

Agent ID holders can check in **once per UTC day** and build a streak:
consecutive days grow the streak, a missed day resets it to 1. Check-ins
move no assets at all — they are a zero-risk way for holders to interact
with Agent ID as a living identity, and they give every drop a community
that is already showing up daily.

## How Agent ID is used

Agent ID is the eligibility and identity layer at the core of both
features — not a cosmetic gate:

- **Eligibility:** an address must hold an Agent ID in the SPACE ID Agent
  ID registry (`balanceOf > 0`) to claim or check in.
- **One-per-identity accounting:** claims and check-ins are keyed by the
  holder's **Agent ID identity** — the keccak256 hash of their handle
  (`handleOf`), e.g. the identity behind `asepaa` — not merely by wallet
  address. Agent ID is soulbound (transfers revert on-chain) and each
  person has exactly one, so one identity can never claim twice, and an
  identity cannot be sold or lent to claim again.
- **Recurring identity:** the check-in streak is attached to the same
  identity key, so a holder's history belongs to their Agent ID, not to a
  disposable wallet.

Registry used on BNB Chain mainnet:
`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` (SPACE ID Agent ID).
The registry address is an immutable constructor parameter of AgentFair.

## Contracts

| Contract | Address |
|---|---|
| AgentFair | [`0xB4e3ac1647f17D3676B98a61159EeA71749B8E37`](https://bscscan.com/address/0xB4e3ac1647f17D3676B98a61159EeA71749B8E37) (BSC mainnet, deployed 2026-11-19) |
| Agent ID registry (external) | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` |

Source: [`src/AgentFair.sol`](src/AgentFair.sol) — a single contract,
Solidity ^0.8.24, no external dependencies, no upgradeability.
Design and fund-safety model: [`DESIGN.md`](DESIGN.md).

## How to interact

**Create a drop** (any wallet):

1. `approve` the AgentFair contract for `amountPerClaim × maxClaims` of
   your token, in your own wallet.
2. Call `createDrop(token, amountPerClaim, maxClaims, durationSeconds)`.

**Claim** (Agent ID holders): call `claim(dropId)`. No approval needed.
One claim per Agent ID identity per drop, before the deadline, while
claims remain.

**Withdraw unclaimed** (drop creators): after the deadline, call
`withdrawUnclaimed(dropId)` to receive the unclaimed remainder of your own
drop.

**Check in** (Agent ID holders): call `checkIn()` once per UTC day.
Read your streak with `streakOf(identityKey)` and your identity key with
`identityKeyOf(yourAddress)`.

## A note on value

AgentFair is plumbing, not a promise. A drop distributes whatever token a
creator deposited; that token may have a market, or none, and AgentFair
makes no representation about its value. Nothing in this project promises
returns of any kind.

## Development

Foundry project (forge-std for tests only; the contract itself has no
dependencies).

```bash
forge test
```

The suite covers: non-holders cannot claim or check in; one claim per
identity; multiple holders claiming; the `maxClaims` cap; the deadline;
creator-only withdrawal of the exact remainder after the deadline;
check-in streak growth, daily limit, and reset after a gap; and exact
deposit accounting at drop creation.

## License

MIT
