use clap::{Args, Parser, Subcommand};
use sha2::{Sha256, Digest};
use ethers::types::{NameOrAddress, H160, U256};
use promkit::preset::Readline;
use eyre::Error;

#[derive(Subcommand, Debug, Clone)]
pub enum Commands {
    /// Prepare a string for use in a zk proof
    Prepare,
    /// Generate the parameters for a zk proof
    GenerateParams(GenerateParams),
}

#[derive(Parser, Debug, Clone)]
#[clap(name = "treasure-box", version, author, about)]
pub struct Opts {
    #[clap(subcommand)]
    pub subcommand: Commands,
}

#[derive(Args, Debug, Clone)]
pub struct GenerateParams {
    /// The address to generate the parameters for
    #[clap(short, long, value_parser = parse_name_or_address)]
    address: NameOrAddress,
}

fn main() {
    let matches = Opts::parse();

    match matches.subcommand {
        Commands::Prepare => prepare(),
        Commands::GenerateParams(sub_m) => {
            if let NameOrAddress::Address(address) = sub_m.address {
                generate_params(&address);
            }
        },
    }
}

fn get_message_hash() -> Result<(u128, u128, Vec<u8>), Error> {
    let mut p = Readline::default()
        .title("Secret phrase")
        .prompt()?;
    let message = p.run()
        .unwrap()
        .as_bytes()
        .to_vec();

    // Now calculate the intermediate hash
    let intermediate_hash = Sha256::digest(&message).to_vec();
    let (part1, part2) = hash_to_u128(&intermediate_hash);

    println!("Preimage hash parts:");
    println!("a: {}", part1);
    println!("b: {}", part2);

    // Now calculate the final hash, which is the hash of the
    // intermediate hash with 32 zero bytes appended
    let mut message = intermediate_hash;
    message.extend(vec![0; 32]);

    Ok((part1, part2, Sha256::digest(&message).to_vec()))
}

fn prepare() {
    let (_pre_part_1, _pre_part_2, message_hash) = get_message_hash().unwrap();
    let (part1, part2) = hash_to_u128(&message_hash);
    println!("Digest parts (put in zk circuit): {} {}", part1, part2);
}

fn generate_params(address: &H160) {
    let (pre_part_1, pre_part_2, message_hash) = get_message_hash().unwrap();

    let address_bytes = address.as_bytes();

    // split the address bytes into two parts
    let (first_16_bytes, last_4_bytes) = address_bytes.split_at(16);

    // convert to u128 and u32
    let first_part: u128 = u128::from_be_bytes(first_16_bytes.try_into().unwrap());
    let second_part: u32 = u32::from_be_bytes(last_4_bytes.try_into().unwrap());

    // calculate the hash
    let mut hasher = Sha256::new();
    hasher.update(pre_part_1.to_be_bytes());
    hasher.update(pre_part_2.to_be_bytes());
    hasher.update(first_part.to_be_bytes());
    // zero pad the second part to 16 bytes
    hasher.update([0; 12]);
    hasher.update(second_part.to_be_bytes());
    let final_hash = hasher.finalize();

    let (part1, part2) = hash_to_u128(&message_hash);
    let (final_part1, final_part2) = hash_to_u128(&final_hash);
    let receiver: U256 = address_bytes.into();

    println!("Digest hash parts (put in zk circuit):");
    println!("a: {}", part1);
    println!("b: {}", part2);

    println!();
    println!("receiver: {}", receiver);
    println!();
    println!("Combined Hash parts:");
    println!("c0: {}", final_part1);
    println!("c1: {}", final_part2);
}

fn hash_to_u128(hash: &[u8]) -> (u128, u128) {
    let (part1_bytes, part2_bytes) = hash.split_at(16);
    let part1 = u128::from_be_bytes(part1_bytes.try_into().unwrap());
    let part2 = u128::from_be_bytes(part2_bytes.try_into().unwrap());
    (part1, part2)
}

/// A `clap` `value_parser` that parses a `NameOrAddress` from a string
fn parse_name_or_address(s: &str) -> Result<NameOrAddress, Error> {
    Ok(if s.starts_with("0x") {
        NameOrAddress::Address(s.parse()?)
    } else {
        NameOrAddress::Name(s.to_string())
    })
}
