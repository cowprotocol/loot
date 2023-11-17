import { COMPOSABLE_COW_CONTRACT_ADDRESS } from "@cowprotocol/cow-sdk";
import { LOOT_ORDER_CONTRACT_ADDRESS, Proof as ZkProof } from "../types";
import { encodeProofWithAddress, getParams } from "../utils";
import { BuryOptions } from "./bury";
import { ComposableCoW__factory } from "../typechain";

export interface DigOptions extends Omit<BuryOptions, "numDecoys"> {
    receiver: string;
    zkProofFile: string;
    merkleNode: string[];
    salt: string;
}

export async function dig(options: DigOptions): Promise<void> {
    const { address, receiver, merkleNode, zkProofFile } = options;
    const params = await getParams({
        ...options,
        lootContractAddress: LOOT_ORDER_CONTRACT_ADDRESS,
    })

    console.log(JSON.stringify(merkleNode));

    const zkProofJson = await import(zkProofFile);
    const zkProof: ZkProof = {
        a: {
            X: zkProofJson.proof.a[0],
            Y: zkProofJson.proof.a[1],
        },
        b: {
            X: [
                zkProofJson.proof.b[0]![0],
                zkProofJson.proof.b[0]![1],
            ],
            Y: [
                zkProofJson.proof.b[1]![0],
                zkProofJson.proof.b[1]![1],
            ],
        },
        c: {
            X: zkProofJson.proof.c[0],
            Y: zkProofJson.proof.c[1],
        },
    }

    const iface = ComposableCoW__factory.createInterface();

    // 2. The TX data to get the tradeable order with signature
    const getTradeableOrderWithSignatureTx = {
        to: COMPOSABLE_COW_CONTRACT_ADDRESS[100],
        value: 0,
        data: iface.encodeFunctionData(
            "getTradeableOrderWithSignature",
            [address, params, encodeProofWithAddress(receiver, zkProof), merkleNode],
        )
    }

    console.log(`Staticcall transaction for getTradeableOrderWithSignature:`);
    console.log(JSON.stringify(getTradeableOrderWithSignatureTx, null, 2));
}