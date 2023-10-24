# Loot

## Overview

A _loot_ order type is a simple concrete _buy_ order, enforcing some conditions on the `receiver` in order to satisfy the treasure hunt's terms.

As prizes are advertised in a fixed number of tokens, the CoW Protocol order type is set to `buy` to ensure that the output tokens are the same as the advertised prize tokens.

**NOTE**: As `buy` orders are used, the `sellAmount` must take into account the `buyAmount` and the protocols' fees.

### `receiver` Conditions

The `receiver` of a _loot_ order _MUST_ satisfy the following conditions:

1. The `receiver` _MUST_ be a deploy [`Safe`](https://safe.global).
2. The `receiver` _MUST_ have their Safe's fallback handler set to the [`ExtensibleFallbackHandler`](https://github.com/cowprotocol/composable-cow).
3. The `receiver` _MUST_ have set `ComposableCoW` as the domain verifier for the `GPv2Settlement` EIP-712 domain.


## Data Structure

* **Uses Cabinet**: ❌
* **Value Factory**: N/A

### Call Data

The `Data` struct is used to store the parameters of the loot. The `Data` struct is ABI-encoded and used as the `staticInput` of the `ConditionalOrder` that is created. The `Data` struct is as follows:

```solidity=
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
```

Off-chain data is also required to be passed. The `offChainInput` field shall be set to the `abi.encode(address(receiver))` where the `receiver` satisfies the conditions above.

### Storage

Not applicable

### Calculated / auto-filled fields

The following `GPv2Order.Data` fields are calculated / auto-filled by the contract:

- `kind`: Set to `GPv2Order.Kind.Buy`
- `sellTokenBalance` / `buyTokenBalance`: Set to `erc20`
- `feeAmount`: Set to `0`, ie. limit order
- `partiallyFillable`: Set to `false`, ie. Fill-or-Kill

## Limitations

* `buy` orders ONLY
* `sellToken` MUST NOT be the same as `buyToken`
* `sellAmount` MUST be greater than 0
* `buyAmount` MUST be greater than 0
* `startTime` MUST be greater than 0
* `validTo` MUST be greater than `startTime`

### Replay Mitigation

1. Replay attacks are not possible for `Loot` order types as the entire `GPv2Order.Data` struct is prescriptively defined by the `Data` struct. No fields are calculated dynamically. Therefore, this is the same as a user's normal limit order, in which case replay attacks are mitigated by `GPv2Settlement` monitoring the filled amounts of the order's corresponding `orderUid`.

## Usage

Example: CoW Protocol wants to offer a prize of 500 DAI to the first user that is able to solve the puzzle. The puzzle will be released on Sunday, October 1, 2023 6:11:37 GMT+00:00 (unix timestamp: 1696140697). The prize is valid for 1 week, and will expire on Sunday, October 8, 2023 6:11:37 GMT+00:00 (unix timestamp: 1696745497). 

- `sellToken`: `USDC`
- `buyToken`: `DAI`
- `sellAmount`: `501 USDC`
- `buyAmount`: `500 DAI`
- `appData`: `keccak256('loot')`
- `validTo`: `1696745497` // Sunday, October 8, 2023 6:11:37 GMT+00:00
- `receiver`: `address(alice)`

To create the loot order:

1. ABI-encode the `IConditionalOrder.ConditionalOrderParams` struct with:
    - `handler`: set the `Loot` smart contract deployment.
    - `salt`: set to a unique value (recommended: cryptographically random).
    - `staticInput`: set to the ABI-encoded `Loot.Data` struct.
2. Use the `struct` to create a Merkle leaf.
3. Approve `GPv2VaultRelayer` to spend `sellAmount` of user's `sellToken` tokens (in the example above, `GPv2VaultRelayer` should be approved to spend 501 USDC).

**NOTE**: When calling `ComposableCoW.setRoot`, you are responsible for crafting the `ProofLocation` struct. The `ProofLocation` struct provides an enum describing the location of the proof, and a `bytes` field that contains the proof itself (in the case of proof location = 1), or a protocol-specific bytes field.
