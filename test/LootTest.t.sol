// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.0 <0.9.0;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";

import "composable-test/ComposableCoW.base.t.sol";
import "../src/Loot.sol";
import {Verifier} from "../src/zk/verifier.sol";

contract LootTest is BaseComposableCoWTest {
    IERC20 constant SELL_TOKEN = IERC20(address(0x1));
    IERC20 constant BUY_TOKEN = IERC20(address(0x2));
    uint256 constant SELL_AMOUNT = 105;
    uint256 constant BUY_AMOUNT = 100;

    Loot loot;
    address safe;
    bytes32 domainSeparator;
    IZkVerifier verifier;

    function setUp() public virtual override(BaseComposableCoWTest) {
        super.setUp();

        verifier = IZkVerifier(address(new Verifier()));

        loot = new Loot(
            eHandler,
            composableCow,
            verifier
        );

        domainSeparator = composableCow.domainSeparator();
    }

    function test_verifyOrder() public {
        Loot.Data memory data = helper_testData();
        vm.warp(data.startTime);

        GPv2Order.Data memory empty;
        GPv2Order.Data memory order =
            loot.getTradeableOrder(address(safe1), address(0), bytes32(0), abi.encode(data), helper_getOffChain(safe1));
        bytes32 hash_ = GPv2Order.hash(order, domainSeparator);

        loot.verify(
            address(safe1),
            address(0),
            hash_,
            domainSeparator,
            bytes32(0),
            abi.encode(data),
            helper_getOffChain(safe1),
            empty
        );
    }

    function test_timing_RevertBeforeHuntStarted() public {
        Loot.Data memory data = helper_testData();

        // if before start time, should revert
        vm.warp(data.startTime - 1);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalOrder.PollTryAtEpoch.selector, data.startTime, ERR_NOT_STARTED)
        );
        loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), helper_getOffChain(safe1));
    }

    function test_validation_offchain_RevertWhenNotSafe() public {
        Loot.Data memory data = helper_testData();
        vm.warp(data.startTime);

        vm.expectRevert(abi.encodeWithSelector(IConditionalOrder.OrderNotValid.selector, ERR_NOT_SAFE));
        loot.getTradeableOrder(
            safe,
            address(0),
            bytes32(0),
            abi.encode(data),
            abi.encode(Safe(payable(address(0x7))), helper_getProofSafe1())
        );
    }

    function test_validation_offchain_RevertWhenFallbackHandlerNotExtensible() public {
        Loot.Data memory data = helper_testData();
        vm.warp(data.startTime);

        // set the fallback handler to something other than `ExtensibleFallbackHandler`
        vm.prank(address(safe1));
        safe1.setFallbackHandler(address(handler));

        vm.expectRevert(abi.encodeWithSelector(IConditionalOrder.OrderNotValid.selector, ERR_INVALID_FALLBACK_HANDLER));

        loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), helper_getOffChain(safe1));
    }

    function test_validation_offchain_RevertWhenComposableCoWNotDomainVerifier() public {
        Loot.Data memory data = helper_testData();
        vm.warp(data.startTime);

        // Set the `GPv2Settlement` domain verifier to something other than `ComposableCoW`
        SafeLib.execute(
            safe1,
            address(safe1),
            0,
            abi.encodeWithSelector(
                eHandler.setDomainVerifier.selector,
                domainSeparator,
                abi.encode(Safe(payable(address(0x7))), helper_getProofSafe1())
            ),
            Enum.Operation.Call,
            signers()
        );

        vm.expectRevert(abi.encodeWithSelector(IConditionalOrder.OrderNotValid.selector, ERR_DOMAIN_VERIFIER_NOT_SET));

        loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), helper_getOffChain(safe1));
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
        data.d0 = bytes32(0x00000000000000000000000000000000ecc730b6a224df4ca27ee4b5217c926c);
        data.d1 = bytes32(0x00000000000000000000000000000000055f9cd72ca92f6bc9481cc0fd85b5f1);

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

        (GPv2Order.Data memory order, bytes memory sig) = composableCow.getTradeableOrderWithSignature(
            address(safe1), params, helper_getOffChain(safe2), new bytes32[](0)
        );

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
            startTime: 79,
            d0: bytes32(0x0000000000000000000000000000000009ade42435fc0de2382b6513b4815141),
            d1: bytes32(0x00000000000000000000000000000000ec0235ae49db101bb69056f5e3d545aa)
        });
    }

    function helper_getOffChain(Safe _safe) internal view returns (bytes memory) {
        if (_safe == safe1) {
            return abi.encode(_safe, helper_getProofSafe1());
        } else if (_safe == safe2) {
            return abi.encode(_safe, help_getProofSafe2());
        } else {
            revert("invalid safe");
        }
    }

    function helper_getProofSafe1() internal pure returns (IZkVerifier.Proof memory) {
        IZkVerifier.G1Point memory a = IZkVerifier.G1Point(
            uint256(0x2be3537354b44880866e75d864c304a91419f65de00a9ae7513ab58085ee1987),
            uint256(0x17df30de3488a866f2705c4de4d8f2bb819d5559b2117fba01a87e9240d94b2a)
        );
        IZkVerifier.G2Point memory b = IZkVerifier.G2Point(
            [
                uint256(0x214bc228e953bde2bbe25c11e3d312adaf21b24381cea52f1954a28301b5f2dc),
                uint256(0x210bcc2d6417cf1fb21ba1ebd83b7d425a5801ee8b85b0ccb17049e4cd1f6fba)
            ],
            [
                uint256(0x2b407fdccd2b9de0d2a0130e217b0cec510662adc0d5ff0baed94a466fdd097c),
                uint256(0x0894fecd9df1c8240c6d31c1e8ec13a813574344375ae4c717b1beffebed2752)
            ]
        );
        IZkVerifier.G1Point memory c = IZkVerifier.G1Point(
            uint256(0x08b1c50f499c7e8d1544d1d1d9bc08e3a3e2bb4c38f991dec1eadf2e12c4e648),
            uint256(0x29365d065c07aaf46d8ac0c2395e5a6bc3320b2343c30fae7cb202c602598613)
        );

        return IZkVerifier.Proof(a, b, c);
    }

    function help_getProofSafe2() internal pure returns (IZkVerifier.Proof memory) {
        IZkVerifier.G1Point memory a = IZkVerifier.G1Point(
            uint256(0x2545aaaadc1ac43d1f6eb9eacf0b732eab3db8c99e3f898aa3bca828ddb348da),
            uint256(0x0e9dc9ee72617ea00f96f4eaa297e8cebebbca73384422278127b463fce2be3b)
        );
        IZkVerifier.G2Point memory b = IZkVerifier.G2Point(
            [
                uint256(0x1ba0228ecec4cb392912e9054d7701f52f7b78f86cda3a6ec907eb3a1038fc3e),
                uint256(0x2f01307659cddd59c1aa238efad6d84b61993c17a24587ed38e4a5485c013f16)
            ],
            [
                uint256(0x089809164b25192c777cbc8fc6656241fd63b2c9b02bba2bd283c732eb55f84d),
                uint256(0x02d0bb218f7a61455939202706ce3162e6934662ee49fb7a6e7553b38fa202d5)
            ]
        );
        IZkVerifier.G1Point memory c = IZkVerifier.G1Point(
            uint256(0x0a15553e60208dd715e5ab19c76e189fb540569bbf94a5a2517c3e767f518a5e),
            uint256(0x0301ff4ba1ef270f2690fb9590167dc73c496775e20bf687a3e20137f2835476)
        );

        return IZkVerifier.Proof(a, b, c);
    }
}
