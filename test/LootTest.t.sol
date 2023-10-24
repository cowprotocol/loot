// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.0 <0.9.0;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";

import "composable-test/ComposableCoW.base.t.sol";
import "../src/Loot.sol";

contract LootTest is BaseComposableCoWTest {
    IERC20 constant SELL_TOKEN = IERC20(address(0x1));
    IERC20 constant BUY_TOKEN = IERC20(address(0x2));
    uint256 constant SELL_AMOUNT = 105;
    uint256 constant BUY_AMOUNT = 100;

    Loot loot;
    address safe;
    bytes32 domainSeparator;

    function setUp() public virtual override(BaseComposableCoWTest) {
        super.setUp();

        loot = new Loot(
            eHandler,
            composableCow
        );

        domainSeparator = composableCow.domainSeparator();
    }

    function test_verifyOrder() public {
        Loot.Data memory data = helper_testData();
        vm.warp(data.startTime);

        GPv2Order.Data memory empty;
        GPv2Order.Data memory order =
            loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), abi.encode(safe1));
        bytes32 hash_ = GPv2Order.hash(order, domainSeparator);

        loot.verify(safe, address(0), hash_, domainSeparator, bytes32(0), abi.encode(data), abi.encode(safe1), empty);
    }

    function test_timing_RevertBeforeHuntStarted() public {
        Loot.Data memory data = helper_testData();

        // if before start time, should revert
        vm.warp(data.startTime - 1);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalOrder.PollTryAtEpoch.selector, data.startTime, ERR_NOT_STARTED)
        );
        loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), abi.encode(safe1));
    }

    function test_validation_offchain_RevertWhenNotSafe() public {
        Loot.Data memory data = helper_testData();
        vm.warp(data.startTime);

        vm.expectRevert(abi.encodeWithSelector(IConditionalOrder.OrderNotValid.selector, ERR_NOT_SAFE));
        GPv2Order.Data memory order =
            loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), abi.encode(address(0x7)));
    }

    function test_validation_offchain_RevertWhenFallbackHandlerNotExtensible() public {
        Loot.Data memory data = helper_testData();
        vm.warp(data.startTime);

        // set the fallback handler to something other than `ExtensibleFallbackHandler`
        vm.prank(address(safe1));
        safe1.setFallbackHandler(address(handler));

        vm.expectRevert(abi.encodeWithSelector(IConditionalOrder.OrderNotValid.selector, ERR_INVALID_FALLBACK_HANDLER));

        GPv2Order.Data memory order =
            loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), abi.encode(safe1));
    }

    function test_validation_offchain_RevertWhenComposableCoWNotDomainVerifier() public {
        Loot.Data memory data = helper_testData();
        vm.warp(data.startTime);

        // Set the `GPv2Settlement` domain verifier to something other than `ComposableCoW`
        SafeLib.execute(
            safe1,
            address(safe1),
            0,
            abi.encodeWithSelector(eHandler.setDomainVerifier.selector, domainSeparator, address(0x7)),
            Enum.Operation.Call,
            signers()
        );

        vm.expectRevert(abi.encodeWithSelector(IConditionalOrder.OrderNotValid.selector, ERR_DOMAIN_VERIFIER_NOT_SET));

        GPv2Order.Data memory order =
            loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), abi.encode(safe1));
    }

    function test_validation_RevertWhenSellTokenEqualsBuyToken() public {
        Loot.Data memory data = helper_testData();
        data.sellToken = data.buyToken;

        helper_runRevertingValidate(data, ERR_SAME_TOKENS);
    }

    function test_validation_RevertWhenSellAmountIsZero() public {
        Loot.Data memory data = helper_testData();
        data.sellAmount = 0;

        helper_runRevertingValidate(data, ERR_MIN_SELL_AMOUNT);
    }

    function test_validation_RevertWhenBuyAmountIsZero() public {
        Loot.Data memory data = helper_testData();
        data.buyAmount = 0;

        helper_runRevertingValidate(data, ERR_MIN_BUY_AMOUNT);
    }

    function test_validation_RevertWhenStartTimeIsZero() public {
        Loot.Data memory data = helper_testData();
        data.startTime = 0;

        helper_runRevertingValidate(data, ERR_MIN_START_TIME);
    }

    function test_validation_RevertWhenStartTimeIsAfterValidTo() public {
        Loot.Data memory data = helper_testData();
        data.startTime = data.validTo + 1;

        helper_runRevertingValidate(data, ERR_INSUFFICIENT_TIME);
    }

    function test_e2e_settle() public {
        Loot.Data memory data = helper_testData();
        data.sellToken = token0;
        data.buyToken = token1;

        SafeLib.execute(
            safe2,
            address(safe2),
            0,
            abi.encodeWithSelector(eHandler.setDomainVerifier.selector, domainSeparator, address(composableCow)),
            Enum.Operation.Call,
            signers()
        );

        // create the order
        IConditionalOrder.ConditionalOrderParams memory params =
            super.createOrder(loot, keccak256("loot"), abi.encode(data));

        // create the order
        _create(address(safe1), params, false);
        // deal the sell token to the safe
        deal(address(data.sellToken), address(safe1), data.sellAmount);
        // authorise the vault relayer to pull the sell token from the safe
        vm.prank(address(safe1));
        data.sellToken.approve(address(relayer), data.sellAmount);

        // make sure we're at the start time of the hunt
        vm.warp(data.startTime);

        (GPv2Order.Data memory order, bytes memory sig) =
            composableCow.getTradeableOrderWithSignature(address(safe1), params, abi.encode(safe2), new bytes32[](0));

        uint256 safe1BalanceBefore = data.sellToken.balanceOf(address(safe1));
        uint256 safe2BalanceBefore = data.buyToken.balanceOf(address(safe2));

        settle(address(safe1), bob, order, sig, hex"");

        uint256 safe1BalanceAfter = data.sellToken.balanceOf(address(safe1));
        uint256 safe2BalanceAfter = data.buyToken.balanceOf(address(safe2));

        assertEq(safe1BalanceAfter, safe1BalanceBefore - data.sellAmount);
        assertEq(safe2BalanceAfter, safe2BalanceBefore + data.buyAmount);

        // make sure the order is no longer tradeable
        settle(address(safe1), bob, order, sig, "GPv2: order filled");
    }

    function helper_runRevertingValidate(Loot.Data memory data, string memory reason) internal {
        vm.expectRevert(abi.encodeWithSelector(IConditionalOrder.OrderNotValid.selector, reason));
        loot.validateData(abi.encode(data));
    }

    function helper_testData() internal pure returns (Loot.Data memory) {
        return Loot.Data({
            sellToken: SELL_TOKEN,
            buyToken: BUY_TOKEN,
            sellAmount: SELL_AMOUNT,
            buyAmount: BUY_AMOUNT,
            appData: bytes32(0),
            validTo: 1000,
            startTime: 79
        });
    }
}
