# AgentFair — Mainnet Deployment Plan (PREPARED, NOT EXECUTED)

Prepared 2026-11-19. Status: **nothing has been deployed, no transaction has
been sent.** All figures below were measured read-only / locally on
2026-11-19 (~12:20 WIB). Deployment is a paid mainnet action and waits for
the user's explicit go.

- Contract: `src/AgentFair.sol`, constructor `constructor(address registry_)`
- Mainnet Agent ID registry: `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`
- Agentic Wallet (funder): `0xd3704492cf574feD1df0ECD8E68480c660873f06`
- Hackathon submission deadline: **2026-12-09 08:00 UTC (15:00 WIB)**

---

## 1. Deployment route

### Can the Binance Agentic Wallet (baw) deploy it? — NO

A contract deployment is a creation transaction: it has **no `to` address**
and its data is the init bytecode. `baw contract-call` cannot express that:

- `baw contract-call preview --help` documents `--to` as *"Contract address
  to interact with (EVM only, **required for EVM**)"*.
- Tested once, read-only (preview only, never executed): a creation-shaped
  preview — `--from <Agentic Wallet> --value 0 --inputData <full init code>`,
  `--to` omitted — was rejected by the backend:
  `SERVICE_ERROR (code 2): "to is required for EVM contract-call"`.
- Passing `--to 0x0000000000000000000000000000000000000000` would **not**
  deploy anything: that is an ordinary call to the zero address, the init
  code would be treated as calldata to a non-existent account.
- No other baw command creates contracts (`wallet send` is transfers only;
  swaps/orders/prediction/DeFi all target existing contracts).

So the Agentic Wallet **cannot be the contract's creator**. It can still
fund the deployment (a plain BNB transfer) and can interact with AgentFair
normally after deployment (claims, check-ins, drops all have a `to`).

### Recommended route (PRIMARY): forge script + fresh deployer EOA

A one-purpose deployer EOA is generated locally, funded with a small amount
of BNB from the Agentic Wallet, and deploys via the prepared Foundry script
`script/Deploy.s.sol` (already written; fork-simulated against live BSC
mainnet on 2026-11-19 — simulation completed successfully, forge estimated
0.00009907705 BNB required; nothing was broadcast).

Why this route:

- **Exact bytecode.** The script deploys the same Foundry build that passed
  the 14/14 test suite, so the prepared BscScan standard-JSON input matches
  the deployed bytecode byte-for-byte. No manual compiler-setting mistakes.
- **Rehearsed end to end.** Init code, constructor encoding, and gas were
  all validated locally (anvil deploy succeeded; `registry()` read back the
  correct mainnet registry address) and by a mainnet fork simulation.
- **Tiny blast radius.** AgentFair has **no owner, no admin, no pause, no
  upgrade path** (see the contract's own header). The deployer key gains
  zero power over the contract after deployment. If the key were ever
  compromised, the maximum loss is the deployer's leftover dust
  (< 0.001 BNB) — nothing else is reachable with it.
- **Provenance is preserved.** The funding transfer (Agentic Wallet →
  deployer) is on-chain, so the contract's creator address is publicly
  traceable to the user's Agent ID wallet.

Trust/security notes for the deployer key (stated honestly):

- The key is generated on this VM with `cast wallet new` and stored in
  `~/workspace/agentid-hackathon/keys/deployer.txt` (directory 700, file
  600). It is never printed in chat and never sent anywhere.
- A key stored on this VM is exactly as safe as this VM. That is acceptable
  here only because the key controls nothing but dust (see above).
- After deployment: sweep the leftover BNB back to the Agentic Wallet, then
  either delete the key file or keep it if the user wants to deploy future
  projects from the same creator address.

### Alternative (FALLBACK): user deploys himself via Remix

The user deploys from his own wallet (creator address = his own
long-standing wallet, e.g. the Binance Web3 Wallet
`0xc65c56dd359ab61796bcb3db873b73a2d5106589`). Guided steps:

1. Open https://remix.ethereum.org in a browser where his wallet is
   available (Binance app Web3 browser or a desktop extension wallet),
   switch the wallet to BNB Chain (56).
2. Create `AgentFair.sol` and paste the exact source of `src/AgentFair.sol`.
3. Compile with Solidity **0.8.35**, optimizer **disabled** (matching these
   settings matters — see the verification warning below).
4. In "Deploy & Run", select **Injected Provider**, enter the constructor
   argument `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, deploy, and confirm
   in his wallet. Cost: the same ~0.00008 BNB, from that wallet (its BNB
   balance is currently unverified; the Agentic Wallet can top it up with a
   normal `baw wallet send` transfer first).
5. Send the resulting contract address back for verification + frontend
   wiring.

Drawbacks vs. the primary route: fully manual, and if the Remix compiler
settings differ from the Foundry build (solc 0.8.35 / optimizer off), the
prepared `verification/standard-json-input.json` will **not** match the
deployed bytecode — verification then needs a standard-input exported from
that Remix session instead. Workable, but easier to get wrong.

### Other routes considered

None. There is no contract-creation path anywhere else in the baw skill,
and third-party "deploy for you" services would still need a funded EOA
key — the forge route is that, without the third party.

---

## 2. Bytecode and constructor encoding (exact, from the tested build)

| Item | Value |
|---|---|
| Compiler | solc 0.8.35+commit.47b9dedd |
| Optimizer | disabled (runs 200, unused) |
| EVM version (build) | osaka — see note below |
| Creation bytecode | 7,202 bytes |
| Runtime bytecode | 6,819 bytes |
| **Init code (creation + constructor arg)** | **7,234 bytes** |
| Constructor argument (ABI-encoded) | `0x00000000000000000000000060b9262456de011f7d15a54cdd8c48baaa8b022f` |
| Constructor argument for BscScan form (no `0x`) | `00000000000000000000000060b9262456de011f7d15a54cdd8c48baaa8b022f` |

EVM-version note: the build targets `osaka`, but a controlled rebuild with
`evm_version = "cancun"` produced **byte-identical executable code** — the
only difference in the whole init code was 32 bytes inside the trailing
solc metadata hash (bytes 7159–7190). Solc emitted no Osaka-only opcodes
for this contract, and the cancun-target build also passes the test suite
14/14. The tested artifact can therefore be deployed to BSC as-is; no
rebuild is required. (If anyone rebuilds before deploying anyway, re-run
`forge test` and regenerate the verification input — §5.)

Local proof: the exact init code above was deployed to a local anvil on
2026-11-19 — deployment succeeded and `registry()` returned
`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`.

---

## 3. Gas estimate and cost

Measured 2026-11-19:

| Measurement | Gas |
|---|---|
| `eth_estimateGas`, BSC mainnet, from the Agentic Wallet (2 RPCs, identical) | **1,538,296** |
| `eth_estimateGas`, local anvil | 1,525,255 |
| Actual gas used, local anvil deployment | 1,524,263 |
| Foundry mainnet fork simulation of `script/Deploy.s.sol` | completed OK; 0.00009907705 BNB est. required |

- Planning figure: **1,538,296 gas** (the mainnet estimate; if a manual gas
  limit is ever set, use ~1,700,000).
- BSC gas price at measurement: **0.05 gwei** (50,000,000 wei — identical
  on 3 public RPCs; this is BSC's long-standing floor price).
- **Estimated deployment cost: 1,538,296 × 0.05 gwei = 0.0000769148 BNB
  ≈ 0.000077 BNB ≈ $0.05** (BNB $586.34, CoinGecko, 2026-11-19).
- Stress check: even at 1 gwei (20× the current price) the deployment
  costs 0.00154 BNB. The plan funds the deployer with 0.001 BNB, which
  covers any gas price up to ~0.65 gwei; the deployment-day checklist
  re-reads the live gas price before broadcasting.

---

## 4. Wallet state (read-only, 2026-11-19 ~12:20 WIB)

- `baw wallet status`: **CONNECTED**
- Agentic Wallet BNB balance (BSC): **0.002137285264082586 BNB** (~$1.25)
- Developer Mode: **enabled**, expires **2026-11-25T11:00:23Z**
  (18:00 WIB 25 Nov). Baw session expires 2026-11-21T05:19:54Z.
  (Developer Mode is not needed for the recommended route — the funding
  transfer is a plain `wallet send`; it only matters for later baw
  contract interactions.)
- **Sufficiency: YES.** The balance covers the estimated deployment cost
  (~0.000077 BNB) about 27 times over. Plan: send 0.001 BNB to the
  deployer, leaving ~0.00114 BNB in the Agentic Wallet.

---

## 5. BscScan verification plan

The hackathon requires contracts **verified and open-source on BscScan**.

Prepared artifact (already generated from the exact tested build):

- **`verification/standard-json-input.json`** — produced by
  `forge verify-contract --show-standard-json-input 0x5FbDB2315678afecb367f032d93F642f64180aa3 src/AgentFair.sol:AgentFair`
  (the address argument does not affect the input; regenerate after any
  rebuild with the same command and the real deployed address).
  Contents check: language Solidity, sources = `src/AgentFair.sol` only,
  optimizer disabled, evmVersion osaka.
- Compiler version to select: **v0.8.35+commit.47b9dedd**
- License: **MIT**
- Constructor argument (when the form asks): the no-`0x` encoding in §2.

Access reality from this VM: **bscscan.com is behind a Cloudflare bot wall**
(confirmed repeatedly), so verification from here must go through the API.
BscScan's API is now served via the Etherscan V2 endpoint
(`https://api.etherscan.io/v2/api?chainid=56`), which requires an
**Etherscan API key**. Two ways to complete verification:

- **Option A (agent submits):** the user provides an Etherscan API key
  (free etherscan.io account) through the secure credential flow — never
  in plain chat. Then, from this VM:
  `forge verify-contract <DEPLOYED_ADDRESS> src/AgentFair.sol:AgentFair --chain 56 --etherscan-api-key <KEY>`
  (Foundry submits the same standard-JSON input.)
- **Option B (user submits, ~2 minutes):** in his own browser, open the
  contract page on bscscan.com → "Verify & Publish" → Compiler Type
  "Solidity (Standard-Json-Input)" → upload
  `verification/standard-json-input.json`, compiler v0.8.35+commit.47b9dedd,
  license MIT, paste the constructor argument from §2, submit.

Additionally (optional, no key needed): verify on **Sourcify** (chain 56
supported) via `forge verify-contract --verifier sourcify` or
sourcify.dev — a useful public backup, but it does **not** replace the
BscScan verification the hackathon names.

Open-source requirement: publish the project source (contract + README) in
a public GitHub repo — the user's GitHub account **Asepaaa** can host it;
the same repo can serve the frontend via GitHub Pages (see §6, step 8).

---

## 6. Deployment-day checklist (recommended route)

0. **Preconditions:** user's explicit "gas deploy" go; re-read live BSC
   gas price (`eth_gasPrice`) and confirm it is ≤ ~0.5 gwei; re-run
   `forge test` (expect 14/14) and `forge build` in
   `~/workspace/agentid-hackathon/` so the artifact is the tested one.
1. **Generate the deployer (once):**
   `~/workspace/tools/foundry/cast wallet new` → save the output to
   `~/workspace/agentid-hackathon/keys/deployer.txt`
   (`mkdir -p keys && chmod 700 keys`, file mode 600). Report only the
   deployer **address** to the user — never the key.
2. **Fund the deployer with 0.001 BNB** from the Agentic Wallet:
   `baw wallet send` (normal transfer, user's approval flow), or the user
   sends 0.001 BNB to the deployer address himself from the Binance app.
3. **Confirm funding** on 2 independent BSC RPCs (`eth_getBalance` of the
   deployer ≥ 0.001 BNB).
4. **Deploy** (from `~/workspace/agentid-hackathon/`):
   `forge script script/Deploy.s.sol:DeployAgentFair --rpc-url https://bsc-dataseed.binance.org --private-key <deployer key from the file> --broadcast`
   The script hard-requires chain id 56 and deploys with the mainnet
   registry address.
5. **Record and verify the result:** contract address + tx hash from the
   run output / `broadcast/Deploy.s.sol/56/run-latest.json`. Then read back
   on 2 RPCs: `registry()` == `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`,
   `dropCount()` == 0, runtime code present at the address.
6. **Sweep the leftover** BNB from the deployer back to the Agentic Wallet
   (plain transfer; ~21,000 gas ≈ 0.000001 BNB at the current price).
   Decide with the user: delete `keys/deployer.txt` or keep it for future
   deployments from the same creator address.
7. **Verify on BscScan** per §5 (Option A or B). Confirm the contract page
   shows "Contract Source Code Verified" and the source is public.
8. **Wire the frontend:** in `web/app.js`, set
   `AGENTFAIR_CONTRACT_ADDRESS` in the CONFIG block to the deployed
   address (the only change needed — see `web/README.md`). Publish the
   repo (source + `web/`) on GitHub under Asepaaa and enable GitHub Pages
   for the frontend. *(Browser/GitHub steps need the user present.)*
9. **Submit the hackathon entry** before **2026-12-09 08:00 UTC**:
   project name, website (the Pages URL), contract address,
   Agent ID usage description. No registration is needed beforehand.
10. **Post-deployment (community phase, separate from this plan):** the
    Innovation Award needs ≥ 30 distinct Agent ID addresses interacting
    with the contract during the submission period — e.g. seed a first
    drop and daily check-ins, promoted via Boltbook b/alpha.

### Exactly what is needed from the user on deployment day

1. His explicit go for the paid deployment (~$0.05 of gas).
2. One funding action: approve the 0.001 BNB `baw wallet send` to the
   deployer address, **or** send 0.001 BNB to that address from the
   Binance app himself.
3. For BscScan verification: **either** an Etherscan API key (via the
   secure credential flow) **or** ~2 minutes in his own browser following
   Option B in §5.
4. His presence for the GitHub repo publish / Pages enable (step 8) and
   the hackathon submission form (step 9) — both are browser actions
   under his accounts.
