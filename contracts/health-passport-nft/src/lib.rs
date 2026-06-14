#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, BytesN};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PassportMetadata {
    pub passport_id: u32,
    pub credential_hash: BytesN<32>,
    pub issuer: Address,
    pub expiration: u64,
    pub owner: Address,
}

#[contracttype]
pub enum DataKey {
    Passport(u32),
    LastId,
    Admin,
}

#[contract]
pub struct HealthPassportNftContract;

#[contractimpl]
impl HealthPassportNftContract {
    /// Initialize with admin address
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::LastId, &0u32);
    }

    /// Mint a new Health Passport NFT to a patient (Issuer only)
    pub fn mint_passport(
        env: Env,
        to: Address,
        credential_hash: BytesN<32>,
        expiration: u64,
        issuer: Address,
    ) -> u32 {
        issuer.require_auth();

        let mut last_id: u32 = env.storage().instance().get(&DataKey::LastId).unwrap_or(0);
        last_id += 1;
        env.storage().instance().set(&DataKey::LastId, &last_id);

        let passport = PassportMetadata {
            passport_id: last_id,
            credential_hash,
            issuer,
            expiration,
            owner: to,
        };

        env.storage().persistent().set(&DataKey::Passport(last_id), &passport);
        last_id
    }

    /// Transfer ownership of the passport NFT (Owner only)
    pub fn transfer_passport(env: Env, from: Address, to: Address, passport_id: u32) {
        from.require_auth();

        let mut passport: PassportMetadata = env.storage().persistent()
            .get(&DataKey::Passport(passport_id))
            .expect("passport NFT not found");

        if passport.owner != from {
            panic!("not the owner of this passport");
        }

        passport.owner = to;
        env.storage().persistent().set(&DataKey::Passport(passport_id), &passport);
    }

    /// Burn/Destroy the passport NFT (Owner or Admin only)
    pub fn burn_passport(env: Env, owner_or_admin: Address, passport_id: u32) {
        owner_or_admin.require_auth();

        let passport: PassportMetadata = env.storage().persistent()
            .get(&DataKey::Passport(passport_id))
            .expect("passport NFT not found");

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if owner_or_admin != passport.owner && owner_or_admin != admin {
            panic!("unauthorized to burn passport");
        }

        env.storage().persistent().remove(&DataKey::Passport(passport_id));
    }

    /// Get passport metadata by token ID
    pub fn get_passport(env: Env, passport_id: u32) -> PassportMetadata {
        env.storage().persistent().get(&DataKey::Passport(passport_id)).expect("passport NFT not found")
    }
}
