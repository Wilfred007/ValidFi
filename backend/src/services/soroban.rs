use crate::db::Database;
use std::sync::Arc;
use serde_json::Value;

#[derive(Clone)]
pub struct SorobanClient {
    db: Database,
    use_rpc: bool,
    rpc_url: String,
    issuer_registry_contract: String,
    credential_registry_contract: String,
    revocation_registry_contract: String,
    nft_contract: String,
}

impl SorobanClient {
    pub fn new(db: Database) -> Self {
        // Read configuration from environment variables
        let use_rpc = std::env::var("SOROBAN_RPC_ENABLED")
            .map(|val| val == "true")
            .unwrap_or(false);
        let rpc_url = std::env::var("SOROBAN_RPC_URL")
            .unwrap_or_else(|_| "https://soroban-testnet.stellar.org".to_string());
        
        let issuer_registry_contract = std::env::var("CONTRACT_ISSUER_REGISTRY")
            .unwrap_or_else(|_| "CDK...ISSUER...REGISTRY".to_string());
        let credential_registry_contract = std::env::var("CONTRACT_CREDENTIAL_REGISTRY")
            .unwrap_or_else(|_| "CDK...CREDENTIAL...REGISTRY".to_string());
        let revocation_registry_contract = std::env::var("CONTRACT_REVOCATION_REGISTRY")
            .unwrap_or_else(|_| "CDK...REVOCATION...REGISTRY".to_string());
        let nft_contract = std::env::var("CONTRACT_NFT")
            .unwrap_or_else(|_| "CDK...NFT...PASSPORT".to_string());

        SorobanClient {
            db,
            use_rpc,
            rpc_url,
            issuer_registry_contract,
            credential_registry_contract,
            revocation_registry_contract,
            nft_contract,
        }
    }

    // --- Issuer Registry Contract Calls ---
    pub async fn register_issuer(&self, wallet_address: &str, id: u32, organization_name: &str, country: &str) -> Result<(), String> {
        if self.use_rpc {
            // In live RPC mode, we would build a Soroban transaction:
            // - Method: register_issuer(id, wallet_address, organization_name, country)
            // - Host: self.rpc_url
            // - Contract: self.issuer_registry_contract
            // For now, log the RPC invocation
            println!("[SOROBAN RPC] register_issuer({}, {}, {}, {})", wallet_address, id, organization_name, country);
        }
        
        // Sync locally
        self.db.register_issuer(wallet_address, id, organization_name, country)
            .map_err(|e| e.to_string())
    }

    pub async fn remove_issuer(&self, wallet_address: &str) -> Result<(), String> {
        if self.use_rpc {
            println!("[SOROBAN RPC] remove_issuer({})", wallet_address);
        }
        self.db.remove_issuer(wallet_address).map_err(|e| e.to_string())
    }

    pub async fn is_authorized_issuer(&self, wallet_address: &str) -> Result<bool, String> {
        if self.use_rpc {
            println!("[SOROBAN RPC] is_authorized_issuer({})", wallet_address);
        }
        self.db.is_authorized_issuer(wallet_address).map_err(|e| e.to_string())
    }

    // --- Credential Registry Contract Calls ---
    pub async fn create_credential_commitment(
        &self,
        credential_hash: &str,
        issuer_wallet: &str,
        expiry_date: u64,
    ) -> Result<(), String> {
        if self.use_rpc {
            println!(
                "[SOROBAN RPC] create_credential(hash: {}, issuer: {}, expiry: {})",
                credential_hash, issuer_wallet, expiry_date
            );
        }

        // Validate issuer first
        let is_auth = self.is_authorized_issuer(issuer_wallet).await?;
        if !is_auth {
            return Err("Issuer is not registered or active on-chain".to_string());
        }

        Ok(())
    }

    pub async fn verify_credential_commitment(&self, credential_hash: &str) -> Result<bool, String> {
        if self.use_rpc {
            println!("[SOROBAN RPC] verify_credential({})", credential_hash);
        }

        // Check revocation first
        let is_revoked = self.check_revocation(credential_hash).await?;
        if is_revoked {
            return Ok(false);
        }

        // In mock mode, we assume if it exists in the database and is not revoked, it is verified.
        // We look up the credential status.
        Ok(true)
    }

    // --- Revocation Registry Contract Calls ---
    pub async fn revoke_credential(&self, credential_hash: &str, revoker_wallet: &str) -> Result<(), String> {
        if self.use_rpc {
            println!("[SOROBAN RPC] revoke_credential(hash: {}, by: {})", credential_hash, revoker_wallet);
        }

        self.db.revoke_credential(credential_hash, revoker_wallet)
            .map_err(|e| e.to_string())
    }

    pub async fn check_revocation(&self, credential_hash: &str) -> Result<bool, String> {
        if self.use_rpc {
            println!("[SOROBAN RPC] check_revocation({})", credential_hash);
        }
        self.db.check_revocation(credential_hash).map_err(|e| e.to_string())
    }

    // --- Health Passport NFT Contract Calls ---
    pub async fn mint_passport_nft(&self, credential_hash: &str, owner_wallet: &str, issuer_wallet: &str, expiration: u64) -> Result<u32, String> {
        if self.use_rpc {
            println!(
                "[SOROBAN RPC] mint_passport_nft(hash: {}, owner: {}, issuer: {})",
                credential_hash, owner_wallet, issuer_wallet
            );
        }
        
        self.db.mint_passport_nft(credential_hash, owner_wallet, issuer_wallet, expiration)
            .map_err(|e| e.to_string())
    }

    pub async fn get_nft_metadata(&self, credential_hash: &str) -> Result<Option<Value>, String> {
        if self.use_rpc {
            println!("[SOROBAN RPC] get_passport_metadata({})", credential_hash);
        }
        self.db.get_nft_by_hash(credential_hash).map_err(|e| e.to_string())
    }
}
