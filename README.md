# ValidFi — Zero-Knowledge Health Passport

ValidFi lets a health authority issue tamper-proof, encrypted vaccination
credentials on **Stellar Soroban**, and lets the credential holder prove
facts about that credential (e.g. *"I have an active COVID-19 vaccination"*)
using a **zero-knowledge proof** — without ever revealing their name, date of
birth, or any other personal data.

> Prove your health status. Without sharing your data.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Smart Contracts (Soroban)](#smart-contracts-soroban)
- [ZK Circuit (Noir)](#zk-circuit-noir)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Running the Backend](#running-the-backend)
  - [Running the Frontend](#running-the-frontend)
  - [Working with the ZK Circuit](#working-with-the-zk-circuit)
  - [Building / Deploying the Contracts](#building--deploying-the-contracts)
- [Backend API Reference](#backend-api-reference)
- [AI Compliance Assistant](#ai-compliance-assistant)
- [Data Model](#data-model)
- [Security Notes](#security-notes)

---

## How It Works

1. **Authority issues a credential** — A registered health authority signs
   and issues an encrypted credential. The backend computes a ZK commitment
   over the credential data and the patient's secret, signs it with the
   issuer's ECDSA key, and mints a **Health Passport NFT** on-chain that
   anchors the commitment to the patient's wallet.
2. **Patient stores it securely** — The encrypted credential lands in the
   patient's personal vault (AES-256-GCM at rest), accessible only with their
   Freighter wallet.
3. **Generate a ZK proof** — The patient generates a Noir zero-knowledge
   proof that an authorized issuer signed their credential — without
   revealing their name, date of birth, or underlying medical data — and
   shares it as a QR code.
4. **Instant verification** — A verifier (e.g. a border agent or employer)
   scans the proof, checks the issuer signature and on-chain revocation
   status, and gets a pass/fail result in seconds. Every check is logged to
   an audit history.

## Features

- **Zero-Knowledge Proofs** — Noir/Blake2s circuit proves a credential is
  authentic and unrevoked without exposing personal data.
- **On-Chain Revocation Registry** — Health authorities can instantly revoke
  compromised or expired credentials on a Soroban revocation registry.
- **Health Passport NFTs** — Each issued credential mints a soulbound NFT
  (`PassportMetadata`: owner, issuer, credential hash, expiration) that can be
  inspected and verified live on-chain.
- **Freighter-Native Signing** — Designed so on-chain actions are signed by
  the user's own Stellar wallet, not a custodial backend key.
- **AI Compliance Assistant** — A Groq-backed (Llama 3.3 70B) chat assistant
  with tool-calling access to the user's real credentials, proofs,
  verification history, and on-chain revocation status — plus general
  knowledge of destination-country travel requirements.
- **Instant Verifier Scanner** — Scan a proof QR code and get a real-time
  verification result.
- **System-Wide Dashboard** — Real-time analytics across every issued
  credential, health authority, and verification event.

## Architecture

```
┌───────────────────┐      REST (JSON)      ┌──────────────────────────┐
│   Next.js 16 App   │ ───────────────────▶  │   Rust / Axum Backend     │
│  (App Router, TS)  │ ◀───────────────────  │   (validfi.db / SQLite)   │
│                     │                       │  - AES-256 encrypted PII │
│  - Patient Vault    │   Soroban RPC (read)  │  - ECDSA signing (k256)  │
│  - Authority Portal │ ─────────────────────▶│  - Groq AI agent          │
│  - Verifier Scanner │                       │  - nargo (Noir) runner    │
│  - AI Assistant     │                       └────────────┬─────────────┘
│  - NFT viewer       │                                    │
└────────┬────────────┘                                    │ deploy/admin
         │ Freighter wallet (sign + submit)                ▼
         ▼                                       ┌────────────────────────┐
┌───────────────────────────────────────────────┤  Stellar Soroban        │
│  issuer-registry · credential-registry         │  (Testnet)              │
│  revocation-registry · health-passport-nft     └────────────────────────┘
└─────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────┐
│  Noir Circuit (circuits/)   │  compiled & executed via `nargo` by the
│  ZK proof of credential     │  backend's nargo_runner to produce/verify
│  authenticity & ownership   │  zero-knowledge proofs
└────────────────────────────┘
```

## Tech Stack

| Layer       | Technology |
|-------------|------------|
| Frontend    | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion, `react-awesome-reveal`, `lucide-react`, `@react-three/fiber` (3D hero) |
| Wallet      | Freighter (`@stellar/freighter-api`), `@stellar/stellar-sdk` |
| Backend     | Rust, Axum, Tokio, `rusqlite` (SQLite, bundled), `aes-gcm`, `k256` (ECDSA), `sha2`/`blake2`, `reqwest`, `dotenvy` |
| AI          | Groq API (`llama-3.3-70b-versatile`) with function/tool calling |
| ZK Circuit  | Noir (`nargo`), Blake2s hashing, secp256k1 signature verification |
| Smart Contracts | Soroban SDK 22 (Rust → WASM), deployed on Stellar Testnet |

## Repository Structure

```
ValidFi/
├── backend/                  Rust/Axum API server
│   ├── src/
│   │   ├── main.rs            entrypoint, router, default issuer seed
│   │   ├── db.rs               SQLite schema + queries (AES-256 at rest)
│   │   ├── routes/             credentials, proofs, ai chat handlers
│   │   └── services/
│   │       ├── soroban.rs       Soroban RPC client (revocation checks)
│   │       ├── zk.rs             commitment hashing + ECDSA signing
│   │       ├── nargo_runner.rs   invokes `nargo execute` for the circuit
│   │       ├── ai_agent.rs        Groq tool-calling agent
│   │       └── groq_client.rs     thin Groq chat-completions client
│   └── .env.testnet           Soroban testnet RPC + contract IDs
├── circuits/                  Noir ZK circuit
│   ├── Nargo.toml
│   ├── Prover.toml
│   └── src/main.nr             credential authenticity/ownership circuit
├── contracts/                  Soroban smart contracts (Rust → WASM)
│   ├── issuer-registry/
│   ├── credential-registry/
│   ├── revocation-registry/
│   └── health-passport-nft/
├── frontend/                   Next.js 16 App Router frontend
│   └── src/
│       ├── app/page.tsx          landing page
│       ├── app/app/page.tsx       main application (vault, portal, scanner, AI, dashboard)
│       └── lib/                  api.ts (backend client), soroban.ts (on-chain reads)
├── Cargo.toml                  Rust workspace (backend + all 4 contracts)
└── .env                        GROQ_API_KEY / GROQ_MODEL (gitignored)
```

## Smart Contracts (Soroban)

All four contracts are Rust → WASM Soroban contracts, currently deployed on
**Stellar Testnet**:

| Contract | Testnet ID | Key Functions |
|---|---|---|
| `issuer-registry` | `CAMLXIKLHVHCXL5NGCEFQFVKFEUPGGKEMXQ3XPHULQIAKSXIU2O7UYLF` | `init`, `register_issuer`, `remove_issuer`, `is_authorized_issuer`, `get_issuer` |
| `credential-registry` | `CAIONSOWX74Q65W4N2CS6VXPVPOFJZFTIQ4K5J7BMXSOOCKYHOMHOKRT` | `init`, `create_credential`, `update_status`, `verify_credential`, `get_credential` |
| `revocation-registry` | `CAEPPYGISPSGIJGGMZPPUMZVZSEMKOIGUMCGSVDYRUIDP52LMY3RVOKX` | `init`, `revoke_credential`, `restore_credential`, `check_revocation` |
| `health-passport-nft` | `CDDFCNSUILCULGKDAXOOEOIXUKFI6EHNCNZL3HU35N5RPCXAMTHIM6Y6` | `init`, `mint_passport`, `transfer_passport`, `burn_passport`, `get_passport` |

`health-passport-nft`'s `PassportMetadata` struct: `{ passport_id: u32,
credential_hash: BytesN<32>, issuer: Address, expiration: u64, owner: Address
}` — this is what the frontend's "View NFT" modal reads live via
`get_passport`.

## ZK Circuit (Noir)

`circuits/src/main.nr` proves three things about a credential, without
revealing the patient's name, date of birth, or secret:

1. `patient_public_commit == blake2s(patient_secret)` — the prover knows the
   secret behind their identity commitment.
2. `credential_commitment == blake2s(patient_secret ‖ name_hash ‖ dob_hash ‖
   vaccine_type_hash ‖ vaccine_date)` — the commitment encodes the claimed
   private fields.
3. The issuer's ECDSA (secp256k1) `signature` is valid over
   `credential_commitment` under `(issuer_pub_key_x, issuer_pub_key_y)`.

`vaccine_type_hash` is a **public** input, so the verifier learns *which*
health status is attested (e.g. "COVID-19 Vaccination") while everything else
about the patient stays private.

## Getting Started

### Prerequisites

- **Rust** (stable, 2021 edition) + `cargo`
- **Node.js 20+** and `npm`
- **Noir / `nargo`** (via [noirup](https://noir-lang.org)) — used by the
  backend to execute the ZK circuit
- **Stellar CLI** (`stellar`) — only needed if you plan to redeploy contracts
- A **Freighter** wallet browser extension, set to **Testnet**, funded via
  [Friendbot](https://friendbot.stellar.org)
- A **Groq API key** ([console.groq.com/keys](https://console.groq.com/keys))
  for the AI assistant

### Environment Variables

Three env files are used, **none of which should be committed** (see
[Security Notes](#security-notes)):

**`/.env`** (repo root — read by the backend via `dotenvy`)
```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
```

**`backend/.env.testnet`** (Soroban RPC + deployed contract IDs)
```env
SOROBAN_RPC_ENABLED=true
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

CONTRACT_ISSUER_REGISTRY=CAMLXIKLHVHCXL5NGCEFQFVKFEUPGGKEMXQ3XPHULQIAKSXIU2O7UYLF
CONTRACT_CREDENTIAL_REGISTRY=CAIONSOWX74Q65W4N2CS6VXPVPOFJZFTIQ4K5J7BMXSOOCKYHOMHOKRT
CONTRACT_REVOCATION_REGISTRY=CAEPPYGISPSGIJGGMZPPUMZVZSEMKOIGUMCGSVDYRUIDP52LMY3RVOKX
CONTRACT_NFT=CDDFCNSUILCULGKDAXOOEOIXUKFI6EHNCNZL3HU35N5RPCXAMTHIM6Y6
```
> Note: `main.rs` loads `.env` from the repo root via `dotenvy::dotenv()`.
> Copy the contract IDs above (or `.env.testnet`'s contents) into the root
> `.env` as well if you want the backend's on-chain revocation checks enabled
> (`SOROBAN_RPC_ENABLED=true` + `CONTRACT_*` vars), since only the root `.env`
> is auto-loaded.

**`frontend/.env.local`** (public — used client-side for Freighter/Soroban reads)
```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_CONTRACT_ISSUER_REGISTRY=CAMLXIKLHVHCXL5NGCEFQFVKFEUPGGKEMXQ3XPHULQIAKSXIU2O7UYLF
NEXT_PUBLIC_CONTRACT_CREDENTIAL_REGISTRY=CAIONSOWX74Q65W4N2CS6VXPVPOFJZFTIQ4K5J7BMXSOOCKYHOMHOKRT
NEXT_PUBLIC_CONTRACT_REVOCATION_REGISTRY=CAEPPYGISPSGIJGGMZPPUMZVZSEMKOIGUMCGSVDYRUIDP52LMY3RVOKX
NEXT_PUBLIC_CONTRACT_NFT=CDDFCNSUILCULGKDAXOOEOIXUKFI6EHNCNZL3HU35N5RPCXAMTHIM6Y6
```

Optional backend overrides (defaults shown):
```env
DATABASE_PATH=validfi.db
VALIDFI_MASTER_KEY=<64-hex-char AES-256 key>   # demo default if unset
PORT=8080
```

### Running the Backend

```bash
# from the repo root
cargo run --bin backend
```

The server starts on `http://0.0.0.0:8080`, creates `validfi.db` if it
doesn't exist, and seeds two default health authorities (Berlin General
Hospital, St. Luke Medical Center) on first run.

### Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The landing page is at `/`, and the main app
(vault, authority portal, verifier scanner, AI assistant, dashboard) is at
`/app`. The frontend proxies `/api/*` to the backend on port 8080.

### Working with the ZK Circuit

```bash
cd circuits
nargo test     # run the circuit's built-in test
nargo check    # type-check / constraint-check
```

The backend calls `nargo execute --package zk_health_passport` at runtime
(via `nargo_runner.rs`) to generate a witness for a given set of
`Prover.toml` inputs when a patient requests a ZK proof.

### Building / Deploying the Contracts

```bash
# from the repo root - builds backend + all 4 contracts as a workspace
cargo build

# build a contract to WASM for deployment
cd contracts/health-passport-nft
stellar contract build

# deploy + initialize on testnet (example)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/health_passport_nft.wasm \
  --source <your-identity> --network testnet
```

## Backend API Reference

Base URL: `http://localhost:8080`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/credentials/prepare` | Compute the ZK commitment + issuer signature for a new credential (pre-chain step) |
| `GET`  | `/api/credentials` | List every credential in the system |
| `POST` | `/api/credentials` | Finalize/record an issued credential (incl. minted `passport_id`) |
| `GET`  | `/api/credentials/:id` | Get a single credential by ID |
| `GET`  | `/api/credentials/patient/:address` | List a patient's credentials (their vault) |
| `GET`  | `/api/credentials/issuer/:address` | List credentials issued by an authority |
| `GET`  | `/api/issuers` | List registered health authorities |
| `POST` | `/api/issuers` | Register a new health authority |
| `GET`  | `/api/issuers/:address/pubkey` | Get an issuer's persistent ECDSA public key |
| `POST` | `/api/proofs/create` | Generate a ZK proof for a credential |
| `POST` | `/api/proofs/verify` | Verify a ZK proof |
| `POST` | `/api/revoke` | Revoke a credential (authority only) |
| `POST` | `/api/ai/chat` | Chat with the AI compliance assistant |
| `GET`  | `/api/history` | Verification audit log |

## AI Compliance Assistant

The `/api/ai/chat` endpoint drives a Groq-backed (`llama-3.3-70b-versatile`)
tool-calling agent (`backend/src/services/ai_agent.rs`) with access to:

- `list_my_credentials` / `list_issued_credentials`
- `check_travel_eligibility` — returns the user's active vaccine credentials
  plus any system-defined entry rule for a country (currently Germany/Japan);
  for other countries the model combines this with its own general knowledge
  of entry requirements
- `generate_zk_proof`
- `get_verification_history`
- `check_revocation_status` (live Soroban read)

The agent always uses these tools for the user's *own* data (never invents
credential IDs, hashes, statuses, or dates), and is capped at 4 tool-call
rounds per message.

## Data Model

SQLite (`validfi.db`), encrypted PII via AES-256-GCM:

| Table | Purpose |
|---|---|
| `issuers` | Registered health authorities (wallet, org name, country, active flag) |
| `credentials` | Encrypted credential payloads, hash, issuer/patient, dates, status, issuer signature |
| `revocations` | Revoked credential hashes, who revoked them and when |
| `nfts` | Minted Health Passport NFTs (`passport_id` ↔ `credential_hash`, owner, issuer, expiration) |
| `verification_history` | Audit log of proof verification attempts |
| `issuer_keypairs` | Per-issuer ECDSA keypair (private key AES-encrypted at rest) used to sign credential commitments |

## Security Notes

- `.env`, `backend/.env.testnet`, and `frontend/.env.local` hold API keys and
  RPC/contract configuration and are **gitignored** — never commit them.
- `validfi.db` is a local dev database containing AES-encrypted PII; treat it
  as sensitive and avoid committing it.
- If you rotate the `GROQ_API_KEY`, update the root `.env` and restart the
  backend (`AiAgent::new` reads it once at startup).
