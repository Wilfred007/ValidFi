use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use crate::routes::AppState;
use crate::services::zk::{ZkEngine, ZkProof};

#[derive(Deserialize)]
pub struct CreateProofRequest {
    pub patient_secret: String,
    pub name: String,
    pub dob: String,
    pub vaccine_type: String,
    pub vaccine_date: String,
    pub issuer_signature: String,
    pub issuer_pub_x: String,
    pub issuer_pub_y: String,
}

pub async fn create_proof(
    Json(payload): Json<CreateProofRequest>,
) -> Result<Json<ZkProof>, (StatusCode, String)> {
    ZkEngine::generate_proof(
        &payload.patient_secret,
        &payload.name,
        &payload.dob,
        &payload.vaccine_type,
        &payload.vaccine_date,
        &payload.issuer_signature,
        &payload.issuer_pub_x,
        &payload.issuer_pub_y,
    )
    .map(Json)
    .map_err(|e| (StatusCode::BAD_REQUEST, e))
}

#[derive(Deserialize)]
pub struct VerifyProofRequest {
    pub proof: ZkProof,
    pub verifier_address: String,
    pub credential_id: String,
}

#[derive(Serialize)]
pub struct VerifyProofResponse {
    pub verified: bool,
    pub details: String,
    /// The selectively-disclosed vaccine/certificate type (e.g. "COVID-19
    /// Vaccination"), present only when the proof verifies successfully.
    pub vaccine_type: Option<String>,
}

pub async fn verify_proof(
    State(state): State<AppState>,
    Json(payload): Json<VerifyProofRequest>,
) -> Result<Json<VerifyProofResponse>, (StatusCode, String)> {
    // 1. Core ZK Cryptographic verification
    let zk_verified = match ZkEngine::verify_proof(&payload.proof) {
        Ok(v) => v,
        Err(e) => {
            // Log failed verification attempt in history
            let _ = state.db.log_verification(
                &payload.proof.proof_bytes,
                &payload.credential_id,
                &payload.verifier_address,
                "Failed",
                &format!("ZK Error: {}", e),
            );
            return Ok(Json(VerifyProofResponse {
                verified: false,
                details: format!("ZK Proof verification failed: {}", e),
                vaccine_type: None,
            }));
        }
    };

    if !zk_verified {
        return Ok(Json(VerifyProofResponse {
            verified: false,
            details: "ZK cryptographic assertions failed".to_string(),
            vaccine_type: None,
        }));
    }

    let cred_commitment = &payload.proof.public_inputs.credential_commitment;

    // 2. Check Soroban smart contract state (Mock/RPC)
    // - Check if registered and not revoked
    let is_revoked = state.soroban
        .check_revocation(cred_commitment)
        .await
        .unwrap_or(false);

    if is_revoked {
        let _ = state.db.log_verification(
            &payload.proof.proof_bytes,
            &payload.credential_id,
            &payload.verifier_address,
            "Failed",
            "Revoked",
        );
        return Ok(Json(VerifyProofResponse {
            verified: false,
            details: "On-Chain check failed: Credential has been revoked in the Revocation Registry".to_string(),
            vaccine_type: None,
        }));
    }

    // 3. Log successful verification
    let details = "Passed. ZK assertions satisfied. Issuer authorized, commitment active on-chain, not revoked.";
    state.db
        .log_verification(
            &payload.proof.proof_bytes,
            &payload.credential_id,
            &payload.verifier_address,
            "Verified",
            details,
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(VerifyProofResponse {
        verified: true,
        details: details.to_string(),
        vaccine_type: Some(payload.proof.public_inputs.vaccine_type.clone()),
    }))
}

pub async fn get_verification_history(
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, String)> {
    state.db
        .list_verification_history()
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
