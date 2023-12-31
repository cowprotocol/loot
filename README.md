# MasterCoW's Missing Treasure

![MasterCoW's vacation](./cowvacay.jpg)

It's been a long, cold crypto-winter, but spring has finally arrived. The sun is shining, the birds are singing, and the flowers are blooming. MasterCoW has taken a vacation! But MasterCoW was a very busy cow over crypto-winter, building the ultimate MEV protection protocol, CoW Protocol. So protective is he over the protocol, he broke it into parts and hid them across the world. Fortunately, the CoW Protocol team has been able to retrieve all the parts, except it turns out they are locked inside treasure chests, and they need your help to open them! The only hint found is a cryptic note written by MasterCoW that reads:

> cow is the key to be MEV free

Each treasure chest, except the first one, requires two keys to unlock. It is expected that MasterCoW uses long and complex secret phrases to generate the keys, so the CoW Protocol team has decided to use zk-SNARKs to verify the keys, without revealing them. The CoW Protocol team need your help to locate the keys, and prove that they are correct, so that they can unlock the treasure chests. You will be rewarded handsomely for your efforts, both monetarily, and with the eternal gratitude of the CoWmunity.  

Treasure chests (for rewards totaling 11,500 WXDAI + $1000 worth of of BZZ):

* Chest 1: 500 WXDAI: [`gno:0x35d3Ed0752e1554cb281b1965BA20F11F8D9D6e6`](https://gnosisscan.io/address/0x35d3Ed0752e1554cb281b1965BA20F11F8D9D6e6)
* Chest 2: 1000 WXDAI + $1000 worth of BZZ from [Ethereum Swarm](https://ethswarm.org). [`gno:0x1e35682D83f4351A64bE480F0c84735dfa2bD931`](https://gnosisscan.io/address/0x1e35682D83f4351A64bE480F0c84735dfa2bD931).
* Chest 3: 10000 WXDAI. [`gno:0x5388B20D5433Acd1B3a249E69323F8F3Ff654c75`](https://gnosisscan.io/address/0x5388B20D5433Acd1B3a249E69323F8F3Ff654c75).

## Getting started

This repository is a mono-repo, containing:

- The `Loot` conditional order type
- The `Loot` zk-SNARK circuit, written in [zokrates](https://zokrates.github.io/gettingstarted.html)
- The [`treasure-chest`](./utils/treasure-chest/README.md), a CLI tool for generating the co-ordinate points for the zk-SNARK circuit
- The [`treasure-hider`](./utils/treasure-hider/README.md), a CLI tool used to bury and dig up treasure chests

Join the [CoW Protocol Discord](https://discord.gg/cowprotocol) in the **#treasure-hunt** channel to discuss the treasure hunt with other participants.

### Knowledge Prerequisites

To complete the entire treasure hunt, you will need to be familiar with the following:

- [CoW Protocol](https://beta.docs.cow.fi/cow-protocol/reference)
    - [`ComposableCoW`](https://beta.docs.cow.fi/cow-protocol/reference/contracts/periphery/composable-cow)
    - [API](https://beta.docs.cow.fi/cow-protocol/reference/apis/orderbook)
    - [`cow-sdk`](https://beta.docs.cow.fi/cow-protocol/reference/sdks/cow-sdk)
- [`ExtensibleFallbackHandler`](https://hackmd.io/-nLuF3JIRyuS5w864_mbrg)
- [`zokrates`](https://zokrates.github.io/gettingstarted.html)
- [Rust](https://www.rust-lang.org/learn/get-started)
- JavaScript
