// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentFair} from "../src/AgentFair.sol";

/// @notice Deploys AgentFair on BNB Chain mainnet (chain id 56).
///
/// The contract has no owner and no admin: the deployer key's only role is
/// paying the deployment gas. It retains no power over the contract.
///
/// Usage (deployment day only — do NOT run with --broadcast before the
/// user's explicit go):
///
///   forge script script/Deploy.s.sol:DeployAgentFair \
///     --rpc-url https://bsc-dataseed.binance.org \
///     --private-key <DEPLOYER_PRIVATE_KEY> \
///     --broadcast
///
/// The deployer EOA must hold at least ~0.001 BNB (estimated need is
/// ~0.00008 BNB at the 2026-11-19 gas price; see DEPLOY-PLAN.md).
/// The registry defaults to the BSC mainnet Agent ID registry; override
/// with the AGENT_ID_REGISTRY env var only for rehearsals.
contract DeployAgentFair is Script {
    address internal constant BSC_MAINNET_AGENT_ID_REGISTRY = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    function run() external returns (AgentFair deployed) {
        require(block.chainid == 56, "DeployAgentFair: BSC mainnet (chainid 56) only");

        address registry = vm.envOr("AGENT_ID_REGISTRY", BSC_MAINNET_AGENT_ID_REGISTRY);
        require(registry != address(0), "DeployAgentFair: registry is zero address");

        vm.startBroadcast();
        deployed = new AgentFair(registry);
        vm.stopBroadcast();

        console.log("AgentFair deployed at:", address(deployed));
        console.log("Registry:", address(deployed.registry()));
    }
}
