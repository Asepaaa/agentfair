# AgentFair — Keyless Verification Result (Sourcify + BscScan check)

- Contract: `0xB4e3ac1647f17D3676B98a61159EeA71749B8E37` (AgentFair, BSC mainnet, chain 56)
- Creator/deployment tx: `0x37de7bce99a4f8fd1d34a1f3c636b4338dba9e116bbf8f00181a9aeda4188d7f`
- Compiler: solc v0.8.35+commit.47b9dedd, optimizer disabled
- Submitted: 2026-11-19T05:42:50Z (keyless, no account, no API key, no transaction)
- Checked: 2026-11-19 ~05:43–05:45 UTC

## Sourcify — ✅ VERIFIED, exact match (full match)

Submitted via `POST https://sourcify.dev/server/v2/verify/56/0xB4e3ac1647f17D3676B98a61159EeA71749B8E37`
with the prepared standard-JSON input, compiler version, contract identifier
`src/AgentFair.sol:AgentFair`, and the creator tx hash.

- verificationId: `3c420db2-36e4-4b54-b6af-a7f08b65dea9`
- Job result: `match: "exact_match"`, `creationMatch: "exact_match"`, `runtimeMatch: "exact_match"`
  (Sourcify API v2's "exact_match" is the classic **full_match**: both creation and
  runtime bytecode match the recompiled source byte-for-byte, metadata included.)
- matchId: `59508790`
- verifiedAt: `2026-11-19T05:42:51Z`
- Confirmed independently via `GET /server/v2/contract/56/<address>` → same exact_match record,
  and via `?fields=sources,compilation` → the verified `src/AgentFair.sol` source is stored and served.

Sourcify URLs:
- Lookup UI: https://sourcify.dev/#/lookup/0xB4e3ac1647f17D3676B98a61159EeA71749B8E37
- API record: https://sourcify.dev/server/v2/contract/56/0xB4e3ac1647f17D3676B98a61159EeA71749B8E37
- Note: the legacy repository file URLs (repo.sourcify.dev/contracts/full_match/…)
  redirect to the removed API-v1 repository path and return 404 — Sourcify now serves
  verified data only through API v2. This does not affect the verification itself.

Raw responses saved in this directory:
- `sourcify-verify-response.json` (submission acknowledgement)
- `sourcify-verify-job-result.json` (final job result, exact_match)
- `sourcify-contract-status.json` (GET /v2/contract record)

## BscScan — ⚠️ NOT confirmed (cannot be read from this VM)

- `https://bscscan.com/address/0xB4e3ac1647f17D3676B98a61159EeA71749B8E37#code` fetched with a
  browser user agent returns **HTTP 403 with a Cloudflare "Just a moment" challenge page** —
  BscScan is bot-walled from this VM, so its displayed verification state could not be read.
  **No claim is made that BscScan shows the contract as verified.**
- Fallback evidence source also unavailable: Blockscout BSC (bsc.blockscout.com) returns
  "default backend - 404" for this address **and for well-known contracts (e.g. WBNB)** —
  its backend is not serving from here, so it can neither confirm nor deny Sourcify-based
  verification.
- One relevant signal from the Sourcify job itself: Sourcify attempted to forward this
  verification to Etherscan (the operator of BscScan's verification backend) and reported
  `externalVerifications.etherscan.error: "Daily limit of 500 source code submissions reached"`.
  That is Sourcify's own submission quota being exhausted at 05:42 UTC — so automatic
  propagation of this verification to BscScan **cannot be assumed** to have happened.

## What remains unverified / the remaining gap

- **BscScan's own "Contract Source Code Verified" status for this contract is unproven.**
  The source code *is* publicly verified on Sourcify with an exact (full) match, which is
  a complete, keyless, publicly checkable verification — but BscScan is a separate database.
- To close the gap, either:
  1. Open the BscScan address page from an unblocked browser/network and look for the
     green "Contract Source Code Verified" check on the Contract tab; or
  2. Submit directly to BscScan/Etherscan (requires a free Etherscan API key) using the
     same `standard-json-input.json` in this directory; or
  3. Re-check later — if Sourcify retries its Etherscan forwarding after its daily quota
     resets, BscScan may pick the verification up on its own.
