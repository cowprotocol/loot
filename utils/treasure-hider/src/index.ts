import { randomBytes } from "crypto";
import { ethers } from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import {
  ConditionalOrderParams,
  ProofLocation,
  COMPOSABLE_COW_CONTRACT_ADDRESS,
} from "@cowprotocol/cow-sdk";
require("dotenv").config();

import { ComposableCoW__factory } from "./typechain";
import { CONDITIONAL_ORDER_ABI, Data, LOOT_DATA_ABI, PROOF_WITH_ADDRESS_ABI, Proof } from "./types";

// Constants
const RECEIVER = "0x075E706842751c28aAFCc326c8E7a26777fe3Cc2";
const TREASURE_CHEST = "0x2557Ed03e34F0141722a643589F007836A683Af7";
const LOOT_ORDER_TYPE = "0x081B39051E6f91Dd03EDC099d6a94Fe76aB96218";
const SELL_TOKEN = "0xaf204776c7245bF4147c2612BF6e5972Ee483701"; // sDAI
const BUY_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // xDAI
const BUY_AMOUNT = ethers.BigNumber.from(1);
const NUM_ORDERS = 8;
const START_TIME = Math.floor(Date.now() / 1000); // now
const ORDER_DURATION = 3600 * 24 * 180; // 180 days
const APP_DATA = ethers.utils.formatBytes32String("Loot");
const D0 =
  "0x0000000000000000000000000000000007939c599df6f6e49309e43f492a0ff0";
const D1 =
  "0x000000000000000000000000000000007b65103d891a382ad52fa097fb284bc9";

const provider = new ethers.providers.JsonRpcProvider(process.env['RPC_URL'] ?? "http://nethermind-xdai.dappnode:8545");

// ERC20 Token ABI (simplified)
const erc20Abi = ["function balanceOf(address owner) view returns (uint256)"];

/**
 * Get the balance of the `Loot` safe that forms the basis of the conditional order
 * @param provider ethers provider
 * @param sellTokenAddress Address of the token from which to sell to buy the reward
 * @param address Address of the `Loot` safe
 * @returns The balance of the `sellTokenAddress` token for the `address` address
 */
async function getSellTokenBalance(
  provider: ethers.providers.Provider,
  sellTokenAddress: string,
  address: string,
): Promise<ethers.BigNumber> {
  const sellTokenContract = new ethers.Contract(
    sellTokenAddress,
    erc20Abi,
    provider,
  );
  return await sellTokenContract["balanceOf"](address);
}

async function createLootData(
  provider: ethers.providers.Provider,
  address: string,
  appData: string,
  validTo: number,
  startTime: number,
  d0: string,
  d1: string,
): Promise<Data> {
  const sellTokenAddress = SELL_TOKEN;

  const sellAmount = await getSellTokenBalance(
    provider,
    sellTokenAddress,
    address,
  );

  return {
    sellToken: sellTokenAddress,
    buyToken: BUY_TOKEN,
    sellAmount,
    buyAmount: BUY_AMOUNT,
    appData,
    validTo,
    startTime,
    d0,
    d1,
  };
}

/**
 * ABI-encode the loot data structure
 * @param data `Loot` data structure
 * @returns An ABI-encoded `Loot` struct
 */
function encodeLootStruct(data: Data): string {
  // Encode the struct data
  const encodedData = ethers.utils.defaultAbiCoder.encode(
    [LOOT_DATA_ABI],
    [
      [
        data.sellToken,
        data.buyToken,
        data.sellAmount,
        data.buyAmount,
        data.appData,
        data.validTo,
        data.startTime,
        data.d0,
        data.d1,
      ],
    ],
  );

  return encodedData;
}

/**
 * Cryptographically secure random bytes generator
 * @param len Length of secure random bytes (less than or equal to 32)
 * @returns A length of bytes equal to `len` that is cryptographically secure
 */
function generateSecureRandom(len: number = 32): string {
  // Generate a cryptographically secure random buffer of 32 bytes
  const buffer = randomBytes(32);

  // Convert the buffer to a hex string.
  const hexString = ethers.utils.hexlify(buffer);

  // Hash the hex string with keccak256.
  const hash = ethers.utils.keccak256(hexString);

  if (len < 32) {
    return hash.slice(0, (len * 2) + 2);
  }

  return hash;
}

/**
 * A random conditional order generator, used for populating the merkle tree
 * to ensure that the merkle tree has sufficient entropy.
 * @returns A random conditional order
 */
function generateRandomConditionalOrder(): ConditionalOrderParams {
  return {
    handler: generateSecureRandom(20),
    salt: generateSecureRandom(),
    staticInput: "0x",
  };
}

/**
 * A utility method to ABI-encode the zk proof with the address of the receiver
 * @param address Address of the receiver that is attesting the zk proof
 * @param proof A struct containing the zk proof
 * @returns The ABI-encoded `offChainInput` field when supplying the `getTradeableOrderWithSignature` function
 */
function encodeProofWithAddress(address: string, proof: Proof): string {
  const values = [
    address,
    [proof.a.X, proof.a.Y], // G1Point a values
    [proof.b.X, proof.b.Y], // G2Point b values
    [proof.c.X, proof.c.Y], // G1Point c values
  ];

  return ethers.utils.defaultAbiCoder.encode(PROOF_WITH_ADDRESS_ABI, values);
}

// Example usage
(async () => {
  // Other parameters...

  try {
    const data = await createLootData(
      provider,
      TREASURE_CHEST,
      APP_DATA,
      START_TIME + ORDER_DURATION,
      START_TIME,
      D0,
      D1,
    );
    const encodedData = encodeLootStruct(data);

    // At this point we have created the data structure for loot. Let's create the conditional order
    const params: ConditionalOrderParams = {
      handler: LOOT_ORDER_TYPE,
      salt: generateSecureRandom(),
      staticInput: encodedData,
    };

    // Now we have the conditional order, let's mix it with other random orders
    const values = [
      ...((() => {
        const result = [];
        for (let i = 0; i < NUM_ORDERS - 1; i++) {
          result.push(generateRandomConditionalOrder());
        }
        return result;
      })()),
      params,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ].map((p) => {
      return [[p.handler, p.salt, p.staticInput]];
    }) as string[][][];

    // Create the merkle tree
    const tree = StandardMerkleTree.of(values, [
      CONDITIONAL_ORDER_ABI,
    ]);

    console.log("Merkle Root:", tree.root);

    // Utility method to find the proof for the loot order
    const proofFinder = (): string[] | undefined => {
      for (const [i, v] of tree.entries()) {
        if (v[0]![0] == LOOT_ORDER_TYPE) {
          const proof = tree.getProof(i);
          return proof;
        }
      }
      return undefined;
    };

    const proof = proofFinder();
  
    if (!proof) {
      console.error("Proof not found!");
      return;
    }

    // For sanity, let's verify the proof
    const verified = StandardMerkleTree.verify(
      tree.root,
      [CONDITIONAL_ORDER_ABI],
      [params],
      proof,
    );

    if (verified) {
      console.log("Proof verified!");
    } else {
      console.error("Proof not verified!");
      return;
    }

    // Output
    const iface = ComposableCoW__factory.createInterface();

    // 1. The TX data to set the merkle root
    const setRootTx = {
      to: COMPOSABLE_COW_CONTRACT_ADDRESS[100],
      value: 0,
      data: iface.encodeFunctionData("setRoot", [
        tree.root,
        { data: "0x", location: ProofLocation.PRIVATE },
      ])
    }

    console.log(`Transaction to set the proof:`);
    console.log(JSON.stringify(setRootTx, null, 2));

    const zkProof: Proof = {
      a: {
        X: "0x02061e514561169ca0bcaed1b334eb66d98e105f5b8ae38f14c165292d0f69e4",
        Y: "0x292c4abf72fd4d2e4e5200b8331c56e9b22b66eb21e1c6d879d7d2a200137f96",
      },
      b: {
        X: [
          "0x1d07f4adfeb6fb363be7102de870b491e4fb0a201a1de8e6120720548b88d179",
          "0x0d684c00d2beecdc1afc82a7d746d6f5738e6ebaac83fddd37546861cdd25b3d",
        ],
        Y: [
          "0x04123055f2404e71bac16d4eefbfc836b3b87985456310fabe1d9c1ca382e14a",
          "0x09e8de8aee89eb3259c01e7f98753a4bc16294c78b8c0aa46270a4d7359d70b8",
        ],
      },
      c: {
        X: "0x11f5f1e374ebd1ee3db7211b2ca97fb0aea5ed936ce307464521a2f6f4d85fdf",
        Y: "0x11995bc9683979f236a717bef20122a6c5ca00b19353117db3c86457a64de481",
      },
    };

    // 2. The TX data to get the tradeable order with signature
    const getTradeableOrderWithSignatureTx = {
      to: COMPOSABLE_COW_CONTRACT_ADDRESS[100],
      value: 0,
      data: iface.encodeFunctionData(
        "getTradeableOrderWithSignature",
        [TREASURE_CHEST, params, encodeProofWithAddress(RECEIVER, zkProof), proof],
      )
    }

    console.log(`Staticcall transaction for getTradeableOrderWithSignature:`);
    console.log(JSON.stringify(getTradeableOrderWithSignatureTx, null, 2));
  } catch (error) {
    console.error(error);
  }
})();
