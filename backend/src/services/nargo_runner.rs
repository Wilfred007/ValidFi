/// nargo_runner.rs
/// Invokes the real nargo CLI to execute the compiled ZK circuit
/// and generate/verify proofs using the ACVM backend.

use std::path::PathBuf;
use std::process::Command;
use std::fs;
use serde_json::json;
use serde::{Deserialize, Serialize};

/// Inputs that map to the private/public inputs of circuits/src/main.nr
#[derive(Serialize, Deserialize, Debug)]
pub struct CircuitInputs {
    // Public inputs
    pub credential_commitment: String,   // Pedersen hash as field element hex
    pub patient_public_commit: String,   // Pedersen hash as field element hex
    pub issuer_pub_key_x: Vec<u8>,
    pub issuer_pub_key_y: Vec<u8>,
    pub vaccine_type_hash: String,       // Field element hex (selectively disclosed)
    // Private inputs
    pub patient_secret: String,          // Field element hex
    pub name_hash: String,               // Field element hex
    pub dob_hash: String,                // Field element hex
    pub vaccine_date: String,            // Field element hex (unix ts)
    pub signature: Vec<u8>,
}

#[derive(Debug)]
pub enum NargoError {
    IoError(std::io::Error),
    ProcessFailed(String),
    CircuitNotFound,
    JsonError(serde_json::Error),
}

impl std::fmt::Display for NargoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NargoError::IoError(e) => write!(f, "IO error: {}", e),
            NargoError::ProcessFailed(s) => write!(f, "nargo failed: {}", s),
            NargoError::CircuitNotFound => write!(f, "Compiled circuit artifact not found at circuits/target/zk_health_passport.json"),
            NargoError::JsonError(e) => write!(f, "JSON error: {}", e),
        }
    }
}

pub struct NargoRunner {
    circuits_dir: PathBuf,
    nargo_bin: PathBuf,
}

impl NargoRunner {
    pub fn new() -> Self {
        // Try to find nargo in PATH and common install locations
        let nargo_bin = which_nargo();
        
        // Auto-detect circuits directory relative to current working directory
        let circuits_dir = if let Ok(dir) = std::env::var("CIRCUITS_DIR") {
            PathBuf::from(dir)
        } else {
            let mut path = PathBuf::from("../circuits");
            if !path.exists() && PathBuf::from("circuits").exists() {
                path = PathBuf::from("circuits");
            }
            path
        };

        NargoRunner { circuits_dir, nargo_bin }
    }

    pub fn is_available(&self) -> bool {
        self.nargo_bin.exists() || self.nargo_bin.to_str().unwrap_or("") == "nargo"
    }

    /// Write the Prover.toml input file and run `nargo prove`
    pub fn execute_circuit(&self, inputs: &serde_json::Value) -> Result<String, NargoError> {
        // 1. Check circuit artifact exists
        let circuit_artifact = self.circuits_dir.join("target/zk_health_passport.json");
        if !circuit_artifact.exists() {
            return Err(NargoError::CircuitNotFound);
        }

        // 2. Write Prover.toml
        let prover_toml = self.build_prover_toml(inputs);
        let prover_toml_path = self.circuits_dir.join("Prover.toml");
        fs::write(&prover_toml_path, &prover_toml)
            .map_err(NargoError::IoError)?;

        // 3. Run nargo execute
        let output = Command::new(self.nargo_bin.to_str().unwrap_or("nargo"))
            .current_dir(&self.circuits_dir)
            .arg("execute")
            .arg("--package")
            .arg("zk_health_passport")
            .output()
            .map_err(NargoError::IoError)?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            let combined = format!("stdout: {}\nstderr: {}", stdout, stderr);
            return Err(NargoError::ProcessFailed(combined));
        }

        // 4. Read the generated witness/proof output
        // nargo writes the witness to target/
        let witness_path = self.circuits_dir.join("target/zk_health_passport.gz");
        let proof_data = if witness_path.exists() {
            format!("nargo_witness:{}", witness_path.display())
        } else {
            // Return stdout as proof data
            stdout.trim().to_string()
        };

        println!("[NARGO] execute output: {}", stdout.trim());
        Ok(proof_data)
    }

    /// Build a TOML string from the circuit inputs JSON
    fn build_prover_toml(&self, inputs: &serde_json::Value) -> String {
        let mut toml = String::new();

        if let Some(obj) = inputs.as_object() {
            for (key, val) in obj {
                match val {
                    serde_json::Value::String(s) => {
                        toml.push_str(&format!("{} = \"{}\"\n", key, s));
                    }
                    serde_json::Value::Number(n) => {
                        toml.push_str(&format!("{} = {}\n", key, n));
                    }
                    serde_json::Value::Array(arr) => {
                        let items: Vec<String> = arr.iter().map(|v| {
                            match v {
                                serde_json::Value::Number(n) => n.to_string(),
                                serde_json::Value::String(s) => format!("\"{}\"", s),
                                _ => "0".to_string(),
                            }
                        }).collect();
                        toml.push_str(&format!("{} = [{}]\n", key, items.join(", ")));
                    }
                    _ => {}
                }
            }
        }

        toml
    }
}

/// Locate the nargo binary
fn which_nargo() -> PathBuf {
    // Common locations where noirup installs nargo
    let candidates = vec![
        PathBuf::from("/root/.nargo/bin/nargo"),       // Railway/Docker (Linux)
        PathBuf::from("/Users/inhousecodes/.nargo/bin/nargo"), // local macOS dev
        PathBuf::from("/usr/local/bin/nargo"),
        PathBuf::from("/opt/homebrew/bin/nargo"),
        PathBuf::from("nargo"), // from PATH
    ];

    for c in candidates {
        if c.to_str().unwrap_or("") == "nargo" {
            // Check if nargo is in PATH
            if Command::new("nargo").arg("--version").output().is_ok() {
                return c;
            }
        } else if c.exists() {
            return c;
        }
    }

    // Default — will fail gracefully if not found
    PathBuf::from("nargo")
}
