#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, BytesN, contractclient};

#[contractclient(name = "IssuerRegistryClient")]
pub trait IssuerRegistry {
    fn is_authorized_issuer(env: Env, wallet_address: Address) -> bool;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Credential {
    pub credential_hash: BytesN<32>,
    pub issuer: Address,
    pub issue_date: u64,
    pub expiry_date: u64,
    pub status: u32, // 1 = Active, 2 = Revoked
}

#[contracttype]
pub enum DataKey {
    Credential(BytesN<32>),
    Admin,
    IssuerRegistryAddr,
}

#[contract]
pub struct CredentialRegistryContract;

#[contractimpl]
impl CredentialRegistryContract {
    /// Initialize with admin and issuer registry addresses
    pub fn init(env: Env, admin: Address, issuer_registry_addr: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::IssuerRegistryAddr, &issuer_registry_addr);
    }

    /// Create a new credential commitment on-chain (Issuer must sign/call)
    pub fn create_credential(
        env: Env,
        credential_hash: BytesN<32>,
        issuer: Address,
        expiry_date: u64,
    ) {
        // Authenticate the issuer calling this function
        issuer.require_auth();

        // Check if caller is an authorized issuer via the Issuer Registry contract
        let registry_addr: Address = env.storage().instance().get(&DataKey::IssuerRegistryAddr).expect("no registry addr");
        let registry_client = IssuerRegistryClient::new(&env, &registry_addr);
        let is_auth = registry_client.is_authorized_issuer(&issuer);
        if !is_auth {
            panic!("unauthorized issuer");
        }

        // Check if already exists
        if env.storage().persistent().has(&DataKey::Credential(credential_hash.clone())) {
            panic!("credential already exists");
        }

        let credential = Credential {
            credential_hash: credential_hash.clone(),
            issuer,
            issue_date: env.ledger().timestamp(),
            expiry_date,
            status: 1, // 1 = Active
        };

        env.storage().persistent().set(&DataKey::Credential(credential_hash), &credential);
    }

    /// Update status of a credential (e.g., set to revoked)
    pub fn update_status(env: Env, credential_hash: BytesN<32>, status: u32, authorized_updater: Address) {
        authorized_updater.require_auth();

        let mut credential: Credential = env.storage().persistent()
            .get(&DataKey::Credential(credential_hash.clone()))
            .expect("credential not found");
        
        // Only the original issuer or contract admin can change status
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if authorized_updater != credential.issuer && authorized_updater != admin {
            panic!("unauthorized to update status");
        }

        credential.status = status;
        env.storage().persistent().set(&DataKey::Credential(credential_hash), &credential);
    }

    /// Verify if a credential commitment is active and not expired
    pub fn verify_credential(env: Env, credential_hash: BytesN<32>) -> bool {
        if let Some(credential) = env.storage().persistent().get::<DataKey, Credential>(&DataKey::Credential(credential_hash)) {
            let current_time = env.ledger().timestamp();
            credential.status == 1 && (credential.expiry_date == 0 || current_time < credential.expiry_date)
        } else {
            false
        }
    }

    /// Fetch details of a registered credential
    pub fn get_credential(env: Env, credential_hash: BytesN<32>) -> Credential {
        env.storage().persistent().get(&DataKey::Credential(credential_hash)).expect("credential not found")
    }
}
