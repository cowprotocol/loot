import "dotenv/config";
import { BigNumber, ethers } from "ethers";
import {
  program,
  Option,
  InvalidArgumentError,
} from "@commander-js/extra-typings";
import { version, description } from "../package.json";
import { BuryOptions, bury } from "./commands/bury";
import { DigOptions, dig } from "./commands/dig";

// // Constants
// const RECEIVER = "0x075E706842751c28aAFCc326c8E7a26777fe3Cc2";
// const TREASURE_CHEST = "0x2557Ed03e34F0141722a643589F007836A683Af7";
// const SELL_TOKEN = "0xaf204776c7245bF4147c2612BF6e5972Ee483701"; // sDAI
// const BUY_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // xDAI
// const BUY_AMOUNT = ethers.BigNumber.from(1);
// const NUM_ORDERS = 8;
// const START_TIME = Math.floor(Date.now() / 1000); // now
// const ORDER_DURATION = 3600 * 24 * 180; // 180 days
// const APP_DATA = ethers.utils.formatBytes32String("Loot");
// const D0 =
//   "0x0000000000000000000000000000000007939c599df6f6e49309e43f492a0ff0";
// const D1 =
//   "0x000000000000000000000000000000007b65103d891a382ad52fa097fb284bc9";

// const provider = new ethers.providers.JsonRpcProvider(process.env['RPC_URL'] ?? "http://nethermind-xdai.dappnode:8545");


const providerOption = new Option(
  "--provider <url>",
  "The url of the ethereum provider",
)
  .makeOptionMandatory(true);

const addressOption = new Option(
  "--address <address>",
  "The address of the treasure chest",
)
  .makeOptionMandatory(true)
  .argParser(parseEthereumAddressOption);

const sellTokenOption = new Option(
  "--sell-token-address <address>",
  "The address of the token to sell",
)
  .makeOptionMandatory(true)
  .argParser(parseEthereumAddressOption);

const buyTokenOption = new Option(
  "--buy-token-address <address>",
  "The address of the token to buy",
)
  .makeOptionMandatory(true)
  .argParser(parseEthereumAddressOption);

const buyAmountOption = new Option(
  "--buy-amount <amount>",
  "The amount of the token to buy",
)
  .makeOptionMandatory(true)
  .argParser(parseIntToBigNumberOption);

const appDataOption = new Option(
  "--app-data <data>",
  "The app data",
).makeOptionMandatory(true);

const durationOption = new Option(
  "--duration <duration>",
  "The duration of the hunt",
)
  .makeOptionMandatory(true)
  .argParser(parseIntOption);

const startTimeOption = new Option(
  "--start-time <time>",
  "The start time of the hunt (unix timestamp)",
)
  .makeOptionMandatory(true)
  .argParser(parseIntOption);

const d0Option = new Option(
  "--d0 <digest>",
  "The first component of the secret's digest",
).makeOptionMandatory(true);

const d1Option = new Option(
  "--d1 <digest>",
  "The second component of the secret's digest",
).makeOptionMandatory(true);

const receiverOption = new Option(
  "--receiver <address>",
  "The address of the receiver",
).makeOptionMandatory(true);

const zkProofOption = new Option(
  "--zk-proof-file <file>",
  "The proof.json file from zokrates",
).makeOptionMandatory(true);

const numDecoysOption = new Option(
  "--num-decoys <decoys>",
  "The number of decoy orders to create"
).makeOptionMandatory(true).argParser(parseIntOption);

const merklePathOption = new Option(
  "--merkle-node <merkleNode...>",
  "The merkle node(s) to use for the proof"
).makeOptionMandatory(true);

const saltOption = new Option(
  "--salt <salt>",
  "The salt the conditional order was created with"
).makeOptionMandatory(true);

const swarmOption = new Option(
  "--swarm <swarm>",
  "The swarm CAC that contains the proof JSON",
).conflicts(['ipfs', 'emit-proof']);

const ipfsOption = new Option(
  "--ipfs <ipfsCid>",
  "The IPFS CID that contains the proof JSON",
).conflicts(['swarm', 'emit-proof']);

const emitProofOption = new Option(
  "--emit-proof",
  "Emit the proof on-chain",
).conflicts(['swarm', 'ipfs']);

async function main() {
  program.name("treasure-parser").description(description).version(version);

  program
    .command("bury")
    .description("Bury treasure")
    .addOption(providerOption)
    .addOption(addressOption)
    .addOption(sellTokenOption)
    .addOption(buyTokenOption)
    .addOption(buyAmountOption)
    .addOption(appDataOption)
    .addOption(durationOption)
    .addOption(startTimeOption)
    .addOption(d0Option)
    .addOption(d1Option)
    .addOption(numDecoysOption)
    .addOption(swarmOption)
    .addOption(ipfsOption)
    .addOption(emitProofOption)
    .action(async (options: BuryOptions) => {
      bury(options);
    });

  program
    .command("dig")
    .description("Dig towards the treasure")
    .addOption(providerOption)
    .addOption(receiverOption)
    .addOption(addressOption)
    .addOption(sellTokenOption)
    .addOption(buyTokenOption)
    .addOption(buyAmountOption)
    .addOption(appDataOption)
    .addOption(durationOption)
    .addOption(startTimeOption)
    .addOption(d0Option)
    .addOption(d1Option)
    .addOption(receiverOption)
    .addOption(merklePathOption)
    .addOption(zkProofOption)
    .addOption(saltOption)
    .action(async (options: DigOptions) => {
      dig(options);
    });

  program.parseAsync();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function parseIntToBigNumberOption(option: string) {
  try {
    return BigNumber.from(option);
  } catch (error) {
    throw new InvalidArgumentError(`${option} must be a number`);
  }
}

function parseIntOption(option: string) {
  try {
    return parseInt(option);
  } catch (error) {
    throw new InvalidArgumentError(`${option} must be a number`);
  }
}

function parseEthereumAddressOption(option: string) {
  const parsed = ethers.utils.getAddress(option);
  if (!parsed) {
    throw new InvalidArgumentError(`${option} must be a valid ethereum address`);
  }

  return parsed;
}