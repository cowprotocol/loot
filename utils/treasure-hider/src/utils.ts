import { BigNumber, ethers } from "ethers";
import { Data, ERC20_ABI, LOOT_DATA_ABI, PROOF_WITH_ADDRESS_ABI, Proof } from "./types";
import { randomBytes } from "ethers/lib/utils";
import { ConditionalOrderParams, ProofLocation, ProofStruct } from "@cowprotocol/cow-sdk";

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
        ERC20_ABI,
        provider,
    );
    return await sellTokenContract["balanceOf"](address);
}

export interface CreateLootData {
    provider: ethers.providers.Provider;
    address: string;
    sellTokenAddress: string;
    buyTokenAddress: string;
    buyAmount: BigNumber;
    appData: string;
    validTo: number;
    startTime: number;
    d0: string;
    d1: string;
}

export async function createLootData(params: CreateLootData): Promise<Data> {
    const {
        provider,
        address,
        sellTokenAddress,
        buyTokenAddress,
        buyAmount,
        appData,
        validTo,
        startTime,
        d0,
        d1,
    } = params;
    const sellAmount = await getSellTokenBalance(
        provider,
        sellTokenAddress,
        address,
    );

    return {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        sellAmount,
        buyAmount: buyAmount,
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
export function encodeLootStruct(data: Data): string {
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
export function generateSecureRandom(len: number = 32): string {
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
export function generateRandomConditionalOrder(): ConditionalOrderParams {
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
export function encodeProofWithAddress(address: string, proof: Proof): string {
    const values = [
        address,
        [proof.a.X, proof.a.Y], // G1Point a values
        [proof.b.X, proof.b.Y], // G2Point b values
        [proof.c.X, proof.c.Y], // G1Point c values
    ];

    return ethers.utils.defaultAbiCoder.encode(PROOF_WITH_ADDRESS_ABI, values);
}

interface GetParams {
    provider: string;
    lootContractAddress: string;
    address: string;
    sellTokenAddress: string;
    buyTokenAddress: string;
    buyAmount: BigNumber;
    appData: string;
    startTime: number;
    duration: number;
    d0: string;
    d1: string;
    salt?: string;
}

export async function getParams(params: GetParams): Promise<ConditionalOrderParams> {
    const { 
        provider,
        lootContractAddress,
        startTime,
        duration,
        salt,
    } = params;
    const data = await createLootData({
        ...params,
        provider: new ethers.providers.JsonRpcProvider(provider),
        validTo: startTime + duration,
    });

    const encodedData = encodeLootStruct(data);

    // At this point we have created the data structure for loot. Let's create the conditional order
    return {
        handler: lootContractAddress,
        salt: salt ?? generateSecureRandom(),
        staticInput: encodedData,
    }
}

// abi.encode(bytes[] order) where order = abi.encode(bytes32[] proof, ConditionalOrderParams params)
export function encodeProofLocationEmit(proof: string[], params: ConditionalOrderParams): ProofStruct {
    const data = ethers.utils.defaultAbiCoder.encode(
        ["bytes32[]", "tuple(address handler, bytes32 salt, bytes staticInput)"],
        [proof, params],
    );

    return { data, location: ProofLocation.EMITTED }
}

// abi.encode(bytes32 swarmCac)
export function encodeProofLocationSwarm(chunkAddress: string): ProofStruct {
    const data = ethers.utils.defaultAbiCoder.encode(
        ["bytes32"],
        [chunkAddress],
    );

    return { data, location: ProofLocation.SWARM }
}

// abi.encode(string protobufUri, string[] enrTreeOrMultiaddr, string contentTopic, bytes payload)
export function encodeProofLocationWaku(protobufUri: string, enrTreeOrMultiaddr: string[], contentTopic: string, payload: string): ProofStruct {
    const data = ethers.utils.defaultAbiCoder.encode(
        ["string", "string[]", "string", "bytes"],
        [protobufUri, enrTreeOrMultiaddr, contentTopic, payload],
    );

    return { data, location: ProofLocation.WAKU };
}

// abi.encode(bytes32 ipfsCid)
export function encodeProofLocationIPFS(ipfsCid: string): ProofStruct {
    const data = ethers.utils.defaultAbiCoder.encode(
        ["bytes32"],
        [ipfsCid],
    );

    return { data, location: ProofLocation.IPFS };
}