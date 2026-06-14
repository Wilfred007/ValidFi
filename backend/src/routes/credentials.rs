use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use crate::routes::AppState;
use crate::db::DecryptedCredentialData;
use crate::services::zk::ZkEngine;

#[derive(Deserialize)]
pub struct PrepareCredentialRequest {
    pub name: String,
    pub dob: String,
    pub vaccine_type: String,
    pub vaccine_date: String,
    pub patient_secret: String,
    pub issuer: String,
}

#[derive(Serialize)]
pub struct PrepareCredentialResponse {
    pub credential_hash: String,
    pub patient_public_commit: String,
    pub issuer_signature: String,
}

// Step 1 of issuance: compute the ZK commitment and have the server-held
// issuer key sign it. This is pure off-chain crypto and happens *before*
// the on-chain create_credential / mint_passport transactions are signed
// by the issuer's Freighter wallet.
pub async fn prepare_credential(
    State(state): State<AppState>,
    Json(payload): Json<PrepareCredentialRequest>,
) -> Result<Json<PrepareCredentialResponse>, (StatusCode, String)> {
    let credential_hash = ZkEngine::generate_commitment(
        &payload.patient_secret,
        &payload.name,
        &payload.dob,
        &payload.vaccine_type,
        &payload.vaccine_date,
    );

    let patient_public_commit = ZkEngine::generate_patient_commitment(&payload.patient_secret);

    // Get or create a persistent SECP256K1 keypair for this issuer wallet address.
    // The private key is AES-256 encrypted at rest in validfi.db.
    let (issuer_priv, _, _) = state.db
        .get_or_create_issuer_keypair(&payload.issuer)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let issuer_signature = ZkEngine::sign_commitment(&issuer_priv, &credential_hash)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(PrepareCredentialResponse {
        credential_hash,
        patient_public_commit,
        issuer_signature,
    }))
}

#[derive(Deserialize)]
pub struct CreateCredentialRequest {
    pub id: String,
    pub name: String,
    pub dob: String,
    pub vaccine_type: String,
    pub vaccine_date: String,
    pub patient_secret: String,
    pub patient_address: String,
    pub issuer: String,
    pub expiry_date: u64,
    pub credential_hash: String,
    pub patient_public_commit: String,
    pub issuer_signature: String,
    pub passport_id: u32,
}

#[derive(Serialize)]
pub struct CreateCredentialResponse {
    pub credential_id: String,
    pub credential_hash: String,
    pub patient_public_commit: String,
    pub issuer_signature: String,
    pub passport_id: u32,
}

// Step 2 of issuance ("finalize"): the on-chain create_credential and
// mint_passport transactions have already been signed and confirmed by the
// issuer's Freighter wallet. Persist the encrypted PII record and the
// chain-returned passport_id.
pub async fn create_credential(
    State(state): State<AppState>,
    Json(payload): Json<CreateCredentialRequest>,
) -> Result<Json<CreateCredentialResponse>, (StatusCode, String)> {
    let dec_data = DecryptedCredentialData {
        name: payload.name,
        dob: payload.dob,
        vaccine_type: payload.vaccine_type,
        vaccine_date: payload.vaccine_date,
        patient_secret: payload.patient_secret,
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    state.db
        .insert_credential(
            &payload.id,
            &payload.credential_hash,
            &payload.issuer,
            &payload.patient_address,
            &dec_data,
            now,
            payload.expiry_date,
            &payload.issuer_signature,
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    state.db
        .record_nft(payload.passport_id, &payload.credential_hash, &payload.patient_address, &payload.issuer, payload.expiry_date)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(CreateCredentialResponse {
        credential_id: payload.id,
        credential_hash: payload.credential_hash,
        patient_public_commit: payload.patient_public_commit,
        issuer_signature: payload.issuer_signature,
        passport_id: payload.passport_id,
    }))
}

pub async fn get_credential(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    match state.db.get_credential(&id) {
        Ok(Some(cred)) => Ok(Json(cred)),
        Ok(None) => Err((StatusCode::NOT_FOUND, "Credential not found".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn list_patient_credentials(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, String)> {
    state.db
        .list_credentials_by_patient(&address)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn list_issuer_credentials(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, String)> {
    state.db
        .list_credentials_by_issuer(&address)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn list_all_credentials(
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, String)> {
    state.db
        .list_all_credentials()
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// --- Issuers API ---

#[derive(Deserialize)]
pub struct RegisterIssuerRequest {
    pub wallet_address: String,
    pub id: u32,
    pub organization_name: String,
    pub country: String,
}

pub async fn register_issuer(
    State(state): State<AppState>,
    Json(payload): Json<RegisterIssuerRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    state.soroban
        .register_issuer(
            &payload.wallet_address,
            payload.id,
            &payload.organization_name,
            &payload.country,
        )
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    Ok(Json(serde_json::json!({ "status": "success", "message": "Issuer registered successfully" })))
}

pub async fn list_issuers(
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, String)> {
    state.db
        .list_issuers()
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// --- Revocation API ---

#[derive(Deserialize)]
pub struct RevokeRequest {
    pub credential_hash: String,
    pub authority_address: String,
}

pub async fn revoke_credential(
    State(state): State<AppState>,
    Json(payload): Json<RevokeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    state.soroban
        .revoke_credential(&payload.credential_hash, &payload.authority_address)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "Credential commitment revoked successfully on-chain"
    })))
}

// --- Issuer Public Key API ---

pub async fn get_issuer_pubkey(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    // Get or create a persistent keypair for this issuer address
    let (_priv, pub_x, pub_y) = state.db
        .get_or_create_issuer_keypair(&address)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "wallet_address": address,
        "pub_key_x": pub_x,
        "pub_key_y": pub_y
    })))
}
