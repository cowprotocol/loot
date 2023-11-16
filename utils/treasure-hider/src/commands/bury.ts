import { BigNumber } from "ethers";
import { encodeProofLocationEmit, encodeProofLocationIPFS, encodeProofLocationSwarm, generateRandomConditionalOrder, getParams } from "../utils";
import { CONDITIONAL_ORDER_ABI, LOOT_ORDER_CONTRACT_ADDRESS } from "../types";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { ComposableCoW__factory } from "../typechain";
import { COMPOSABLE_COW_CONTRACT_ADDRESS, ProofLocation } from "@cowprotocol/cow-sdk";

export interface BuryOptions {
    provider: string;
    address: string;
    sellTokenAddress: string;
    buyTokenAddress: string;
    buyAmount: BigNumber;
    appData: string;
    duration: number;
    startTime: number;
    d0: string;
    d1: string;
    numDecoys: number;
    swarmCac?: string;
    ipfsCid?: string;
    emitProof?: boolean;
}

export async function bury(options: BuryOptions): Promise<void> {
    const { numDecoys } = options;
    const params = await getParams({
        ...options,
        lootContractAddress: LOOT_ORDER_CONTRACT_ADDRESS,
    })

    console.log("Conditional order parameters:");
    console.log(JSON.stringify(params, null, 2));

    // Now we have the conditional order, let's mix it with other random orders
    const values = [
      ...((() => {
        const result = [];
        for (let i = 0; i < numDecoys - 1; i++) {
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
        if (v[0]![0] == LOOT_ORDER_CONTRACT_ADDRESS) {
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
    } else {
        console.log("Proof generated...");
        console.log(JSON.stringify(proof, null, 2));
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

    const proofData = () => {
      if (options.emitProof) {
        return encodeProofLocationEmit(proof, params);
      } else if (options.swarmCac) {
        return encodeProofLocationSwarm(options.swarmCac);
      } else if (options.ipfsCid) {
        return encodeProofLocationIPFS(options.ipfsCid);
      } else {
        return { data: "0x", location: ProofLocation.PRIVATE };
      }
    }

    // 1. The TX data to set the merkle root
    const setRootTx = {
      to: COMPOSABLE_COW_CONTRACT_ADDRESS[100],
      value: 0,
      data: iface.encodeFunctionData("setRoot", [
        tree.root,
        proofData(),
      ])
    }

    console.log(`Transaction to set the proof:`);
    console.log(JSON.stringify(setRootTx, null, 2));
}