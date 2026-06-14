#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, BytesN};

#[contracttype]
pub enum DataKey {
    Revoked(BytesN<32>),
    Admin,
}

#[contract]
pub struct RevocationRegistryContract;

#[contractimpl]
impl RevocationRegistryContract {
    /// Initialize the contract with admin address
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Revoke a credential commitment (Authority must sign/call)
    pub fn revoke_credential(env: Env, credential_hash: BytesN<32>, authority: Address) {
        authority.require_auth();
        // Mark the hash as revoked
        env.storage().persistent().set(&DataKey::Revoked(credential_hash), &true);
    }

    /// Restore/un-revoke a credential commitment (Authority must sign/call)
    pub fn restore_credential(env: Env, credential_hash: BytesN<32>, authority: Address) {
        authority.require_auth();
        // Unmark the hash
        env.storage().persistent().set(&DataKey::Revoked(credential_hash), &false);
    }

    /// Check if a credential commitment is revoked
    pub fn check_revocation(env: Env, credential_hash: BytesN<32>) -> bool {
        env.storage().persistent()
            .get::<DataKey, bool>(&DataKey::Revoked(credential_hash))
            .unwrap_or(false)
    }
}
