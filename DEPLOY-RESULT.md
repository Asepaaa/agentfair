# AgentFair — Mainnet Deployment Result

Executed 2026-11-19 (~12:32–12:40 WIB) after the user's explicit go
("Gas deploy sekarang") and his unblocking of the funding step
("Sudah, lanjutkan deploy"). Route followed: DEPLOY-PLAN.md §6
(forge script + one-purpose deployer EOA funded from the Agentic Wallet).

## Contract

| Item | Value |
|---|---|
| Contract | AgentFair (`src/AgentFair.sol`) |
| **Address** | **`0xB4e3ac1647f17D3676B98a61159EeA71749B8E37`** |
| Chain | BNB Smart Chain (chain id 56) |
| BscScan | https://bscscan.com/address/0xB4e3ac1647f17D3676B98a61159EeA71749B8E37 |
| Constructor arg (registry) | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` (BSC mainnet Agent ID registry) |
| Deployer (creator) | `0xC57BD1682663F19B946Ee8702d07c2e42060f223` (one-purpose EOA; key in `keys/deployer.txt`, 700/600) |
| Funded by | Agentic Wallet `0xd3704492cf574feD1df0ECD8E68480c660873f06` |

The contract has no owner, no admin, no pause, and no upgrade path; the
deployer key retains no power over it.

## Transactions

| Step | Tx hash | Result |
|---|---|---|
| Funding (Agentic Wallet → deployer, 0.001 BNB) | [`0xf2f842aec09aee3563e373c55757b1cf803c95af9ae6e1ff91ee9027f8b33d08`](https://bscscan.com/tx/0xf2f842aec09aee3563e373c55757b1cf803c95af9ae6e1ff91ee9027f8b33d08) | status success, block 134447902, 21,000 gas |
| **Deployment (CREATE)** | [`0x37de7bce99a4f8fd1d34a1f3c636b4338dba9e116bbf8f00181a9aeda4188d7f`](https://bscscan.com/tx/0x37de7bce99a4f8fd1d34a1f3c636b4338dba9e116bbf8f00181a9aeda4188d7f) | status `0x1` |
| Sweep (deployer → Agentic Wallet, 0.00092273685 BNB) | [`0x659840ef767c5a76a950b8ea95ad7616c7bbbffbb451c1f1670c5067d5116370`](https://bscscan.com/tx/0x659840ef767c5a76a950b8ea95ad7616c7bbbffbb451c1f1670c5067d5116370) | status success, block 134448020, 21,000 gas |

Funding note: the first funding attempt (earlier on 2026-11-19) was
rejected pre-broadcast by baw with error 351703 (recipient not in the
address book). After the user added the deployer address to his Binance
Wallet address book, the identical `baw wallet send` succeeded. No funds
moved in the rejected attempt.

## Actual costs

| Item | Amount |
|---|---|
| Deployment gas used | 1,524,263 gas at 0.05 gwei |
| **Deployment cost** | **0.00007621315 BNB** |
| Funding-send gas (baw, MEDIUM level) | ≈ 0.00000171 BNB |
| Sweep gas (paid from deployer funds) | 0.00000105 BNB |
| **Net total cost to the user** | **0.000078971062129 BNB** (≈ $0.05) |

Net cost cross-check: Agentic Wallet balance went from
0.002137285264082586 BNB (pre-funding) to 0.002058314201953586 BNB
(post-sweep); the difference equals the net total above. Total spend
stayed inside the authorized 0.001 BNB envelope; the unused remainder
was swept back in full.

## On-chain verification (2 independent BSC RPCs, identical results)

RPCs: `https://bsc-dataseed.binance.org`, `https://bsc-dataseed1.defibit.io`

| Check | RPC 1 | RPC 2 |
|---|---|---|
| `eth_getCode` size at the contract address | 6,819 bytes | 6,819 bytes |
| `registry()` | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` |
| `dropCount()` | 0 | 0 |
| Deployer balance after deployment | 0.00092378685 BNB | 0.00092378685 BNB |
| Deployer balance after sweep | 0 wei | 0 wei |
| Agentic Wallet balance after sweep | 0.002058314201953586 BNB | 0.002058314201953586 BNB |

Pre-broadcast gates re-run on deployment day: live gas price 0.05 gwei
(2 RPCs), `forge test` 14/14 PASS, `forge build` OK, deployer
key↔address correspondence re-derived from the key file before signing.

## Wiring done

- `web/app.js` — `CONFIG.AGENTFAIR_CONTRACT_ADDRESS` set to the deployed
  address.
- `README.md` — Contracts table now lists the deployed address with its
  BscScan link.
- `web/README.md` — deployment-status section updated.

## Not done (by design — separate steps)

- **BscScan source verification** — pending; needs the user's Etherscan
  API key (secure flow) or ~2 minutes in his own browser
  (DEPLOY-PLAN.md §5). The prepared input is
  `verification/standard-json-input.json`.
- No drops created, no check-ins made.
- `keys/deployer.txt` retained for now (balance 0; the plan leaves the
  keep-or-delete decision to the user).
