use std::sync::{Arc, Mutex};
use rusqlite::{params, Connection, Result};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
    master_key: [u8; 32],
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DecryptedCredentialData {
    pub name: String,
    pub dob: String,
    pub vaccine_type: String,
    pub vaccine_date: String,
    pub patient_secret: String,
}

impl Database {
    pub fn new(db_path: &str, master_key_hex: &str) -> Self {
        let conn = Connection::open(db_path).expect("Failed to open SQLite database");
        
        // Convert master key from hex string to [u8; 32]
        let mut master_key = [0u8; 32];
        let decoded = hex::decode(master_key_hex).unwrap_or_else(|_| {
            // Fallback development key
            vec![7u8; 32]
        });
        let len = decoded.len().min(32);
        master_key[..len].copy_from_slice(&decoded[..len]);

        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
            master_key,
        };

        db.initialize_tables().expect("Failed to initialize database tables");
        db
    }

    fn initialize_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // 1. Issuers registry table (simulating on-chain and local sync)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS issuers (
                wallet_address TEXT PRIMARY KEY,
                id INTEGER NOT NULL,
                organization_name TEXT NOT NULL,
                country TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            )",
            [],
        )?;

        // 2. Credentials table (with AES-encrypted medical data)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS credentials (
                id TEXT PRIMARY KEY,
                credential_hash TEXT NOT NULL UNIQUE,
                issuer TEXT NOT NULL,
                patient_address TEXT NOT NULL,
                encrypted_data BLOB NOT NULL,
                nonce BLOB NOT NULL,
                issue_date INTEGER NOT NULL,
                expiry_date INTEGER NOT NULL,
                status INTEGER NOT NULL DEFAULT 1,
                issuer_signature TEXT NOT NULL DEFAULT ''
            )",
            [],
        )?;

        // Migration: add issuer_signature to credentials tables created before this column existed
        let _ = conn.execute(
            "ALTER TABLE credentials ADD COLUMN issuer_signature TEXT NOT NULL DEFAULT ''",
            [],
        );

        // 3. Revocations table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS revocations (
                credential_hash TEXT PRIMARY KEY,
                revoked_by TEXT NOT NULL,
                revocation_time INTEGER NOT NULL
            )",
            [],
        )?;

        // 4. Passport NFTs
        conn.execute(
            "CREATE TABLE IF NOT EXISTS nfts (
                passport_id INTEGER PRIMARY KEY AUTOINCREMENT,
                credential_hash TEXT NOT NULL UNIQUE,
                owner TEXT NOT NULL,
                issuer TEXT NOT NULL,
                expiration INTEGER NOT NULL
            )",
            [],
        )?;

        // 5. Verification logs (history of scans)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS verification_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proof_hash TEXT NOT NULL,
                credential_id TEXT NOT NULL,
                verifier_address TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                status TEXT NOT NULL,
                details TEXT NOT NULL
            )",
            [],
        )?;

        // 6. Issuer keypairs — maps wallet address to a deterministic SECP256K1 signing key
        //    The private key is AES-256 encrypted at rest.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS issuer_keypairs (
                wallet_address TEXT PRIMARY KEY,
                encrypted_priv_key BLOB NOT NULL,
                nonce BLOB NOT NULL,
                pub_key_x TEXT NOT NULL,
                pub_key_y TEXT NOT NULL
            )",
            [],
        )?;

        Ok(())
    }

    // AES-256-GCM Encryption Helper
    pub fn encrypt(&self, plaintext: &str) -> (Vec<u8>, Vec<u8>) {
        let key = Key::<Aes256Gcm>::from_slice(&self.master_key);
        let cipher = Aes256Gcm::new(key);
        
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .expect("Failed to encrypt data");

        (ciphertext, nonce_bytes.to_vec())
    }

    // AES-256-GCM Decryption Helper
    pub fn decrypt(&self, ciphertext: &[u8], nonce_bytes: &[u8]) -> String {
        let key = Key::<Aes256Gcm>::from_slice(&self.master_key);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext_bytes = cipher
            .decrypt(nonce, ciphertext)
            .expect("Failed to decrypt data");

        String::from_utf8(plaintext_bytes).expect("Decrypted data is not valid UTF-8")
    }

    // --- Issuer DB Operations ---
    pub fn register_issuer(&self, address: &str, id: u32, name: &str, country: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO issuers (wallet_address, id, organization_name, country, is_active)
             VALUES (?1, ?2, ?3, ?4, 1)",
            params![address, id, name, country],
        )?;
        Ok(())
    }

    pub fn remove_issuer(&self, address: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE issuers SET is_active = 0 WHERE wallet_address = ?",
            params![address],
        )?;
        Ok(())
    }

    pub fn is_authorized_issuer(&self, address: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT is_active FROM issuers WHERE wallet_address = ?")?;
        let mut rows = stmt.query(params![address])?;
        if let Some(row) = rows.next()? {
            let active: i32 = row.get(0)?;
            Ok(active == 1)
        } else {
            Ok(false)
        }
    }

    pub fn list_issuers(&self) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT wallet_address, id, organization_name, country, is_active FROM issuers")?;
        let rows = stmt.query_map([], |row| {
            let address: String = row.get(0)?;
            let id: u32 = row.get(1)?;
            let name: String = row.get(2)?;
            let country: String = row.get(3)?;
            let is_active: i32 = row.get(4)?;
            Ok(serde_json::json!({
                "wallet_address": address,
                "id": id,
                "organization_name": name,
                "country": country,
                "is_active": is_active == 1
            }))
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // --- Credential DB Operations ---
    pub fn insert_credential(
        &self,
        id: &str,
        hash: &str,
        issuer: &str,
        patient: &str,
        data: &DecryptedCredentialData,
        issue_date: u64,
        expiry_date: u64,
        issuer_signature: &str,
    ) -> Result<()> {
        let serialized_data = serde_json::to_string(data).unwrap();
        let (encrypted, nonce) = self.encrypt(&serialized_data);

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO credentials (id, credential_hash, issuer, patient_address, encrypted_data, nonce, issue_date, expiry_date, status, issuer_signature)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)",
            params![id, hash, issuer, patient, encrypted, nonce, issue_date as i64, expiry_date as i64, issuer_signature],
        )?;
        Ok(())
    }

    pub fn get_credential(&self, id: &str) -> Result<Option<serde_json::Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT c.id, c.credential_hash, c.issuer, c.patient_address, c.encrypted_data, c.nonce, c.issue_date, c.expiry_date, c.status, c.issuer_signature, n.passport_id
             FROM credentials c LEFT JOIN nfts n ON n.credential_hash = c.credential_hash
             WHERE c.id = ?"
        )?;
        let mut rows = stmt.query(params![id])?;

        if let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            let hash: String = row.get(1)?;
            let issuer: String = row.get(2)?;
            let patient: String = row.get(3)?;
            let encrypted_data: Vec<u8> = row.get(4)?;
            let nonce: Vec<u8> = row.get(5)?;
            let issue_date: i64 = row.get(6)?;
            let expiry_date: i64 = row.get(7)?;
            let status: i32 = row.get(8)?;
            let issuer_signature: String = row.get(9)?;
            let passport_id: Option<u32> = row.get(10)?;

            let decrypted_str = self.decrypt(&encrypted_data, &nonce);
            let decrypted_data: DecryptedCredentialData = serde_json::from_str(&decrypted_str).unwrap();

            Ok(Some(serde_json::json!({
                "id": id,
                "credential_hash": hash,
                "issuer": issuer,
                "patient_address": patient,
                "name": decrypted_data.name,
                "dob": decrypted_data.dob,
                "vaccine_type": decrypted_data.vaccine_type,
                "vaccine_date": decrypted_data.vaccine_date,
                "patient_secret": decrypted_data.patient_secret,
                "issue_date": issue_date,
                "expiry_date": expiry_date,
                "status": if status == 1 { "Active" } else { "Revoked" },
                "issuer_signature": issuer_signature,
                "passport_id": passport_id
            })))
        } else {
            Ok(None)
        }
    }

    pub fn list_credentials_by_patient(&self, patient: &str) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT c.id, c.credential_hash, c.issuer, c.patient_address, c.encrypted_data, c.nonce, c.issue_date, c.expiry_date, c.status, c.issuer_signature, n.passport_id
             FROM credentials c LEFT JOIN nfts n ON n.credential_hash = c.credential_hash
             WHERE c.patient_address = ?"
        )?;
        let rows = stmt.query_map(params![patient], |row| {
            let id: String = row.get(0)?;
            let hash: String = row.get(1)?;
            let issuer: String = row.get(2)?;
            let patient: String = row.get(3)?;
            let encrypted_data: Vec<u8> = row.get(4)?;
            let nonce: Vec<u8> = row.get(5)?;
            let issue_date: i64 = row.get(6)?;
            let expiry_date: i64 = row.get(7)?;
            let status: i32 = row.get(8)?;
            let issuer_signature: String = row.get(9)?;
            let passport_id: Option<u32> = row.get(10)?;

            let decrypted_str = self.decrypt(&encrypted_data, &nonce);
            let decrypted_data: DecryptedCredentialData = serde_json::from_str(&decrypted_str).unwrap();

            Ok(serde_json::json!({
                "id": id,
                "credential_hash": hash,
                "issuer": issuer,
                "patient_address": patient,
                "name": decrypted_data.name,
                "dob": decrypted_data.dob,
                "vaccine_type": decrypted_data.vaccine_type,
                "vaccine_date": decrypted_data.vaccine_date,
                "patient_secret": decrypted_data.patient_secret,
                "issue_date": issue_date,
                "expiry_date": expiry_date,
                "status": if status == 1 { "Active" } else { "Revoked" },
                "issuer_signature": issuer_signature,
                "passport_id": passport_id
            }))
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn list_credentials_by_issuer(&self, issuer: &str) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT c.id, c.credential_hash, c.issuer, c.patient_address, c.encrypted_data, c.nonce, c.issue_date, c.expiry_date, c.status, c.issuer_signature, n.passport_id
             FROM credentials c LEFT JOIN nfts n ON n.credential_hash = c.credential_hash
             WHERE c.issuer = ?"
        )?;
        let rows = stmt.query_map(params![issuer], |row| {
            let id: String = row.get(0)?;
            let hash: String = row.get(1)?;
            let issuer: String = row.get(2)?;
            let patient: String = row.get(3)?;
            let encrypted_data: Vec<u8> = row.get(4)?;
            let nonce: Vec<u8> = row.get(5)?;
            let issue_date: i64 = row.get(6)?;
            let expiry_date: i64 = row.get(7)?;
            let status: i32 = row.get(8)?;
            let issuer_signature: String = row.get(9)?;
            let passport_id: Option<u32> = row.get(10)?;

            let decrypted_str = self.decrypt(&encrypted_data, &nonce);
            let decrypted_data: DecryptedCredentialData = serde_json::from_str(&decrypted_str).unwrap();

            Ok(serde_json::json!({
                "id": id,
                "credential_hash": hash,
                "issuer": issuer,
                "patient_address": patient,
                "name": decrypted_data.name,
                "dob": decrypted_data.dob,
                "vaccine_type": decrypted_data.vaccine_type,
                "vaccine_date": decrypted_data.vaccine_date,
                "patient_secret": decrypted_data.patient_secret,
                "issue_date": issue_date,
                "expiry_date": expiry_date,
                "status": if status == 1 { "Active" } else { "Revoked" },
                "issuer_signature": issuer_signature,
                "passport_id": passport_id
            }))
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn list_all_credentials(&self) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT c.id, c.credential_hash, c.issuer, c.patient_address, c.encrypted_data, c.nonce, c.issue_date, c.expiry_date, c.status, c.issuer_signature, n.passport_id
             FROM credentials c LEFT JOIN nfts n ON n.credential_hash = c.credential_hash
             ORDER BY c.issue_date DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let hash: String = row.get(1)?;
            let issuer: String = row.get(2)?;
            let patient: String = row.get(3)?;
            let encrypted_data: Vec<u8> = row.get(4)?;
            let nonce: Vec<u8> = row.get(5)?;
            let issue_date: i64 = row.get(6)?;
            let expiry_date: i64 = row.get(7)?;
            let status: i32 = row.get(8)?;
            let issuer_signature: String = row.get(9)?;
            let passport_id: Option<u32> = row.get(10)?;

            let decrypted_str = self.decrypt(&encrypted_data, &nonce);
            let decrypted_data: DecryptedCredentialData = serde_json::from_str(&decrypted_str).unwrap();

            Ok(serde_json::json!({
                "id": id,
                "credential_hash": hash,
                "issuer": issuer,
                "patient_address": patient,
                "name": decrypted_data.name,
                "dob": decrypted_data.dob,
                "vaccine_type": decrypted_data.vaccine_type,
                "vaccine_date": decrypted_data.vaccine_date,
                "patient_secret": decrypted_data.patient_secret,
                "issue_date": issue_date,
                "expiry_date": expiry_date,
                "status": if status == 1 { "Active" } else { "Revoked" },
                "issuer_signature": issuer_signature,
                "passport_id": passport_id
            }))
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // --- Revocation DB Operations ---
    pub fn revoke_credential(&self, hash: &str, revoked_by: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        conn.execute(
            "INSERT OR REPLACE INTO revocations (credential_hash, revoked_by, revocation_time) VALUES (?, ?, ?)",
            params![hash, revoked_by, now],
        )?;

        conn.execute(
            "UPDATE credentials SET status = 2 WHERE credential_hash = ?",
            params![hash],
        )?;
        Ok(())
    }

    pub fn check_revocation(&self, hash: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT 1 FROM revocations WHERE credential_hash = ?")?;
        let mut rows = stmt.query(params![hash])?;
        Ok(rows.next()?.is_some())
    }

    // --- NFT DB Operations ---
    pub fn mint_passport_nft(&self, hash: &str, owner: &str, issuer: &str, expiration: u64) -> Result<u32> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO nfts (credential_hash, owner, issuer, expiration) VALUES (?, ?, ?, ?)",
            params![hash, owner, issuer, expiration as i64],
        )?;
        let last_id = conn.last_insert_rowid() as u32;
        Ok(last_id)
    }

    // Record an NFT with an explicit passport_id (from an on-chain mint result)
    pub fn record_nft(&self, passport_id: u32, hash: &str, owner: &str, issuer: &str, expiration: u64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO nfts (passport_id, credential_hash, owner, issuer, expiration) VALUES (?, ?, ?, ?, ?)",
            params![passport_id, hash, owner, issuer, expiration as i64],
        )?;
        Ok(())
    }

    pub fn get_nft_by_hash(&self, hash: &str) -> Result<Option<serde_json::Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT passport_id, credential_hash, owner, issuer, expiration FROM nfts WHERE credential_hash = ?")?;
        let mut rows = stmt.query(params![hash])?;
        if let Some(row) = rows.next()? {
            let passport_id: u32 = row.get(0)?;
            let credential_hash: String = row.get(1)?;
            let owner: String = row.get(2)?;
            let issuer: String = row.get(3)?;
            let expiration: i64 = row.get(4)?;
            Ok(Some(serde_json::json!({
                "passport_id": passport_id,
                "credential_hash": credential_hash,
                "owner": owner,
                "issuer": issuer,
                "expiration": expiration
            })))
        } else {
            Ok(None)
        }
    }

    // --- Verification History Operations ---
    pub fn log_verification(
        &self,
        proof_hash: &str,
        credential_id: &str,
        verifier: &str,
        status: &str,
        details: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        conn.execute(
            "INSERT INTO verification_history (proof_hash, credential_id, verifier_address, timestamp, status, details)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![proof_hash, credential_id, verifier, now, status, details],
        )?;
        Ok(())
    }

    pub fn list_verification_history(&self) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, proof_hash, credential_id, verifier_address, timestamp, status, details FROM verification_history ORDER BY timestamp DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            let id: u32 = row.get(0)?;
            let proof_hash: String = row.get(1)?;
            let credential_id: String = row.get(2)?;
            let verifier: String = row.get(3)?;
            let timestamp: i64 = row.get(4)?;
            let status: String = row.get(5)?;
            let details: String = row.get(6)?;

            Ok(serde_json::json!({
                "id": id,
                "proof_hash": proof_hash,
                "credential_id": credential_id,
                "verifier_address": verifier,
                "timestamp": timestamp,
                "status": status,
                "details": details
            }))
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // --- Issuer Keypair Operations ---
    // Get an existing keypair or create and store a new one for the given wallet address.
    // The private key is AES-256-GCM encrypted at rest.
    pub fn get_or_create_issuer_keypair(&self, wallet_address: &str) -> Result<(String, String, String)> {
        // Check if keypair already exists
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT encrypted_priv_key, nonce, pub_key_x, pub_key_y FROM issuer_keypairs WHERE wallet_address = ?"
        )?;
        let mut rows = stmt.query(params![wallet_address])?;

        if let Some(row) = rows.next()? {
            let encrypted_priv: Vec<u8> = row.get(0)?;
            let nonce: Vec<u8> = row.get(1)?;
            let pub_x: String = row.get(2)?;
            let pub_y: String = row.get(3)?;

            drop(rows);
            drop(stmt);
            drop(conn);

            let priv_hex = self.decrypt(&encrypted_priv, &nonce);
            return Ok((priv_hex, pub_x, pub_y));
        }

        drop(rows);
        drop(stmt);
        drop(conn);

        // Generate a fresh SECP256K1 keypair
        use k256::ecdsa::SigningKey;
        use rand::rngs::OsRng;
        let signing_key = SigningKey::random(&mut OsRng);
        let verifying_key = k256::ecdsa::VerifyingKey::from(&signing_key);

        let priv_hex = hex::encode(signing_key.to_bytes());
        let encoded_pub = verifying_key.to_encoded_point(false);
        let pub_x = hex::encode(encoded_pub.x().unwrap());
        let pub_y = hex::encode(encoded_pub.y().unwrap());

        // Encrypt and store
        let (encrypted_priv, nonce_bytes) = self.encrypt(&priv_hex);

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO issuer_keypairs (wallet_address, encrypted_priv_key, nonce, pub_key_x, pub_key_y)
             VALUES (?, ?, ?, ?, ?)",
            params![wallet_address, encrypted_priv, nonce_bytes, pub_x, pub_y],
        )?;

        Ok((priv_hex, pub_x, pub_y))
    }

    pub fn get_issuer_pubkey(&self, wallet_address: &str) -> Result<Option<(String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT pub_key_x, pub_key_y FROM issuer_keypairs WHERE wallet_address = ?"
        )?;
        let mut rows = stmt.query(params![wallet_address])?;
        if let Some(row) = rows.next()? {
            let pub_x: String = row.get(0)?;
            let pub_y: String = row.get(1)?;
            Ok(Some((pub_x, pub_y)))
        } else {
            Ok(None)
        }
    }
}
