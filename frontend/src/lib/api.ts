export interface Credential {
  id: string;
  credential_hash: string;
  issuer: string;
  patient_address: string;
  name: string;
  dob: string;
  vaccine_type: string;
  vaccine_date: string;
  patient_secret: string;
  issue_date: number;
  expiry_date: number;
  status: "Active" | "Revoked";
  issuer_signature: string;
  passport_id?: number;
}

export interface ZkProof {
  proof_bytes: string;
  public_inputs: {
    credential_commitment: string;
    patient_public_commit: string;
    issuer_pub_key_x: string;
    issuer_pub_key_y: string;
    vaccine_type: string;
    vaccine_type_hash: string;
  };
}

export interface VerifyResponse {
  verified: boolean;
  details: string;
  vaccine_type?: string;
}

export interface ChatLog {
  tool_name: string;
  arguments: string;
  status: string;
  result: any;
}

export interface ChatResponse {
  text: string;
  tools_called: ChatLog[];
}

export interface Issuer {
  wallet_address: string;
  id: number;
  organization_name: string;
  country: string;
  is_active: boolean;
}

export interface VerificationLog {
  id: number;
  proof_hash: string;
  credential_id: string;
  verifier_address: string;
  timestamp: number;
  status: "Verified" | "Failed";
  details: string;
}

export const api = {
  // Fetch patient credentials
  getPatientCredentials: async (address: string): Promise<Credential[]> => {
    const res = await fetch(`/api/credentials/patient/${address}`);
    if (!res.ok) throw new Error("Failed to load credentials");
    return res.json();
  },

  // Fetch single credential details
  getCredential: async (id: string): Promise<Credential> => {
    const res = await fetch(`/api/credentials/${id}`);
    if (!res.ok) throw new Error("Failed to load credential detail");
    return res.json();
  },

  // Fetch credentials issued by a given issuer wallet address
  getIssuerCredentials: async (address: string): Promise<Credential[]> => {
    const res = await fetch(`/api/credentials/issuer/${address}`);
    if (!res.ok) throw new Error("Failed to load issuer credentials");
    return res.json();
  },

  // Fetch every credential in the system (for the system-wide dashboard)
  getAllCredentials: async (): Promise<Credential[]> => {
    const res = await fetch(`/api/credentials`);
    if (!res.ok) throw new Error("Failed to load credentials");
    return res.json();
  },

  // Step 1: compute ZK commitment + issuer signature off-chain (before on-chain calls)
  prepareCredential: async (payload: {
    name: string;
    dob: string;
    vaccine_type: string;
    vaccine_date: string;
    patient_secret: string;
    issuer: string;
  }): Promise<{ credential_hash: string; patient_public_commit: string; issuer_signature: string }> => {
    const res = await fetch("/api/credentials/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || "Failed to prepare credential");
    }
    return res.json();
  },

  // Step 2: finalize after the on-chain create_credential + mint_passport txs confirm
  issueCredential: async (payload: {
    id: string;
    name: string;
    dob: string;
    vaccine_type: string;
    vaccine_date: string;
    patient_secret: string;
    patient_address: string;
    issuer: string;
    expiry_date: number;
    credential_hash: string;
    patient_public_commit: string;
    issuer_signature: string;
    passport_id: number;
  }) => {
    const res = await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || "Failed to issue credential");
    }
    return res.json();
  },

  // Revoke credential (Authority only)
  revokeCredential: async (credentialHash: string, authorityAddress: string) => {
    const res = await fetch("/api/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential_hash: credentialHash, authority_address: authorityAddress }),
    });
    if (!res.ok) throw new Error("Failed to revoke credential");
    return res.json();
  },

  // Generate ZK proof
  createProof: async (payload: {
    patient_secret: string;
    name: string;
    dob: string;
    vaccine_type: string;
    vaccine_date: string;
    issuer_signature: string;
    issuer_pub_x: string;
    issuer_pub_y: string;
  }): Promise<ZkProof> => {
    const res = await fetch("/api/proofs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to generate ZK Proof");
    return res.json();
  },

  // Verify ZK proof
  verifyProof: async (payload: {
    proof: ZkProof;
    verifier_address: string;
    credential_id: string;
  }): Promise<VerifyResponse> => {
    const res = await fetch("/api/proofs/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to verify proof");
    return res.json();
  },

  // AI Chat processes
  chat: async (message: string, userAddress: string, isAuthority: boolean): Promise<ChatResponse> => {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, user_address: userAddress, is_authority: isAuthority }),
    });
    if (!res.ok) throw new Error("AI agent failed to process chat");
    return res.json();
  },

  // Register new Health authority
  registerIssuer: async (payload: {
    wallet_address: string;
    id: number;
    organization_name: string;
    country: string;
  }) => {
    const res = await fetch("/api/issuers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to register issuer authority");
    return res.json();
  },

  // Fetch list of registered issuers
  getIssuers: async (): Promise<Issuer[]> => {
    const res = await fetch("/api/issuers");
    if (!res.ok) throw new Error("Failed to fetch issuers");
    return res.json();
  },

  // Fetch audit log verification history
  getHistory: async (): Promise<VerificationLog[]> => {
    const res = await fetch("/api/history");
    if (!res.ok) throw new Error("Failed to fetch verification logs");
    return res.json();
  },

  // Fetch the issuer's persistent SECP256K1 public key for ZK proof generation
  getIssuerPubkey: async (address: string): Promise<{ wallet_address: string; pub_key_x: string; pub_key_y: string }> => {
    const res = await fetch(`/api/issuers/${address}/pubkey`);
    if (!res.ok) throw new Error("Failed to fetch issuer public key");
    return res.json();
  },
};
