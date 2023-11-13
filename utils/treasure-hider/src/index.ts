import { ethers } from 'ethers';
import { randomBytes } from 'crypto';
import { OrderBookApi, encodeParams, ConditionalOrderParams, ProofLocation } from '@cowprotocol/cow-sdk';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { ComposableCoW__factory } from './typechain';
import { Data, Proof } from './types';

const lootAddress = "0x081B39051E6f91Dd03EDC099d6a94Fe76aB96218";

// ERC20 Token ABI (simplified)
const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)"
];

// Async function to retrieve the sellToken balance for an address
async function getSellTokenBalance(provider: ethers.providers.Provider, sellTokenAddress: string, address: string): Promise<ethers.BigNumber> {
    const sellTokenContract = new ethers.Contract(sellTokenAddress, erc20Abi, provider);
    return await sellTokenContract['balanceOf'](address);
}

// Modified function to populate the Data structure
async function createData(
    provider: ethers.providers.Provider,
    address: string,
    appData: string,
    validTo: number,
    startTime: number,
    d0: string,
    d1: string
): Promise<Data> {
    const sellTokenAddress = '0xaf204776c7245bF4147c2612BF6e5972Ee483701';
    const buyTokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    const sellAmount = await getSellTokenBalance(provider, sellTokenAddress, address);

    return {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        sellAmount,
        buyAmount: ethers.BigNumber.from(1),
        appData,
        validTo,
        startTime,
        d0,
        d1
    };
}

function encodeLootStruct(data: Data): string {
    // Define the struct type according to the Solidity ABI encoding rules
    const structType = 'tuple(address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, bytes32 appData, uint32 validTo, uint32 startTime, bytes32 d0, bytes32 d1)';

    // Encode the struct data
    const encodedData = ethers.utils.defaultAbiCoder.encode(
        [structType],
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
                data.d1
            ]
        ]
    );

    return encodedData;
}

function generateSecureRandomHash(): string {
    // Generate a cryptographically secure random buffer of 32 bytes
    const buffer = randomBytes(32);

    // Convert the buffer to a hex string.
    const hexString = ethers.utils.hexlify(buffer);

    // Hash the hex string with keccak256.
    const hash = ethers.utils.keccak256(hexString);

    console.log(hash);

    return hash;
}

// function generateTree(element: any, span: number): any[][] {
//     const tree: any[] = [];
//     const elems = [];

//     for (let i = 0; i < span - 1; i++) {
//         elems.push(generateSecureRandomHash());
//     }
//     elems.push(element);

//     // Must do sorting!
//     elems.sort();

//     return elems.map((e) => [e]);
// }

function generateRandomConditionalOrder(): ConditionalOrderParams {
    return {
        handler: '0x292c4abf72fd4d2e4e5200b8331c56e9b22b66eb',
        salt: generateSecureRandomHash(),
        staticInput: '0x'
    }
}

function encodeProofWithAddress(address: string, proof: Proof): string {
    const types = [
        'address',                         // Address
        'tuple(bytes32,bytes32)',          // G1Point a
        'tuple(bytes32[2],bytes32[2])',    // G2Point b
        'tuple(bytes32,bytes32)'           // G1Point c
    ];

    const values = [
        address,
        [proof.a.X, proof.a.Y],            // G1Point a values
        [proof.b.X, proof.b.Y],            // G2Point b values
        [proof.c.X, proof.c.Y]             // G1Point c values
    ];

    return ethers.utils.defaultAbiCoder.encode(types, values);
}

// Example usage
(async () => {
    // Configure your provider (e.g., Infura, Alchemy, etc.)
    const provider = new ethers.providers.JsonRpcProvider("http://nethermind-xdai.dappnode:8545");

    // Your user's address
    const treasureChest = "0x2557Ed03e34F0141722a643589F007836A683Af7";

    // Other parameters...
    const appData = ethers.utils.formatBytes32String("Loot");
    const startTime = Math.floor(Date.now() / 1000);
    // const startTime = 1699884990;
    const validTo = startTime + 7200;
    const d0 = "0x0000000000000000000000000000000007939c599df6f6e49309e43f492a0ff0";
    const d1 = "0x000000000000000000000000000000007b65103d891a382ad52fa097fb284bc9";

    try {
        const data = await createData(provider, treasureChest, appData, validTo, startTime, d0, d1);
        const encodedData = encodeLootStruct(data);

        const receiver = "0x075E706842751c28aAFCc326c8E7a26777fe3Cc2";

        console.log('Encoded data: ', encodedData);

        // At this point we have created the data structure for loot. Let's create the conditional order
        const params: ConditionalOrderParams = {
            handler: lootAddress,
            salt: '0xbeae1b72a72d44aeb9a735e584dddfe687794578cb2b4f51a4c20e76da3a04f6',
            staticInput: encodedData
        }

        const encodedParams = encodeParams(params);
        const hashedParams = encodedParams;
        console.log('Encoded params: ', encodedParams);
        console.log('Hashed params: ', hashedParams);

        // At this point, we generate a set of random hashes, which will form the basis
        const values = [
            [generateRandomConditionalOrder()],
            [generateRandomConditionalOrder()],
            [generateRandomConditionalOrder()],
            [generateRandomConditionalOrder()],
            [generateRandomConditionalOrder()],
            [generateRandomConditionalOrder()],
            [generateRandomConditionalOrder()],
            [params]
        ].map(([p]: any) => {
            return [[p.handler, p.salt, p.staticInput]]
        }) as string[][][]

        const tree = StandardMerkleTree.of(values, ["tuple(address,bytes32,bytes)"]);

        console.log('Merkle Root:', tree.root);

        const proofFinder = (address: string): string[] | undefined => {
            for (const [i, v] of tree.entries()) {
                if (v[0]![0] == lootAddress) {
                    const proof = tree.getProof(i);
                    console.log('Value:', v);
                    console.log('Proof:', proof);
                    return proof;
                }
            }
            return undefined;
        }

        const iface = ComposableCoW__factory.createInterface();

        const setRootTxData = iface.encodeFunctionData("setRoot", [tree.root, {data: '0x', location: ProofLocation.PRIVATE}]);
        console.log(`Transaction to set the proof: ${setRootTxData}`);

        const proof = proofFinder(lootAddress);

        const verified = StandardMerkleTree.verify(tree.root, ["tuple(address handler,bytes32 salt,bytes staticInput)"], [params], proof!!);

        if (verified) {
            console.log('Proof verified!');
        }

        if (proof) {
            const zkProof: Proof = {
                a: {
                    X: '0x02061e514561169ca0bcaed1b334eb66d98e105f5b8ae38f14c165292d0f69e4',
                    Y: '0x292c4abf72fd4d2e4e5200b8331c56e9b22b66eb21e1c6d879d7d2a200137f96',
                },
                b: {
                    X: [ '0x1d07f4adfeb6fb363be7102de870b491e4fb0a201a1de8e6120720548b88d179', '0x0d684c00d2beecdc1afc82a7d746d6f5738e6ebaac83fddd37546861cdd25b3d'],
                    Y: [ '0x04123055f2404e71bac16d4eefbfc836b3b87985456310fabe1d9c1ca382e14a', '0x09e8de8aee89eb3259c01e7f98753a4bc16294c78b8c0aa46270a4d7359d70b8'],
                },
                c: {
                    X: '0x11f5f1e374ebd1ee3db7211b2ca97fb0aea5ed936ce307464521a2f6f4d85fdf',
                    Y: '0x11995bc9683979f236a717bef20122a6c5ca00b19353117db3c86457a64de481',
                },
            }

            const encodedProof = encodeProofWithAddress(receiver, zkProof);

            const getTradeableOrderTxData = iface.encodeFunctionData("getTradeableOrderWithSignature", [treasureChest, params, encodedProof, proof]);

            console.log(`Transaction to get the tradeable order: ${getTradeableOrderTxData}`);
        }

    } catch (error) {
        console.error(error);
    }
})();
