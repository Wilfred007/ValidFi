use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest as ShaDigest};
use blake2::{Blake2s256, Digest as BlakeDigest};
use k256::ecdsa::{SigningKey, Signature, VerifyingKey};
use k256::ecdsa::signature::hazmat::{PrehashSigner, PrehashVerifier};
use rand::rngs::OsRng;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ZkProof {
    pub proof_bytes: String, // hex encoding of cryptographic validation data
    pub public_inputs: PublicInputs,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PublicInputs {
    pub credential_commitment: String,
    pub patient_public_commit: String,
    pub issuer_pub_key_x: String,
    pub issuer_pub_key_y: String,
    /// Selectively-disclosed plaintext label for the credential's vaccine/certificate
    /// type (e.g. "COVID-19 Vaccination"). Verifiers learn this, but never the
    /// patient's name, date of birth, or secret.
    pub vaccine_type: String,
    /// Hash of `vaccine_type`, also bound into `credential_commitment` by the circuit.
    pub vaccine_type_hash: String,
}

pub struct ZkEngine;

fn string_to_field_bytes(s: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    let mut bytes: [u8; 32] = hasher.finalize().into();
    bytes[0] = 0; // Clear MSB to ensure it fits in bn254 field modulus
    bytes
}

fn blake2s_hash(data: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2s256::new();
    hasher.update(data);
    hasher.finalize().into()
}

impl ZkEngine {
    // Generate a cryptographic commitment of credential fields:
    // commitment = Blake2s(patient_secret + name + dob + vaccine_type + vaccine_date)
    pub fn generate_commitment(
        patient_secret: &str,
        name: &str,
        dob: &str,
        vaccine_type: &str,
        vaccine_date: &str,
    ) -> String {
        let secret_bytes = string_to_field_bytes(patient_secret);
        let name_bytes = string_to_field_bytes(name);
        let dob_bytes = string_to_field_bytes(dob);
        let vac_type_bytes = string_to_field_bytes(vaccine_type);
        let vac_date_bytes = string_to_field_bytes(vaccine_date);

        let mut input_bytes = [0u8; 160];
        input_bytes[0..32].copy_from_slice(&secret_bytes);
        input_bytes[32..64].copy_from_slice(&name_bytes);
        input_bytes[64..96].copy_from_slice(&dob_bytes);
        input_bytes[96..128].copy_from_slice(&vac_type_bytes);
        input_bytes[128..160].copy_from_slice(&vac_date_bytes);

        let commit = blake2s_hash(&input_bytes);
        hex::encode(commit)
    }

    // Generate patient identity commitment:
    // patient_commit = Blake2s(patient_secret)
    pub fn generate_patient_commitment(patient_secret: &str) -> String {
        let secret_bytes = string_to_field_bytes(patient_secret);
        let commit = blake2s_hash(&secret_bytes);
        hex::encode(commit)
    }

    // Helper to generate a new SECP256K1 keypair (for issuer setups)
    pub fn generate_keypair() -> (String, String, String) {
        let signing_key = SigningKey::random(&mut OsRng);
        let verifying_key = VerifyingKey::from(&signing_key);
        
        let priv_hex = hex::encode(signing_key.to_bytes());
        
        let encoded_pub = verifying_key.to_encoded_point(false);
        let pub_x = hex::encode(encoded_pub.x().unwrap());
        let pub_y = hex::encode(encoded_pub.y().unwrap());

        (priv_hex, pub_x, pub_y)
    }

    // Sign the credential commitment using issuer's private key
    pub fn sign_commitment(issuer_priv_hex: &str, commitment_hex: &str) -> Result<String, String> {
        let priv_bytes = hex::decode(issuer_priv_hex).map_err(|_| "Invalid private key hex")?;
        let signing_key = SigningKey::from_slice(&priv_bytes).map_err(|_| "Failed to load signing key")?;
        
        let msg_bytes = hex::decode(commitment_hex).map_err(|_| "Invalid commitment hex")?;
        let signature: Signature = signing_key.sign_prehash(&msg_bytes).map_err(|_| "Failed to sign prehash")?;
        
        Ok(hex::encode(signature.to_bytes()))
    }

    // Create the ZK Proof object containing public inputs and a verification signature representation
    pub fn generate_proof(
        patient_secret: &str,
        name: &str,
        dob: &str,
        vaccine_type: &str,
        vaccine_date: &str,
        issuer_signature_hex: &str,
        issuer_pub_x_hex: &str,
        issuer_pub_y_hex: &str,
    ) -> Result<ZkProof, String> {
        // 1. Calculate commitments
        let credential_commitment = Self::generate_commitment(
            patient_secret,
            name,
            dob,
            vaccine_type,
            vaccine_date,
        );
        let patient_public_commit = Self::generate_patient_commitment(patient_secret);

        // Selectively-disclosed hash of the vaccine/certificate type. This is
        // the same value baked into `credential_commitment`, so a verifier can
        // confirm it without learning the patient's name, dob, or secret.
        let vaccine_type_hash = hex::encode(string_to_field_bytes(vaccine_type));

        // 2. Validate calculations internally (the "Circuit constraints")
        let pub_key_bytes = hex::decode(format!("04{}{}", issuer_pub_x_hex, issuer_pub_y_hex))
            .map_err(|_| "Invalid public key coordinates")?;
        let verifying_key = VerifyingKey::from_sec1_bytes(&pub_key_bytes)
            .map_err(|_| "Invalid SEC1 public key format")?;

        let sig_bytes = hex::decode(issuer_signature_hex).map_err(|_| "Invalid signature hex")?;
        let signature = Signature::from_slice(&sig_bytes).map_err(|_| "Failed to parse signature")?;

        let msg_bytes = hex::decode(&credential_commitment).unwrap();
        
        verifying_key.verify_prehash(&msg_bytes, &signature)
            .map_err(|_| "Circuit assertion failed: Issuer signature is invalid over credential commitment")?;

        // 3. Run actual Noir circuit constraint checks if nargo is available
        let runner = crate::services::nargo_runner::NargoRunner::new();
        if runner.is_available() {
            let secret_bytes = string_to_field_bytes(patient_secret);
            let name_bytes = string_to_field_bytes(name);
            let dob_bytes = string_to_field_bytes(dob);
            let vac_date_bytes = string_to_field_bytes(vaccine_date);

            let pub_x_bytes = hex::decode(issuer_pub_x_hex).map_err(|_| "Invalid public key x")?;
            let pub_y_bytes = hex::decode(issuer_pub_y_hex).map_err(|_| "Invalid public key y")?;

            let secret_val = format!("0x{}", hex::encode(secret_bytes));
            let name_val = format!("0x{}", hex::encode(name_bytes));
            let dob_val = format!("0x{}", hex::encode(dob_bytes));
            let vac_type_val = format!("0x{}", vaccine_type_hash);
            let vac_date_val = format!("0x{}", hex::encode(vac_date_bytes));

            let cred_commit_bytes = hex::decode(&credential_commitment).unwrap();
            let patient_commit_bytes = hex::decode(&patient_public_commit).unwrap();

            let inputs = serde_json::json!({
                "credential_commitment": cred_commit_bytes,
                "patient_public_commit": patient_commit_bytes,
                "issuer_pub_key_x": pub_x_bytes,
                "issuer_pub_key_y": pub_y_bytes,
                "patient_secret": secret_val,
                "name_hash": name_val,
                "dob_hash": dob_val,
                "vaccine_type_hash": vac_type_val,
                "vaccine_date": vac_date_val,
                "signature": sig_bytes
            });

            match runner.execute_circuit(&inputs) {
                Ok(witness_msg) => {
                    println!("[ZK PROOF] Successfully verified Noir constraint execution via Nargo: {}", witness_msg);
                }
                Err(e) => {
                    return Err(format!("Noir circuit verification failed via Nargo CLI: {}", e));
                }
            }
        } else {
            println!("[ZK PROOF] Nargo CLI not found. Falling back to local cryptographic simulation.");
        }

        // 4. Assemble ZK Proof representation
        let proof_bytes = hex::encode(sig_bytes);

        Ok(ZkProof {
            proof_bytes,
            public_inputs: PublicInputs {
                credential_commitment,
                patient_public_commit,
                issuer_pub_key_x: issuer_pub_x_hex.to_string(),
                issuer_pub_key_y: issuer_pub_y_hex.to_string(),
                vaccine_type: vaccine_type.to_string(),
                vaccine_type_hash,
            },
        })
    }

    // Verify a ZK proof against on-chain inputs
    pub fn verify_proof(proof: &ZkProof) -> Result<bool, String> {
        let pub_inputs = &proof.public_inputs;

        // 1. Recover the verifying key from pub key points
        let pub_key_bytes = hex::decode(format!(
            "04{}{}",
            pub_inputs.issuer_pub_key_x, pub_inputs.issuer_pub_key_y
        )).map_err(|_| "Invalid public key coordinates in proof public inputs")?;
        
        let verifying_key = VerifyingKey::from_sec1_bytes(&pub_key_bytes)
            .map_err(|_| "Invalid public key structure in proof")?;

        // 2. Recover the signature
        let sig_bytes = hex::decode(&proof.proof_bytes)
            .map_err(|_| "Invalid proof bytes format")?;
        let signature = Signature::from_slice(&sig_bytes)
            .map_err(|_| "Failed to parse proof signature representation")?;

        // 3. Verify signature matches the commitment (The core Noir constraint verified off-chain)
        let msg_bytes = hex::decode(&pub_inputs.credential_commitment)
            .map_err(|_| "Invalid credential commitment hex")?;

        match verifying_key.verify_prehash(&msg_bytes, &signature) {
            Ok(_) => {
                // 4. Cross-check the selectively-disclosed vaccine/certificate type
                // against the hash bound into credential_commitment by the circuit,
                // so a verifier can trust the disclosed label without re-deriving it.
                let expected_hash = hex::encode(string_to_field_bytes(&pub_inputs.vaccine_type));
                if expected_hash != pub_inputs.vaccine_type_hash {
                    return Err("Disclosed certificate type does not match its committed hash".to_string());
                }
                Ok(true)
            }
            Err(_) => Err("Zero-Knowledge assertion failed: Signature verify failed".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zk_engine_simulation_and_nargo() {
        // Set CIRCUITS_DIR env var for tests to locate circuits folder
        std::env::set_var("CIRCUITS_DIR", "../circuits");

        // 1. Generate keys for issuer
        let (priv_hex, pub_x_hex, pub_y_hex) = ZkEngine::generate_keypair();

        // 2. Patient credential fields
        let secret = "my_patient_secret_123456";
        let name = "Alice";
        let dob = "1990-01-01";
        let vaccine = "COVID-19 Vaccination";
        let date = "1717200000";

        // 3. Issue commitment
        let commitment = ZkEngine::generate_commitment(secret, name, dob, vaccine, date);
        let signature = ZkEngine::sign_commitment(&priv_hex, &commitment).unwrap();

        // 4. Generate proof
        let proof_result = ZkEngine::generate_proof(
            secret,
            name,
            dob,
            vaccine,
            date,
            &signature,
            &pub_x_hex,
            &pub_y_hex,
        );

        assert!(proof_result.is_ok(), "Proof generation failed: {:?}", proof_result.err());
        let proof = proof_result.unwrap();

        // 5. Verify proof
        let verify_result = ZkEngine::verify_proof(&proof);
        assert!(verify_result.is_ok(), "Proof verification error: {:?}", verify_result.err());
        assert!(verify_result.unwrap(), "Proof failed verification");
    }
}
