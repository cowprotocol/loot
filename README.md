## Loot - Treasure Hunts on CoW Protocol

Yaaar there wee CoW. Welcome to the treasure hunt! This repository hosts the Loot order type, an implementation of a Conditional Order, on CoW Protocol, using the [ComposableCoW conditional order framework](https://github.com/cowprotocol/composable-cow).

## Getting Started

This repository uses [Foundry](https://getfoundry.sh) as the smart contract development environment. If you're using [Visual Studio Code](https://code.visualstudio.com), with [Development Containers](https://containers.dev/), then everything is ready to go out of the box!

If not, then you will need to install the following:

- [forge](https://getfoundry.sh)

# Loot

See the [Loot](./docs/types/loot.md) documentation for exhaustive detail surrounding the order's implementation.

## Repository Layout

- `src/`: Source code for the Loot contract
- `test/`: Tests for the Loot contract
- `script/`: Script for deploying the Loot contract
- `docs/`: Documentation for the Loot contract

## Usage

### Build

```shell
forge build
```

### Test

```shell
forge test
```

### Format

```shell
forge fmt
```

### Gas Snapshots

```shell
forge snapshot
```

### Deploy

Before running the deployment script, you **MUST** set the following environment variables:

- `PRIVATE_KEY`: Private key of the deployer
- `EXTENSIBLE_FALLBACK_HANDLER`: Address of the `ExtensibleFallbackHandler` contract
- `COMPOSABLE_COW`: Address of the `ComposableCoW` contract

These can be set in a `.env` file in the root of the repository.

```shell
source .env
forge script script/Deploy.s.sol:Deploy --rpc-url <your_rpc_url>
```

### Cast

```shell
cast <subcommand>
```

### Help

```shell
forge --help
anvil --help
cast --help
```

### Documentation

https://book.getfoundry.sh/
