// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.0 <0.9.0;

import "forge-std/Script.sol";

// Order type
import "composable/ComposableCoW.sol";
import "../src/zk/verifier.sol";
import {IZkVerifier} from "../src/interfaces/IZkVerifier.sol";
import "../src/Loot.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        ExtensibleFallbackHandler eHandler = ExtensibleFallbackHandler(vm.envAddress("EXTENSIBLE_FALLBACK_HANDLER"));
        ComposableCoW composableCow = ComposableCoW(vm.envAddress("COMPOSABLE_COW"));

        vm.startBroadcast(deployerPrivateKey);

        // Deploy the verifier
        IZkVerifier verifier = IZkVerifier(address(new Verifier{salt: ""}()));

        // Deploy Loot
        new Loot{salt: ""}(eHandler, composableCow, verifier);
    }
}
