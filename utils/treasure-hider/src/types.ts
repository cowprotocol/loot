import { ethers } from "ethers";

// Define the Data structure in TypeScript
export interface Data {
  sellToken: string;
  buyToken: string;
  sellAmount: ethers.BigNumber;
  buyAmount: ethers.BigNumber;
  appData: string;
  validTo: number;
  startTime: number;
  d0: string;
  d1: string;
}

export interface G1Point {
  X: string; // bytes32
  Y: string; // bytes32
}

export interface G2Point {
  X: [string, string]; // bytes32[2]
  Y: [string, string]; // bytes32[2]
}

export interface Proof {
  a: G1Point;
  b: G2Point;
  c: G1Point;
}

export const G1_POINT_ABI = "tuple(bytes32,bytes32)";
export const G2_POINT_ABI = "tuple(bytes32[2],bytes32[2])";

export const PROOF_WITH_ADDRESS_ABI = [
  "address",
  G1_POINT_ABI,
  G2_POINT_ABI,
  G1_POINT_ABI
]

export const CONDITIONAL_ORDER_ABI = "tuple(address handler,bytes32 salt,bytes staticInput)";

export const LOOT_DATA_ABI = "tuple(address sellToken,address buyToken,uint256 sellAmount,uint256 buyAmount,bytes32 appData,uint32 validTo,uint32 startTime,bytes32 d0,bytes32 d1)";