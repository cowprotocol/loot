// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.0 <0.9.0;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";

import "composable-test/ComposableCoW.base.t.sol";
import "../src/Loot.sol";
import {Verifier as Verifier1} from "./ZkSafe1Verifier.sol";
import {Verifier as Verifier2} from "./ZkSafe2Verifier.sol";

contract LootTest is BaseComposableCoWTest {
    IERC20 constant SELL_TOKEN = IERC20(address(0x1));
    IERC20 constant BUY_TOKEN = IERC20(address(0x2));
    uint256 constant SELL_AMOUNT = 105;
    uint256 constant BUY_AMOUNT = 100;

    Loot loot;
    address safe;
    bytes32 domainSeparator;
    IZkVerifier verifier1;
    IZkVerifier verifier2;

    function setUp() public virtual override(BaseComposableCoWTest) {
        super.setUp();

        loot = new Loot(
            eHandler,
            composableCow
        );

        verifier1 = IZkVerifier(address(new Verifier1()));
        verifier2 = IZkVerifier(address(new Verifier2()));

        domainSeparator = composableCow.domainSeparator();
    }

    function test_verifyOrder() public {
        Loot.Data memory data = helper_testData(address(verifier1));
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
        Loot.Data memory data = helper_testData(address(verifier1));

        // if before start time, should revert
        vm.warp(data.startTime - 1);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalOrder.PollTryAtEpoch.selector, data.startTime, ERR_NOT_STARTED)
        );
        loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), helper_getOffChain(safe1));
    }

    function test_validation_offchain_RevertWhenNotSafe() public {
        Loot.Data memory data = helper_testData(address(verifier1));
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
        Loot.Data memory data = helper_testData(address(verifier1));
        vm.warp(data.startTime);

        // set the fallback handler to something other than `ExtensibleFallbackHandler`
        vm.prank(address(safe1));
        safe1.setFallbackHandler(address(handler));

        vm.expectRevert(abi.encodeWithSelector(IConditionalOrder.OrderNotValid.selector, ERR_INVALID_FALLBACK_HANDLER));

        loot.getTradeableOrder(safe, address(0), bytes32(0), abi.encode(data), helper_getOffChain(safe1));
    }

    function test_validation_offchain_RevertWhenComposableCoWNotDomainVerifier() public {
        Loot.Data memory data = helper_testData(address(verifier1));
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
        Loot.Data memory data = helper_testData(address(verifier1));
        data.sellToken = data.buyToken;

        helper_runRevertingValidate(data, ERR_SAME_TOKENS);
    }

    function test_validation_RevertWhenSellAmountIsZero() public {
        Loot.Data memory data = helper_testData(address(verifier1));
        data.sellAmount = 0;

        helper_runRevertingValidate(data, ERR_MIN_SELL_AMOUNT);
    }

    function test_validation_RevertWhenBuyAmountIsZero() public {
        Loot.Data memory data = helper_testData(address(verifier1));
        data.buyAmount = 0;

        helper_runRevertingValidate(data, ERR_MIN_BUY_AMOUNT);
    }

    function test_validation_RevertWhenStartTimeIsZero() public {
        Loot.Data memory data = helper_testData(address(verifier1));
        data.startTime = 0;

        helper_runRevertingValidate(data, ERR_MIN_START_TIME);
    }

    function test_validation_RevertWhenStartTimeIsAfterValidTo() public {
        Loot.Data memory data = helper_testData(address(verifier1));
        data.startTime = data.validTo + 1;

        helper_runRevertingValidate(data, ERR_INSUFFICIENT_TIME);
    }

    function test_e2e_settle() public {
        Loot.Data memory data = helper_testData(address(verifier2));
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

    function helper_testData(address verifier) internal pure returns (Loot.Data memory) {
        return Loot.Data({
            sellToken: SELL_TOKEN,
            buyToken: BUY_TOKEN,
            sellAmount: SELL_AMOUNT,
            buyAmount: BUY_AMOUNT,
            appData: bytes32(0),
            validTo: 1000,
            startTime: 79,
            verifier: verifier
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
            uint256(0x0a54f6f7f1903ca6749fa74e620daf2393f45186028160ae485fa9c8b2b26e29),
            uint256(0x1d079debfae839f8e75270399285f869e1a0420632f5bfeae3e1a9d399444994)
        );
        IZkVerifier.G2Point memory b = IZkVerifier.G2Point(
            [
                uint256(0x1a9d682d056a31a70780e3e93197535db198d93f415824f411cccf11db8a18cf),
                uint256(0x17e250315595efb131e37687f4930fcc3dd3f8667459413c98854a2d974c5b10)
            ],
            [
                uint256(0x24aa801fbc9050c5b4053ce6e4c6cc544fce06bc185054d2622acca5c8b98e08),
                uint256(0x25e6682e1367a0a015affc39eb5a5fbc119f054a14f33307a1d48d20f049cefd)
            ]
        );
        IZkVerifier.G1Point memory c = IZkVerifier.G1Point(
            uint256(0x1065d2562d04da2ea46e2989174b351549a8104421f4ddc25032609b042d1fba),
            uint256(0x1894546595751798bed578c02586c034ba9b0bb533c95e570626573bb70669ae)
        );

        return IZkVerifier.Proof(a, b, c);
    }

    function help_getProofSafe2() internal pure returns (IZkVerifier.Proof memory) {
        IZkVerifier.G1Point memory a = IZkVerifier.G1Point(
            uint256(0x093b14dcf2af4b10ca458bad1fceefe1a7a91f8ed411df60a5e89e2c85b4e8a4),
            uint256(0x0303ff2fd7a23fafc310867bedfdb5f93b4a58567d53aba8ffa8a4cdc07f15b4)
        );
        IZkVerifier.G2Point memory b = IZkVerifier.G2Point(
            [
                uint256(0x1a4bb3d95677b9e772ef6c7015398935cd73f7613247eaf9e3a85eaa57fb8c45),
                uint256(0x22766fb05b4d7cd286ec1cf506e62743d2f7f0c52aa0ac812bd02bb85a1a048c)
            ],
            [
                uint256(0x042ee5c99d7d83c31e0baf56a0fd94b6c91b15e7c66f08b32283a6a2adff98bf),
                uint256(0x03bba86705503f7c37ebd44aa0d70735dc492f58b86c6950cce1c3483912c0cc)
            ]
        );
        IZkVerifier.G1Point memory c = IZkVerifier.G1Point(
            uint256(0x1923e095c742ac614894e609e5240edd8a439df2a52f38ba194a9ee95761047c),
            uint256(0x106dcacd792357edcf34a5daf267e97631535fbe5fdae90aa50e760d70f61aa6)
        );

        return IZkVerifier.Proof(a, b, c);
    }
}
