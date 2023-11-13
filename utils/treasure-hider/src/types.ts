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