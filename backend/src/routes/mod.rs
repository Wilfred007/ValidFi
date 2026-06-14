pub mod credentials;
pub mod proofs;
pub mod ai;

use axum::{
    routing::{get, post},
    Router,
};
use crate::db::Database;
use crate::services::soroban::SorobanClient;
use crate::services::ai_agent::AiAgent;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub soroban: SorobanClient,
    pub ai_agent: std::sync::Arc<AiAgent>,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Credentials
        .route("/api/credentials/prepare", post(credentials::prepare_credential))
        .route("/api/credentials", get(credentials::list_all_credentials).post(credentials::create_credential))
        .route("/api/credentials/:id", get(credentials::get_credential))
        .route("/api/credentials/patient/:address", get(credentials::list_patient_credentials))
        .route("/api/credentials/issuer/:address", get(credentials::list_issuer_credentials))
        
        // Issuers
        .route("/api/issuers", get(credentials::list_issuers).post(credentials::register_issuer))
        .route("/api/issuers/:address/pubkey", get(credentials::get_issuer_pubkey))
        
        // ZK Proofs
        .route("/api/proofs/create", post(proofs::create_proof))
        .route("/api/proofs/verify", post(proofs::verify_proof))
        
        // Revocation
        .route("/api/revoke", post(credentials::revoke_credential))
        
        // AI Chat
        .route("/api/ai/chat", post(ai::ai_chat))
        
        // History
        .route("/api/history", get(proofs::get_verification_history))
        
        // State dependency
        .with_state(state)
}
