#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Issuer {
    pub id: u32,
    pub wallet_address: Address,
    pub organization_name: String,
    pub country: String,
    pub is_active: bool,
}

#[contracttype]
pub enum DataKey {
    Issuer(Address),
    Admin,
}

#[contract]
pub struct IssuerRegistryContract;

#[contractimpl]
impl IssuerRegistryContract {
    /// Initialize contract with admin address
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Register a new trusted health authority (Admin only)
    pub fn register_issuer(
        env: Env,
        id: u32,
        wallet_address: Address,
        organization_name: String,
        country: String,
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        let issuer = Issuer {
            id,
            wallet_address: wallet_address.clone(),
            organization_name,
            country,
            is_active: true,
        };
        env.storage().persistent().set(&DataKey::Issuer(wallet_address), &issuer);
    }

    /// Deactivate/remove a registered health authority (Admin only)
    pub fn remove_issuer(env: Env, wallet_address: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        if env.storage().persistent().has(&DataKey::Issuer(wallet_address.clone())) {
            let mut issuer: Issuer = env.storage().persistent().get(&DataKey::Issuer(wallet_address.clone())).unwrap();
            issuer.is_active = false;
            env.storage().persistent().set(&DataKey::Issuer(wallet_address), &issuer);
        }
    }

    /// Check if a wallet address represents a registered and active issuer
    pub fn is_authorized_issuer(env: Env, wallet_address: Address) -> bool {
        if let Some(issuer) = env.storage().persistent().get::<DataKey, Issuer>(&DataKey::Issuer(wallet_address)) {
            issuer.is_active
        } else {
            false
        }
    }

    /// Fetch details of a registered issuer
    pub fn get_issuer(env: Env, wallet_address: Address) -> Issuer {
        env.storage().persistent().get(&DataKey::Issuer(wallet_address)).expect("issuer not found")
    }
}
