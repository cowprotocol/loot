use clap::{Args, Parser, Subcommand};
use sha2::{Sha256, Digest};
use ethers::types::{NameOrAddress, H160, U256};
use eyre::Error;
use std::io::{self, Write};

struct Message {
    a: u128,
    b: u128,
    d0: u128,
    d1: u128
}

#[derive(Subcommand, Debug, Clone)]
pub enum Commands {
    /// Prepare a string for use in a zk proof
    Prepare,
    /// Generate the parameters for a zk proof
    GenerateParams(GenerateParams),
}

#[derive(Parser, Debug, Clone)]
#[clap(name = "treasure-chest", version, author, about)]
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
    banner();
    let matches = Opts::parse();

    match matches.subcommand {
        Commands::Prepare => {
            prepare();
        },
        Commands::GenerateParams(sub_m) => {
            if let NameOrAddress::Address(address) = sub_m.address {
                generate_params(&address)
            }
        },
    }
}

fn get_message_input(prompt: &str) -> Result<Vec<u8>, Error> {
    // Print the prompt
    print!("{}", prompt);
    // Flush stdout to ensure the prompt is displayed before reading input
    io::stdout().flush().unwrap();

    // Initialize a String to hold the user input
    let mut input = String::new();

    // Read line from stdin and unwrap the result
    io::stdin().read_line(&mut input).unwrap();

    // Check if input is not empty, then return it as Vec<u8>, else return vec![0]
    if !input.trim().is_empty() {
        Ok(input.into_bytes())
    } else {
        Ok(vec![])
    }
}

fn get_message_hash() -> Result<Message, Error> {
    let previous = get_message_input("Previous secret phrase (enter if none): ")?;
    let current = get_message_input("Current secret phrase: ")?;

    let mut pd = match previous.len() == 0 {
        true => vec![0; 32],
        false => Sha256::digest(&previous).to_vec()
    };

    let (pa, pb) = hash_to_u128(&pd);

    println!();
    println!("Previous Preimage hash parts:");
    println!("pa: {}", pa);
    println!("pb: {}", pb);

    // Now calculate the intermediate hash
    let mut current_hash = Sha256::digest(&current).to_vec();
    let (a, b) = hash_to_u128(&current_hash);

    println!("Current Preimage hash parts:");
    println!("a: {}", a);
    println!("b: {}", b);

    // Combine the hashes so as to bind them in a linear sequence
    current_hash.append(&mut pd);

    let d = Sha256::digest(&current_hash).to_vec();
    let (d0, d1) = hash_to_u128(&d);

    Ok(
        Message {
            a,
            b,
            d0,
            d1
        }
    )
}

fn prepare() -> Message {
    let message = get_message_hash().unwrap();

    println!(r#"
Digest parts (put in zk circuit):
d0: {}
d1: {}"#, message.d0, message.d1);

    message
}

fn generate_params(address: &H160) {
    let message = prepare();

    let (receiver_u256, receiver_u128, receiver_u32) = address_to_u128_u32(address);

    // calculate the hash
    let mut hasher = Sha256::new();
    hasher.update(message.a.to_be_bytes());
    hasher.update(message.b.to_be_bytes());
    hasher.update(receiver_u128.to_be_bytes());
    // zero pad the second part to 16 bytes
    hasher.update([0; 12]);
    hasher.update(receiver_u32.to_be_bytes());
    let c = hasher.finalize();

    let (c0, c1) = hash_to_u128(&c);

    let output = format!(r#"
receiver: {}

Combined Hash parts:
c0: {}
c1: {}"#, receiver_u256, c0, c1);
    println!("{}", output);
}

/// Convert an address into a u128 and u32
/// The u128 is the first 16 bytes of the address
/// The u32 is the last 4 bytes of the address
fn address_to_u128_u32(address: &H160) -> (U256, u128, u32) {
    let address_bytes = address.as_bytes();
    let receiver: U256 = address_bytes.into();

    // split the address bytes into two parts
    let (first_16_bytes, last_4_bytes) = address_bytes.split_at(16);

    // convert to u128 and u32
    let first_part: u128 = u128::from_be_bytes(first_16_bytes.try_into().unwrap());
    let second_part: u32 = u32::from_be_bytes(last_4_bytes.try_into().unwrap());

    (receiver, first_part, second_part)
}

/// Convert a 32 byte hash into two u128s
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

/// A fun banner to print out
fn banner() {
    println!(
        r#"
        /( ,,,,, )\
       _\,;;;;;;;,/_
    .-"; ;;;;;;;;; ;"-.
    '.__/`_ / \ _`\__.'        MMP""MM""YMM
       | (')| |(') |           P'   MM   `7
       | .--' '--. |                MM  `7Mb,od8 .gP"Ya   ,6"Yb.  ,pP"Ybd `7MM  `7MM  `7Mb,od8 .gP"Ya 
       |/ o     o \|                MM    MM' "',M'   Yb 8)   MM  8I   `"   MM    MM    MM' "',M'   Yb 
       |           |                MM    MM    8M""""""  ,pm9MM  `YMMMa.   MM    MM    MM    8M"""""" 
      / \ _..=.._ / \               MM    MM    YM.    , 8M   MM  L.   I8   MM    MM    MM    YM.    ,
     /:. '._____.'   \            .JMML..JMML.   `Mbmmd' `Moo9^Yo.M9mmmP'   `Mbod"YML..JMML.   `Mbmmd' 
    ;::'    / \      .;
    |     _|_ _|_   ::| 
  .-|     '==o=='    '|-. 
 /  |  . /       \    |  \                   ,,  
 |  | ::|         |   | .|       .g8"""bgd `7MM                          mm
 |  (  ')         (.  )::|      .dP'     `M   MM                          MM
 |: |   |; U U U ;|:: | `|     dM'       `   MMpMMMb.  .gP"Ya  ,pP"Ybd mmMMmm
 |' |   | \ U U / |'  |  |     MM            MM    MM ,M'   Yb 8I   `"   MM
 ##V|   |_/`"""`\_|   |V##     MM.           MM    MM 8M"""""" `YMMMa.   MM
jgs      ##V##         ##V##   `Mb.     ,'   MM    MM YM.    , L.   I8   MM
    ## ##         ## ##          `"bmmmd'  .JMML  JMML.`Mbmmd' M9mmmP'   `Mbmo
    ## ##         ## ##
"#
    )
}



