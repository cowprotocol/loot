// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.0 <0.9.0;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {GPv2Order} from "cowprotocol/libraries/GPv2Order.sol";
import {GPv2Settlement} from "cowprotocol/GPv2Settlement.sol";
import {Safe} from "safe/Safe.sol";
import {ComposableCoW} from "composable/ComposableCoW.sol";
import {ExtensibleFallbackHandler} from "safe/handler/ExtensibleFallbackHandler.sol";

import "composable/BaseConditionalOrder.sol";

// --- error strings
/// @dev can't buy and sell the same token
string constant ERR_SAME_TOKENS = "same tokens";
/// @dev sell amount must be greater than zero
string constant ERR_MIN_SELL_AMOUNT = "sellAmount must be gt 0";
/// @dev buy amount must be greater than zero
string constant ERR_MIN_BUY_AMOUNT = "buyAmount must be gt 0";
/// @dev start time must be greater than zero
string constant ERR_MIN_START_TIME = "startTime must be gt 0";
/// @dev start time must be less than valid to
string constant ERR_INSUFFICIENT_TIME = "startTime must be lt validTo";
/// @dev treasure hunt hasn't started yet
string constant ERR_NOT_STARTED = "treasure hunt hasn't started";
/// @dev invalid fallback handler
string constant ERR_INVALID_FALLBACK_HANDLER = "invalid fallback handler";
/// @dev receiver is not a Safe
string constant ERR_NOT_SAFE = "receiver is not a Safe";
/// @dev domain verifier not set
string constant ERR_DOMAIN_VERIFIER_NOT_SET = "domain verifier not set";

/**
 * @title Treasure hunt order type for CoW Protocol 💰🐮
 * @author CoW Protocol Developers
 */
contract Loot is BaseConditionalOrder {
    /// @dev `staticInput` data struct for treasure hunts
    struct Data {
        IERC20 sellToken;
        IERC20 buyToken;
        uint256 sellAmount;
        uint256 buyAmount;
        bytes32 appData;
        uint32 validTo;
        // treasure hunt specifics
        uint32 startTime; // unix timestamp when the hunt starts
    }

    ExtensibleFallbackHandler public immutable extensibleFallbackHandler;
    ComposableCoW public immutable composableCow;
    bytes32 public immutable domainSeparator;

    // From: https://github.com/safe-global/safe-contracts/blob/v1.4.1/contracts/base/FallbackManager.sol
    // keccak256("fallback_manager.handler.address")
    bytes32 internal constant FALLBACK_HANDLER_STORAGE_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;

    constructor(ExtensibleFallbackHandler _extensibleFallbackHandler, ComposableCoW _composableCow) {
        extensibleFallbackHandler = _extensibleFallbackHandler;
        composableCow = _composableCow;
        domainSeparator = _composableCow.domainSeparator();
    }

    /**
     * If the conditions are satisfied, return the order that can be filled.
     * @param staticInput ABI encoded `Data` struct containing all the static input data for the treasure hunt
     * @param offChainInput ABI encoded address of the receiver
     * @return order `GPv2Order.Data` struct that can be filled
     */
    function getTradeableOrder(address, address, bytes32, bytes calldata staticInput, bytes calldata offChainInput)
        public
        view
        override
        returns (GPv2Order.Data memory order)
    {
        // get the static input data and validate
        Data memory data = abi.decode(staticInput, (Data));
        _validateData(data);

        // check that the treasure hunt has started
        if (block.timestamp < data.startTime) {
            revert PollTryAtEpoch(data.startTime, ERR_NOT_STARTED);
        }

        // get the off-chain input data and validate
        Safe receiver = Safe(payable(abi.decode(offChainInput, (address))));

        /**
         * @dev We only want to allow receivers that:
         *      1. Are a `Safe` with their fallback handler set to `ExtensibleFallbackHandler`
         *      2. Have set `ComposableCoW` as a domain verifier for the `GPv2Settlement` EIP-712 domain
         */
        try receiver.getStorageAt(uint256(FALLBACK_HANDLER_STORAGE_SLOT), 1) returns (
            bytes memory fallbackHandlerStorage
        ) {
            address fallbackHandler = abi.decode(fallbackHandlerStorage, (address));
            if (fallbackHandler != address(extensibleFallbackHandler)) {
                revert OrderNotValid(ERR_INVALID_FALLBACK_HANDLER);
            }

            address domainVerifier = address(extensibleFallbackHandler.domainVerifiers(receiver, domainSeparator));
            if (domainVerifier != address(composableCow)) {
                revert OrderNotValid(ERR_DOMAIN_VERIFIER_NOT_SET);
            }
        } catch {
            revert OrderNotValid(ERR_NOT_SAFE);
        }

        order = GPv2Order.Data(
            data.sellToken,
            data.buyToken,
            address(receiver),
            data.sellAmount,
            data.buyAmount,
            data.validTo,
            data.appData,
            0, // use zero fee for limit orders
            GPv2Order.KIND_BUY, // use buy order for treasure hunts
            false, // partially fillable orders are not supported
            GPv2Order.BALANCE_ERC20,
            GPv2Order.BALANCE_ERC20
        );
    }

    /**
     * External function for validating the ABI encoded data struct. Helps debuggers!
     * @param data `Data` struct containing all the static input data for the treasure hunt
     * @dev Throws if the data is invalid
     */
    function validateData(bytes memory data) external pure override {
        _validateData(abi.decode(data, (Data)));
    }

    function _validateData(Data memory data) internal pure {
        if (data.sellToken == data.buyToken) {
            revert OrderNotValid(ERR_SAME_TOKENS);
        }
        if (data.sellAmount == 0) {
            revert OrderNotValid(ERR_MIN_SELL_AMOUNT);
        }
        if (data.buyAmount == 0) {
            revert OrderNotValid(ERR_MIN_BUY_AMOUNT);
        }
        if (data.startTime == 0) {
            revert OrderNotValid(ERR_MIN_START_TIME);
        }
        if (data.validTo <= data.startTime) {
            revert OrderNotValid(ERR_INSUFFICIENT_TIME);
        }
    }
}
