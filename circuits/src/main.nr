use std::ecdsa_secp256k1::verify_signature;

/// ZK Health Passport Circuit using Blake2s
///
/// Public Inputs (known to verifier):
///   - credential_commitment : 32-byte Blake2s hash of patient's credential data, signed by the issuer
///   - patient_public_commit : 32-byte Blake2s hash of the patient's secret (proves ownership)
///   - issuer_pub_key_x/y   : SECP256K1 public key of the issuing healthcare authority
///   - vaccine_type_hash    : Selectively-disclosed hash of the vaccine/certificate type
///
/// Private Inputs (known only to the patient):
///   - patient_secret       : The patient's private secret/salt
///   - name_hash            : Blake2s hash of the patient's name
///   - dob_hash             : Blake2s hash of the patient's date of birth
///   - vaccine_date         : Blake2s hash / timestamp of the vaccination date
///   - signature            : ECDSA signature from the issuer over credential_commitment
///
/// Constraints proved:
///   1. patient_public_commit  == blake2s(patient_secret)
///   2. credential_commitment  == blake2s(patient_secret + name_hash + dob_hash + vaccine_type_hash + vaccine_date)
///   3. issuer_signature is valid over credential_commitment under (issuer_pub_key_x, issuer_pub_key_y)
///
/// Because vaccine_type_hash is public, the verifier learns *which* health
/// status this credential attests to (e.g. "COVID-19 Vaccination") while the
/// patient's name, date of birth, and secret remain hidden.

fn main(
    // --- Public Inputs ---
    credential_commitment: pub [u8; 32],
    patient_public_commit: pub [u8; 32],
    issuer_pub_key_x: pub [u8; 32],
    issuer_pub_key_y: pub [u8; 32],
    vaccine_type_hash: pub Field,

    // --- Private Inputs ---
    patient_secret: Field,
    name_hash: Field,
    dob_hash: Field,
    vaccine_date: Field,
    signature: [u8; 64]
) {
    // Constraint 1: Prove patient knows their secret (identity commitment)
    let secret_bytes = patient_secret.to_be_bytes::<32>();
    let computed_patient_commit = std::hash::blake2s(secret_bytes);
    assert(patient_public_commit == computed_patient_commit,
        "Identity check failed: patient_public_commit does not match hash(patient_secret)");

    // Constraint 2: Prove the credential commitment encodes the correct fields
    let name_bytes = name_hash.to_be_bytes::<32>();
    let dob_bytes = dob_hash.to_be_bytes::<32>();
    let vac_type_bytes = vaccine_type_hash.to_be_bytes::<32>();
    let vac_date_bytes = vaccine_date.to_be_bytes::<32>();

    // Concatenate all fields into a single array
    let mut input_bytes: [u8; 160] = [0; 160];
    for i in 0..32 {
        input_bytes[i] = secret_bytes[i];
        input_bytes[i + 32] = name_bytes[i];
        input_bytes[i + 64] = dob_bytes[i];
        input_bytes[i + 96] = vac_type_bytes[i];
        input_bytes[i + 128] = vac_date_bytes[i];
    }

    let computed_cred_commit = std::hash::blake2s(input_bytes);
    assert(credential_commitment == computed_cred_commit,
        "Commitment check failed: credential_commitment does not match hash of private inputs");

    // Constraint 3: Prove the issuer signed this exact commitment
    let is_valid = verify_signature(
        issuer_pub_key_x,
        issuer_pub_key_y,
        signature,
        credential_commitment
    );
    assert(is_valid, "Signature check failed: issuer ECDSA signature is not valid over credential_commitment");
}

// --- Test Suite ---
#[test]
fn test_circuit_with_known_values() {
    let patient_secret: Field = 12345678901234567890;
    let name_hash: Field     = 11111111111111111111;
    let dob_hash: Field      = 22222222222222222222;
    let vaccine_type_hash: Field = 33333333333333333333;
    let vaccine_date: Field  = 1717200000; // Unix timestamp

    let secret_bytes = patient_secret.to_be_bytes::<32>();
    let patient_public_commit = std::hash::blake2s(secret_bytes);

    let name_bytes = name_hash.to_be_bytes::<32>();
    let dob_bytes = dob_hash.to_be_bytes::<32>();
    let vac_type_bytes = vaccine_type_hash.to_be_bytes::<32>();
    let vac_date_bytes = vaccine_date.to_be_bytes::<32>();

    let mut input_bytes: [u8; 160] = [0; 160];
    for i in 0..32 {
        input_bytes[i] = secret_bytes[i];
        input_bytes[i + 32] = name_bytes[i];
        input_bytes[i + 64] = dob_bytes[i];
        input_bytes[i + 96] = vac_type_bytes[i];
        input_bytes[i + 128] = vac_date_bytes[i];
    }
    let credential_commitment = std::hash::blake2s(input_bytes);

    std::println(f"patient_public_commit = {patient_public_commit}");
    std::println(f"credential_commitment = {credential_commitment}");
}
