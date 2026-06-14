"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ShieldCheck, 
  Activity, 
  User, 
  Cpu, 
  History, 
  QrCode, 
  Scan, 
  PlusCircle, 
  Lock, 
  Unlock, 
  Send, 
  Terminal, 
  Globe, 
  Key, 
  CheckCircle, 
  AlertCircle, 
  Trash2, 
  Loader2,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ShieldAlert,
  Building2,
  BarChart3,
  TrendingUp,
  Hourglass,
  Syringe,
  Award,
  X,
  ExternalLink
} from "lucide-react";
import { api, Credential, ZkProof, VerificationLog, Issuer } from "../../lib/api";
import { invokeAndConfirm, simulateRead, CONTRACTS, scBytes32, scAddress, scU32, scU64, scString } from "../../lib/soroban";
import { toast } from "sonner";
import { Toaster } from "../../components/ui/sonner";

const DEFAULT_LOADING_MESSAGE = "Executing Stellar Transaction & ZK Constraints...";

const generateCredId = () => "CRED-" + Math.floor(100000 + Math.random() * 900000);

// All UN member states plus the Holy See & Palestine, used to populate the
// Travel Compliance "Destination Country" selector.
const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
  "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
  "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia",
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso",
  "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic",
  "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Republic of the)", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czechia", "Democratic Republic of the Congo", "Denmark",
  "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
  "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland",
  "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada",
  "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Holy See", "Honduras",
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania",
  "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
  "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova",
  "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
  "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria",
  "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine",
  "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia",
  "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore",
  "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea",
  "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland",
  "Syria", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga",
  "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda",
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
  "Uzbekistan", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

// Special display labels for countries with a named compliance rule.
const COUNTRY_LABELS: Record<string, string> = {
  Germany: "Germany (EU Mandate)",
  Japan: "Japan (MHLW Check)",
  "United States": "United States (CDC)",
};

export default function Home() {
  // Navigation & Role States
  const [activeTab, setActiveTab] = useState<"dashboard" | "vault" | "chat" | "scanner" | "issuer">("dashboard");
  const [userRole, setUserRole] = useState<"patient" | "issuer" | "admin">("patient");
  
  // Wallet States
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  
  // App Core States
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [allCredentials, setAllCredentials] = useState<Credential[]>([]);
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [history, setHistory] = useState<VerificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(DEFAULT_LOADING_MESSAGE);

  // Active Selected States
  const [selectedCred, setSelectedCred] = useState<Credential | null>(null);
  const [generatedProof, setGeneratedProof] = useState<ZkProof | null>(null);
  const [proofQrValue, setProofQrValue] = useState("");
  const [nftModal, setNftModal] = useState<{
    cred: Credential;
    onChain: Record<string, unknown> | null;
    status: "idle" | "loading" | "error";
    error: string;
  } | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    checked: boolean;
    verified: boolean;
    details: string;
    vaccine_type?: string;
  } | null>(null);

  // Travel Checker State
  const [selectedCountry, setSelectedCountry] = useState("Germany");
  const [complianceResult, setComplianceResult] = useState<{
    checked: boolean;
    eligible: boolean;
    rule: string;
    details: string;
  } | null>(null);

  // AI Chat States
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "assistant"; text: string; tools?: any[] }>>([
    {
      sender: "assistant",
      text: "Hello! I am your ZK Health Passport AI compliance assistant. I can fetch your credentials, generate proofs, audit verification logs, and verify compliance rules. Ask me something like: 'Am I eligible to travel to Germany?'",
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const [expandedTraces, setExpandedTraces] = useState<Record<number, boolean>>({});
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Form States (Issuance & Registry)
  const [newCredForm, setNewCredForm] = useState(() => ({
    id: generateCredId(),
    name: "",
    dob: "",
    vaccineType: "COVID-19 Vaccination",
    vaccineDate: "",
    patientSecret: "",
    patientAddress: "",
    expiryDays: "365",
  }));
  
  const [newIssuerForm, setNewIssuerForm] = useState({
    walletAddress: "",
    id: "",
    organizationName: "",
    country: "",
  });

  const [verifyProofInput, setVerifyProofInput] = useState("");
  const [verifyCredIdInput, setVerifyCredIdInput] = useState("");

  // Initialize and Sync Data
  useEffect(() => {
    syncData();
  }, []);

  useEffect(() => {
    if (walletAddress) {
      syncData();
    }
  }, [walletAddress, userRole, activeTab]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, aiTyping]);

  const syncData = async () => {
    try {
      setLoading(true);

      // Load credentials relevant to the page currently being viewed.
      // The Authority Portal shows credentials *issued by* this wallet;
      // every other page shows credentials *held by* this wallet as a patient.
      if (walletAddress) {
        if (activeTab === "issuer") {
          const creds = await api.getIssuerCredentials(walletAddress);
          setCredentials(creds);
        } else {
          const creds = await api.getPatientCredentials(walletAddress);
          setCredentials(creds);
        }
      }

      // Load registered issuers
      const iss = await api.getIssuers();
      setIssuers(iss);

      // Load verification logs
      const logs = await api.getHistory();
      setHistory(logs);

      // Load system-wide credentials for the Dashboard tab
      const all = await api.getAllCredentials();
      setAllCredentials(all);
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Connect Freighter Wallet
  const connectFreighter = async () => {
    try {
      const { isConnected: checkConnected, requestAccess } = await import("@stellar/freighter-api");
      const connection = await checkConnected();

      if (connection.isConnected) {
        // requestAccess() triggers Freighter's connection-approval popup on
        // first use (getAddress() does not - it only returns a cached key).
        const accessObj = await requestAccess();
        if (accessObj.error) {
          toast.error("Freighter connection error: " + accessObj.error);
          return;
        }
        const address = accessObj.address;
        if (!address) {
          toast.error("Freighter did not return an address. Unlock the extension and try again.");
          return;
        }
        setWalletAddress(address);
        setWalletConnected(true);
        toast.success("Freighter Wallet connected successfully: " + address.substring(0, 12) + "...");
      } else {
        toast.error("Freighter browser extension not detected. Please install Freighter and try again.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Freighter connection failed: " + (e instanceof Error ? e.message : e));
    }
  };

  // Generate ZK Proof for travel/verifications
  // Open the "View NFT" modal for a credential's Health Passport NFT
  const handleViewNft = (cred: Credential) => {
    setNftModal({ cred, onChain: null, status: "idle", error: "" });
  };

  // Read the live PassportMetadata struct from the NFT contract on Soroban testnet
  const handleVerifyNftOnChain = async () => {
    if (!nftModal || nftModal.cred.passport_id == null || !walletAddress) return;
    setNftModal((prev) => (prev ? { ...prev, status: "loading", error: "" } : prev));
    try {
      const onChain = await simulateRead<Record<string, unknown>>(
        CONTRACTS.nft,
        "get_passport",
        [scU32(nftModal.cred.passport_id)],
        walletAddress
      );
      setNftModal((prev) => (prev ? { ...prev, onChain, status: "idle" } : prev));
    } catch (e) {
      setNftModal((prev) => (prev ? { ...prev, status: "error", error: e instanceof Error ? e.message : String(e) } : prev));
    }
  };

  const handleGenerateProof = async (cred: Credential) => {
    try {
      setLoading(true);
      // Fetch the issuer's real SECP256K1 public key (same key used to sign the commitment in prepareCredential)
      const { pub_key_x, pub_key_y } = await api.getIssuerPubkey(cred.issuer);

      const proof = await api.createProof({
        patient_secret: cred.patient_secret,
        name: cred.name,
        dob: cred.dob,
        vaccine_type: cred.vaccine_type,
        vaccine_date: cred.vaccine_date,
        issuer_signature: cred.issuer_signature,
        issuer_pub_x: pub_key_x,
        issuer_pub_y: pub_key_y,
      });

      setGeneratedProof(proof);
      
      // QR contains: proof payload + metadata to scan
      const qrData = {
        proof_hash: proof.proof_bytes,
        credential_id: cred.id,
        verification_url: `${window.location.origin}/api/proofs/verify`,
        public_inputs: proof.public_inputs
      };
      setProofQrValue(JSON.stringify(qrData));
    } catch (e) {
      toast.error("Failed to generate ZK Proof: " + e);
    } finally {
      setLoading(false);
    }
  };

  // Verify Proof (Manual paste or QR Scan simulate)
  const handleVerifyProof = async () => {
    try {
      setLoading(true);
      if (!verifyProofInput) {
        toast.warning("Please paste QR proof payload or scan code first");
        return;
      }

      const qrObj = JSON.parse(verifyProofInput);
      const payload = {
        proof: {
          proof_bytes: qrObj.proof_hash,
          public_inputs: qrObj.public_inputs
        },
        verifier_address: walletAddress || "UNKNOWN_VERIFIER",
        credential_id: qrObj.credential_id || verifyCredIdInput || "CRED-UNKNOWN"
      };

      const result = await api.verifyProof(payload);
      setVerificationResult({
        checked: true,
        verified: result.verified,
        details: result.details,
        vaccine_type: result.vaccine_type
      });
      syncData(); // Sync history log
    } catch {
      setVerificationResult({
        checked: true,
        verified: false,
        details: "Invalid QR proof structure or payload formatting."
      });
    } finally {
      setLoading(false);
    }
  };

  // Travel Compliance Checker
  const handleCheckTravel = async () => {
    if (!walletAddress) {
      toast.warning("Please connect wallet first to check compliance against your credentials");
      return;
    }
    
    setLoading(true);
    try {
      const activeCreds = credentials.filter(c => c.status === "Active");
      const rule = selectedCountry === "Germany" 
        ? "Requires active COVID-19 vaccine OR Yellow Fever vaccine."
        : selectedCountry === "Japan"
        ? "Requires active COVID-19 vaccine."
        : "Requires active COVID-19 vaccine OR Yellow Fever vaccine.";

      let eligible = false;
      let details = "";
      
      for (const cred of activeCreds) {
        const vaccine = cred.vaccine_type.toLowerCase();
        if (selectedCountry === "Japan") {
          if (vaccine.includes("covid")) {
            eligible = true;
            details = `You are eligible! Your COVID-19 credential (ID: ${cred.id}) satisfies Japan's mandate.`;
            break;
          }
        } else {
          if (vaccine.includes("covid") || vaccine.includes("yellow")) {
            eligible = true;
            details = `You are eligible! Your ${cred.vaccine_type} credential (ID: ${cred.id}) satisfies the entry guidelines.`;
            break;
          }
        }
      }

      if (!eligible) {
        details = activeCreds.length === 0 
          ? "No active credentials found in your vault to satisfy this rule."
          : `Your active credentials (${activeCreds.map(c => c.vaccine_type).join(", ")}) do not satisfy the travel policy.`;
      }

      setComplianceResult({
        checked: true,
        eligible,
        rule,
        details
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Issue Credential (Healthcare Provider) - real on-chain create_credential + mint_passport, signed via Freighter
  const handleIssueCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      toast.warning("Connect your Freighter wallet to issue credentials on-chain.");
      return;
    }

    try {
      setLoading(true);
      const days = parseInt(newCredForm.expiryDays) || 365;
      const expiry_date = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
      const id = newCredForm.id;
      const patient_secret = newCredForm.patientSecret || "secret-" + Math.floor(Math.random() * 1000000);

      setLoadingMessage("Computing zero-knowledge commitment...");
      const prep = await api.prepareCredential({
        name: newCredForm.name,
        dob: newCredForm.dob,
        vaccine_type: newCredForm.vaccineType,
        vaccine_date: newCredForm.vaccineDate,
        patient_secret,
        issuer: walletAddress,
      });

      setLoadingMessage("Confirm in Freighter: writing credential to chain...");
      await invokeAndConfirm(
        CONTRACTS.credentialRegistry,
        "create_credential",
        [scBytes32(prep.credential_hash), scAddress(walletAddress), scU64(expiry_date)],
        walletAddress
      );

      setLoadingMessage("Confirm in Freighter: minting Health Passport NFT...");
      const { result: passportId } = await invokeAndConfirm<number>(
        CONTRACTS.nft,
        "mint_passport",
        [
          scAddress(newCredForm.patientAddress),
          scBytes32(prep.credential_hash),
          scU64(expiry_date),
          scAddress(walletAddress),
        ],
        walletAddress
      );

      setLoadingMessage("Saving encrypted credential record...");
      const res = await api.issueCredential({
        id,
        name: newCredForm.name,
        dob: newCredForm.dob,
        vaccine_type: newCredForm.vaccineType,
        vaccine_date: newCredForm.vaccineDate,
        patient_secret,
        patient_address: newCredForm.patientAddress,
        issuer: walletAddress,
        expiry_date,
        credential_hash: prep.credential_hash,
        patient_public_commit: prep.patient_public_commit,
        issuer_signature: prep.issuer_signature,
        passport_id: passportId,
      });

      toast.success(`Success! On-chain credential commitment created:\n- Passport NFT Minted! ID: ${res.passport_id}\n- Credential Hash: ${res.credential_hash.substring(0, 16)}...`);

      // Reset form
      setNewCredForm({
        id: generateCredId(),
        name: "",
        dob: "",
        vaccineType: "COVID-19 Vaccination",
        vaccineDate: "",
        patientSecret: "",
        patientAddress: "",
        expiryDays: "365",
      });
      syncData();
    } catch (e) {
      toast.error("Failed to issue credential: " + (e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
      setLoadingMessage(DEFAULT_LOADING_MESSAGE);
    }
  };

  // Revoke Credential (Healthcare Provider) - real on-chain revoke_credential + update_status, signed via Freighter
  const handleRevoke = async (hash: string) => {
    if (!walletAddress) {
      toast.warning("Connect your Freighter wallet to revoke credentials on-chain.");
      return;
    }
    if (confirm("Are you sure you want to revoke this credential commitment on-chain? This action is irreversible.")) {
      try {
        setLoading(true);
        setLoadingMessage("Confirm in Freighter: revoking credential on-chain...");
        await invokeAndConfirm(
          CONTRACTS.revocationRegistry,
          "revoke_credential",
          [scBytes32(hash), scAddress(walletAddress)],
          walletAddress
        );

        setLoadingMessage("Confirm in Freighter: updating credential status...");
        await invokeAndConfirm(
          CONTRACTS.credentialRegistry,
          "update_status",
          [scBytes32(hash), scU32(2), scAddress(walletAddress)],
          walletAddress
        );

        setLoadingMessage("Updating records...");
        await api.revokeCredential(hash, walletAddress);
        toast.success("Credential revoked on-chain successfully!");
        syncData();
      } catch (e) {
        toast.error("Revocation failed: " + (e instanceof Error ? e.message : e));
      } finally {
        setLoading(false);
        setLoadingMessage(DEFAULT_LOADING_MESSAGE);
      }
    }
  };

  // Register New Authority (Admin only) - real on-chain register_issuer, signed via Freighter
  const handleRegisterIssuer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      toast.warning("Connect your Freighter wallet to register an issuer on-chain.");
      return;
    }
    try {
      setLoading(true);
      const issuerId = parseInt(newIssuerForm.id) || 201;

      setLoadingMessage("Confirm in Freighter: registering issuer on-chain...");
      await invokeAndConfirm(
        CONTRACTS.issuerRegistry,
        "register_issuer",
        [
          scU32(issuerId),
          scAddress(newIssuerForm.walletAddress),
          scString(newIssuerForm.organizationName),
          scString(newIssuerForm.country),
        ],
        walletAddress
      );

      setLoadingMessage("Saving issuer record...");
      await api.registerIssuer({
        wallet_address: newIssuerForm.walletAddress,
        id: issuerId,
        organization_name: newIssuerForm.organizationName,
        country: newIssuerForm.country,
      });
      toast.success("Healthcare Authority registered successfully in Stellar Soroban Issuer Registry!");
      setNewIssuerForm({
        walletAddress: "",
        id: "",
        organizationName: "",
        country: "",
      });
      syncData();
    } catch (e) {
      toast.error("Registration failed: " + (e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
      setLoadingMessage(DEFAULT_LOADING_MESSAGE);
    }
  };

  // AI Assistant message processes
  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    if (!walletAddress) {
      toast.warning("Connect your Freighter wallet to use the AI assistant.");
      return;
    }
    const userText = chatInput;
    setChatMessages(prev => [...prev, { sender: "user", text: userText }]);
    setChatInput("");
    setAiTyping(true);

    try {
      const isAuth = userRole === "issuer";
      const res = await api.chat(userText, walletAddress, isAuth);

      setChatMessages(prev => [...prev, {
        sender: "assistant",
        text: res.text,
        tools: res.tools_called
      }]);
    } catch (e) {
      setChatMessages(prev => [...prev, {
        sender: "assistant",
        text: "Sorry, I had trouble processing your compliance request. Please make sure the backend server is running."
      }]);
    } finally {
      setAiTyping(false);
      syncData();
    }
  };

  // --- Agent trace formatting helpers (turn raw tool JSON into readable summaries) ---
  const formatDate = (ts: number) => {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  const truncateHex = (s: string, len = 6) => {
    if (!s) return "—";
    return s.length > len * 2 ? `${s.slice(0, len)}…${s.slice(-len)}` : s;
  };

  // Render a decoded Soroban ScVal (string, bigint, byte array, etc.) as readable text
  const formatOnChainValue = (v: unknown): string => {
    if (v == null) return "—";
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Uint8Array) return Array.from(v).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (typeof v === "string") return v;
    return String(v);
  };

  const TOOL_LABELS: Record<string, string> = {
    list_my_credentials: "Looked up your vault",
    list_issued_credentials: "Looked up issued credentials",
    check_travel_eligibility: "Checked travel requirements",
    generate_zk_proof: "Generated a ZK proof",
    get_verification_history: "Checked verification history",
    check_revocation_status: "Checked revocation status",
  };

  const summarizeArgs = (toolName: string, argsStr: string): string => {
    try {
      const args = JSON.parse(argsStr);
      if (toolName === "check_travel_eligibility" && args?.country) return args.country;
      if (toolName === "generate_zk_proof" && args?.credential_id) return args.credential_id;
      if (toolName === "check_revocation_status" && args?.credential_hash) return truncateHex(args.credential_hash);
    } catch {
      // non-JSON or empty arguments - nothing to summarize
    }
    return "";
  };

  const renderToolResult = (toolName: string, status: string, result: any) => {
    if (status !== "success") {
      return (
        <div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>
          {result?.error || "This action failed."}
        </div>
      );
    }

    switch (toolName) {
      case "list_my_credentials":
      case "list_issued_credentials": {
        const creds: any[] = result?.credentials || [];
        const showPatient = toolName === "list_issued_credentials";
        if (creds.length === 0) {
          return <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No credentials found.</div>;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {creds.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                {c.status === "Active"
                  ? <CheckCircle size={12} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                  : <AlertCircle size={12} style={{ color: 'var(--color-error)', flexShrink: 0 }} />}
                <span style={{ fontWeight: 700 }}>{c.vaccine_type}</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {c.id} · {c.status} · expires {formatDate(c.expiry_date)}
                  {showPatient && ` · patient ${truncateHex(c.patient_address, 4)}`}
                </span>
              </div>
            ))}
          </div>
        );
      }

      case "check_travel_eligibility": {
        const creds: string[] = result?.active_vaccine_credentials || [];
        const hasActive = creds.length > 0;
        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.8rem' }}>
            {hasActive
              ? <CheckCircle size={12} style={{ color: 'var(--color-success)', marginTop: '2px', flexShrink: 0 }} />
              : <AlertCircle size={12} style={{ color: 'var(--color-error)', marginTop: '2px', flexShrink: 0 }} />}
            <span>
              {hasActive
                ? `Active vaccine credentials: ${creds.join(", ")}`
                : "No active vaccine credentials found"}
              {result?.known_system_rule && (
                <span style={{ color: 'var(--text-secondary)' }}> — system rule for {result.country}: {result.known_system_rule}</span>
              )}
            </span>
          </div>
        );
      }

      case "generate_zk_proof": {
        const pi = result?.public_inputs || {};
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Key size={12} style={{ color: 'var(--color-success)' }} />
              <span>Proof signature: {truncateHex(result?.proof_bytes, 8)}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', paddingLeft: '18px' }}>
              Commitment: {truncateHex(pi.credential_commitment)}
            </div>
          </div>
        );
      }

      case "get_verification_history": {
        const history: any[] = result?.history || [];
        if (history.length === 0) {
          return <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No verification attempts yet.</div>;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {history.slice(0, 5).map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                {h.status === "Verified"
                  ? <CheckCircle size={12} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                  : <AlertCircle size={12} style={{ color: 'var(--color-error)', flexShrink: 0 }} />}
                <span style={{ fontWeight: 700 }}>{h.credential_id}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{h.status} · {h.details}</span>
              </div>
            ))}
          </div>
        );
      }

      case "check_revocation_status": {
        const revoked = !!result?.revoked;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
            {revoked
              ? <AlertCircle size={12} style={{ color: 'var(--color-error)' }} />
              : <CheckCircle size={12} style={{ color: 'var(--color-success)' }} />}
            <span>{revoked ? "Revoked" : "Not revoked"}</span>
          </div>
        );
      }

      default:
        return (
          <pre style={{ background: '#000', padding: '4px', borderRadius: '4px', overflowX: 'auto', width: '100%', fontSize: '0.7rem' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        );
    }
  };

  // --- Dashboard derived stats (system-wide overview from allCredentials/issuers/history) ---
  const activeCredentialsCount = allCredentials.filter(c => c.status === "Active").length;
  const revokedCredentialsCount = allCredentials.filter(c => c.status === "Revoked").length;
  const activeIssuersCount = issuers.filter(i => i.is_active).length;
  const verifiedCount = history.filter(h => h.status === "Verified").length;
  const passRate = history.length > 0 ? Math.round((verifiedCount / history.length) * 100) : 0;

  const statCards = [
    { icon: ClipboardList, label: "Total Credentials", value: allCredentials.length, sub: "Issued across all authorities", color: "var(--color-primary)" },
    { icon: CheckCircle, label: "Active Credentials", value: activeCredentialsCount, sub: `${revokedCredentialsCount} revoked`, color: "var(--color-success)" },
    { icon: ShieldAlert, label: "Revocations", value: revokedCredentialsCount, sub: "On-chain Revocation Registry", color: "var(--color-error)" },
    { icon: Building2, label: "Health Authorities", value: issuers.length, sub: `${activeIssuersCount} active`, color: "var(--color-accent)" },
    { icon: BarChart3, label: "Proofs Verified", value: history.length, sub: "Verification audit log entries", color: "var(--color-secondary)" },
    { icon: TrendingUp, label: "Proof Pass Rate", value: `${passRate}%`, sub: `${verifiedCount} of ${history.length} passed`, color: "var(--color-success)" },
  ];

  // Breakdown: credentials by certificate/vaccine type
  const typeCounts: Record<string, number> = {};
  allCredentials.forEach(c => { typeCounts[c.vaccine_type] = (typeCounts[c.vaccine_type] || 0) + 1; });
  const typeBreakdown = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  // Breakdown: credentials by issuing health authority
  const issuerCounts: Record<string, number> = {};
  allCredentials.forEach(c => { issuerCounts[c.issuer] = (issuerCounts[c.issuer] || 0) + 1; });
  const issuerBreakdown = Object.entries(issuerCounts)
    .map(([address, count]) => ({
      address,
      count,
      name: issuers.find(i => i.wallet_address === address)?.organization_name || truncateHex(address, 4),
    }))
    .sort((a, b) => b.count - a.count);

  // Credentials expiring within the next 30 days
  const nowSeconds = Date.now() / 1000;
  const THIRTY_DAYS = 30 * 24 * 60 * 60;
  const expiringSoon = allCredentials
    .filter(c => c.status === "Active" && c.expiry_date > nowSeconds && c.expiry_date - nowSeconds <= THIRTY_DAYS)
    .sort((a, b) => a.expiry_date - b.expiry_date)
    .slice(0, 5);

  const recentCredentials = allCredentials.slice(0, 5);
  const recentVerifications = history.slice(0, 5);

  return (
    <div className="app-container">
      <Toaster />
      {/* Top Header */}
      <header className="header">
        <Link href="/" className="logo-group" style={{ textDecoration: 'none' }}>
          <ShieldCheck size={28} className="logo-badge" style={{ padding: 0, border: 'none', background: 'transparent' }} />
          <h1 className="logo-text">ValidFi</h1>
        </Link>

        <nav className="nav-links">
          <button onClick={() => setActiveTab("dashboard")} className={`nav-link ${activeTab === "dashboard" ? "active" : ""}`}>
            Dashboard
          </button>
          <button onClick={() => setActiveTab("vault")} className={`nav-link ${activeTab === "vault" ? "active" : ""}`}>
            Credential Vault
          </button>
          <button onClick={() => setActiveTab("chat")} className={`nav-link ${activeTab === "chat" ? "active" : ""}`}>
            AI Assistant
          </button>
          <button onClick={() => setActiveTab("scanner")} className={`nav-link ${activeTab === "scanner" ? "active" : ""}`}>
            Verifier Scanner
          </button>
          <button onClick={() => setActiveTab("issuer")} className={`nav-link ${activeTab === "issuer" ? "active" : ""}`}>
            Authority Portal
          </button>
        </nav>

        <div className="wallet-box">
          {walletConnected ? (
            <>
              <span className="wallet-address">
                {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 6)}
              </span>
              <button 
                onClick={() => {
                  setWalletConnected(false);
                  setWalletAddress("");
                }} 
                className="btn btn-secondary" 
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={connectFreighter} className="btn btn-primary pulse-glow" style={{ padding: '0.5rem 1rem' }}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Real Wallet Role View */}
      {walletConnected && (
        <div style={{ background: '#000000', borderBottom: '1px solid var(--border-color)', padding: '0.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <Info size={14} style={{ color: 'var(--color-primary)' }} />
            <span><strong>Freighter Wallet:</strong> on-chain calls are signed by your connected address regardless of view. Switch view to access Issuer / Admin actions:</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setUserRole("patient")} className={`btn ${userRole === "patient" ? "btn-primary" : "btn-secondary"}`} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
              Patient View
            </button>
            <button onClick={() => setUserRole("issuer")} className={`btn ${userRole === "issuer" ? "btn-primary" : "btn-secondary"}`} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
              Issuer View
            </button>
            <button onClick={() => setUserRole("admin")} className={`btn ${userRole === "admin" ? "btn-primary" : "btn-secondary"}`} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
              Admin View
            </button>
          </div>
        </div>
      )}

      <main className="main-content">
        {/* Loading Overlay */}
        {loading && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <Loader2 className="pulse-glow" size={32} style={{ animation: 'spin 2s linear infinite', color: 'var(--color-primary)' }} />
              <p>{loadingMessage}</p>
            </div>
          </div>
        )}

        {/* Health Passport NFT Modal */}
        {nftModal && (
          <div
            onClick={() => setNftModal(null)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: '1rem' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="glass-panel"
              style={{ border: '1px solid var(--color-primary)', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            >
              <button onClick={() => setNftModal(null)} className="btn btn-secondary" style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px 8px', zIndex: 10 }}>
                <X size={14} />
              </button>

              {/* NFT Card */}
              <div className="nft-card pulse-glow">
                <div className="nft-card-shine" />
                <ShieldCheck size={140} className="nft-card-icon-bg" />
                <div className="nft-card-eyebrow"><Award size={14} /> Health Passport NFT</div>
                <div className="nft-card-id">#{nftModal.cred.passport_id}</div>
                <h3 className="nft-card-title">{nftModal.cred.vaccine_type}</h3>
                <span
                  className={`card-badge ${nftModal.cred.status === "Active" ? "active" : "revoked"}`}
                  style={{ position: 'relative' }}
                >
                  {nftModal.cred.status}
                </span>
                <div className="nft-card-footer">
                  <div>
                    <div className="nft-card-eyebrow">Owner</div>
                    <div className="nft-card-id">{truncateHex(nftModal.cred.patient_address, 8)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="nft-card-eyebrow">Expires</div>
                    <div className="nft-card-id">{nftModal.cred.expiry_date === 0 ? "Never" : formatDate(nftModal.cred.expiry_date)}</div>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Issuer: {truncateHex(nftModal.cred.issuer, 8)}
                </p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Credential Hash: {truncateHex(nftModal.cred.credential_hash, 10)}
                </p>
                <p><strong>Issued:</strong> {formatDate(nftModal.cred.issue_date)}</p>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '1rem', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={handleVerifyNftOnChain}
                  disabled={!walletAddress || nftModal.status === "loading"}
                  className="btn btn-secondary"
                  style={{ width: '100%', gap: '0.5rem' }}
                >
                  {nftModal.status === "loading" ? <Loader2 size={16} style={{ animation: 'spin 2s linear infinite' }} /> : <Cpu size={16} />}
                  Verify On-Chain
                </button>

                {nftModal.status === "error" && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>On-chain read failed: {nftModal.error}</p>
                )}

                {nftModal.onChain && (
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px', wordBreak: 'break-all' }}>
                    <p>On-chain owner: {formatOnChainValue(nftModal.onChain.owner)}</p>
                    <p>On-chain issuer: {formatOnChainValue(nftModal.onChain.issuer)}</p>
                    <p>On-chain expiration: {formatOnChainValue(nftModal.onChain.expiration)}</p>
                    <p>On-chain hash: {formatOnChainValue(nftModal.onChain.credential_hash)}</p>
                  </div>
                )}

                <a
                  href={`https://stellar.expert/explorer/testnet/contract/${CONTRACTS.nft}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ width: '100%', gap: '0.5rem', justifyContent: 'center' }}
                >
                  View NFT Contract on Stellar Expert <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ================= DASHBOARD TAB ================= */}
        {activeTab === "dashboard" && (
          <div>
            <div className="hero">
              <h2 className="hero-title">System <span className="hero-gradient-text">Dashboard</span></h2>
              <p className="hero-subtitle">
                A real-time, system-wide view of every credential, health authority, and zero-knowledge proof verification recorded by ValidFi.
              </p>
            </div>

            <div className="stat-grid">
              {statCards.map((card, i) => {
                const Icon = card.icon;
                return (
                  <div key={i} className="stat-card">
                    <div className="stat-card-icon" style={{ background: `${card.color}1a`, color: card.color }}>
                      <Icon size={18} />
                    </div>
                    <div className="stat-value">{card.value}</div>
                    <div className="stat-label">{card.label}</div>
                    <div className="stat-sub">{card.sub}</div>
                  </div>
                );
              })}
            </div>

            <div className="dashboard-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Credentials by certificate type */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Syringe size={18} style={{ color: 'var(--color-primary)' }} />
                    Credentials by Certificate Type
                  </h3>
                  {typeBreakdown.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No credentials issued yet.</p>
                  ) : (
                    typeBreakdown.map(([type, count]) => (
                      <div key={type} className="bar-row">
                        <div className="bar-row-header">
                          <span>{type}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{count}</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${(count / allCredentials.length) * 100}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Credentials by issuing health authority */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 size={18} style={{ color: 'var(--color-accent)' }} />
                    Credentials by Health Authority
                  </h3>
                  {issuerBreakdown.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No credentials issued yet.</p>
                  ) : (
                    issuerBreakdown.map((entry) => (
                      <div key={entry.address} className="bar-row">
                        <div className="bar-row-header">
                          <span>{entry.name}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{entry.count}</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${(entry.count / allCredentials.length) * 100}%`, background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-secondary) 100%)' }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Recently issued credentials */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ClipboardList size={18} style={{ color: 'var(--color-primary)' }} />
                    Recently Issued Credentials
                  </h3>
                  {recentCredentials.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No credentials issued yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {recentCredentials.map((c) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                            {c.status === "Active"
                              ? <CheckCircle size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                              : <AlertCircle size={14} style={{ color: 'var(--color-error)', flexShrink: 0 }} />}
                            <span style={{ fontWeight: 700 }}>{c.vaccine_type}</span>
                            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{c.id}</span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(c.issue_date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Credentials expiring soon */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Hourglass size={18} style={{ color: 'var(--color-warning)' }} />
                    Expiring Within 30 Days
                  </h3>
                  {expiringSoon.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No active credentials are expiring soon.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {expiringSoon.map((c) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <div>
                            <span style={{ fontWeight: 700 }}>{c.vaccine_type}</span>
                            <span style={{ color: 'var(--text-secondary)' }}> · {c.id}</span>
                          </div>
                          <span style={{ color: 'var(--color-warning)', fontSize: '0.75rem' }}>expires {formatDate(c.expiry_date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent verification activity */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={18} style={{ color: 'var(--color-secondary)' }} />
                    Recent Verification Activity
                  </h3>
                  {recentVerifications.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No proofs have been verified yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {recentVerifications.map((h) => (
                        <div key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {h.status === "Verified"
                              ? <CheckCircle size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                              : <AlertCircle size={14} style={{ color: 'var(--color-error)', flexShrink: 0 }} />}
                            <span style={{ fontWeight: 700 }}>{h.credential_id}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{formatDate(h.timestamp)}</span>
                          </div>
                          <span style={{ color: 'var(--text-secondary)', paddingLeft: '20px' }}>{h.details}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= VAULT TAB ================= */}
        {activeTab === "vault" && (
          <div>
            <div className="hero">
              <h2 className="hero-title">Your Private <span className="hero-gradient-text">Health Vault</span></h2>
              <p className="hero-subtitle">
                Store digital health credentials encrypted locally using AES-256. Generate zero-knowledge proofs to share status with border security or employers without leaking your identity.
              </p>
            </div>

            <div className="dashboard-grid">
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Active Credentials</h3>
                  <button onClick={syncData} className="btn btn-secondary" style={{ padding: '6px' }}>
                    <RefreshCw size={16} />
                  </button>
                </div>
                
                {credentials.length === 0 ? (
                  <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-secondary)' }}>
                    <Lock size={48} style={{ color: 'var(--color-secondary)', marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ marginBottom: '1rem' }}>No credentials loaded in vault.</p>
                    <p style={{ fontSize: '0.85rem' }}>Switch to the <strong>Authority Portal</strong> tab to issue a credential, or use the <strong>AI Assistant</strong> to ask for help.</p>
                  </div>
                ) : (
                  <div className="card-grid">
                    {credentials.map((c) => (
                      <div 
                        key={c.id} 
                        onClick={() => {
                          setSelectedCred(c);
                          setGeneratedProof(null);
                          setProofQrValue("");
                        }}
                        className={`credential-card ${c.status === "Revoked" ? "revoked" : ""}`}
                      >
                        <div className="card-header">
                          <span className="card-type">{c.vaccine_type}</span>
                          <span className={`card-badge ${c.status === "Active" ? "active" : "revoked"}`}>
                            {c.status}
                          </span>
                        </div>
                        <div className="card-body">
                          <p className="patient-name">{c.name}</p>
                          <p className="patient-detail">Patient: {c.patient_address.substring(0, 10)}...</p>
                          <p className="patient-detail">Hash: {c.credential_hash.substring(0, 12)}...</p>
                          {c.passport_id !== undefined && c.passport_id !== null && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewNft(c); }}
                              className="patient-detail"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                            >
                              <Award size={14} /> Health Passport NFT #{c.passport_id}
                            </button>
                          )}
                        </div>
                        <div className="card-footer">
                          <span>Issued: {new Date(c.issue_date * 1000).toLocaleDateString()}</span>
                          <span>Exp: {c.expiry_date === 0 ? "Never" : new Date(c.expiry_date * 1000).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Sidebar: Travel compliance & Selected detail */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Travel Compliance Widget */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Globe size={18} style={{ color: 'var(--color-primary)' }} />
                    Travel Compliance Check
                  </h3>
                  <div className="compliance-checker">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Destination Country</label>
                      <select 
                        value={selectedCountry} 
                        onChange={(e) => {
                          setSelectedCountry(e.target.value);
                          setComplianceResult(null);
                        }}
                      >
                        {COUNTRIES.map((country) => (
                          <option key={country} value={country}>
                            {COUNTRY_LABELS[country] || country}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button onClick={handleCheckTravel} className="btn btn-primary" style={{ width: '100%' }}>
                      Run Travel Engine
                    </button>

                    {complianceResult?.checked && (
                      <div className={`compliance-status ${complianceResult.eligible ? "verified" : "failed"}`}>
                        {complianceResult.eligible ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                        <div>
                          <p style={{ fontSize: '0.9rem' }}>{complianceResult.eligible ? "Eligible to Enter" : "Ineligible to Enter"}</p>
                          <p style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>{complianceResult.details}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ZK Proof generator modal-panel */}
                {selectedCred && (
                  <div className="glass-panel pulse-glow" style={{ border: '1px solid var(--color-primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>ZK Proof Engine</h3>
                      <button onClick={() => setSelectedCred(null)} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>Close</button>
                    </div>

                    <div style={{ fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <p><strong>Selected Credential:</strong> {selectedCred.vaccine_type}</p>
                      <p><strong>Registry Status:</strong> {selectedCred.status}</p>
                      {selectedCred.passport_id !== undefined && selectedCred.passport_id !== null && (
                        <button
                          onClick={() => handleViewNft(selectedCred)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                        >
                          <Award size={14} /> Health Passport NFT #{selectedCred.passport_id}
                        </button>
                      )}
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Commitment: {selectedCred.credential_hash}</p>
                    </div>

                    {!generatedProof ? (
                      <button onClick={() => handleGenerateProof(selectedCred)} className="btn btn-primary" style={{ width: '100%', gap: '0.5rem' }}>
                        <Cpu size={16} /> Generate ZK Proof
                      </button>
                    ) : (
                      <div className="qr-view-container" style={{ padding: 0 }}>
                        <div className="qr-box" style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', marginBottom: '1rem' }}>
                          {/* Simulated Canvas QR representing Noir satisfying assignment */}
                          <div style={{ width: '150px', height: '150px', background: '#000000', display: 'flex', flexWrap: 'wrap', contentVisibility: 'auto' }}>
                            {Array.from({ length: 400 }).map((_, idx) => (
                              <div 
                                key={idx} 
                                style={{ 
                                  width: '7.5px', 
                                  height: '7.5px', 
                                  background: (idx % 2 === 0 && idx % 3 !== 0 && idx % 5 !== 0) || idx < 45 || idx > 355 || (idx % 20 < 4) ? '#000000' : '#fff'
                                }}
                              />
                            ))}
                          </div>
                        </div>

                        <div style={{ width: '100%', textAlign: 'left', background: '#000000', padding: '0.75rem', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginBottom: '1rem' }}>
                          <p style={{ color: 'var(--color-success)', fontWeight: 700, marginBottom: '4px' }}>ZK PROOF CONSTRUCTED</p>
                          <p style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>Hash: {generatedProof.proof_bytes.substring(0, 32)}...</p>
                        </div>

                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(proofQrValue);
                            toast.success("Proof QR payload copied to clipboard! Paste this in Verifier tab to test validation.");
                          }} 
                          className="btn btn-secondary" 
                          style={{ width: '100%', gap: '4px', fontSize: '0.8rem' }}
                        >
                          <QrCode size={14} /> Copy QR Payload
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= AI COMPLIANCE CHAT TAB ================= */}
        {activeTab === "chat" && (
          <div>
            <div className="hero" style={{ padding: '2rem 1rem' }}>
              <h2 className="hero-title">AI Compliance <span className="hero-gradient-text">Agent</span></h2>
              <p className="hero-subtitle" style={{ marginBottom: '1.5rem' }}>
                Our autonomous compliance agent handles natural language routing to list vaults, run destination travel policy calculations, inspect verification histories, and verify zero-knowledge assertions.
              </p>
            </div>

            <div className="glass-panel" style={{ maxWidth: '900px', margin: '0 auto' }}>
              <div className="chat-container">
                <div className="chat-messages">
                  {chatMessages.map((m, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <div className={`chat-message ${m.sender}`}>
                        <p style={{ whiteSpace: 'pre-line' }}>{m.text}</p>
                      </div>
                      
                      {/* Interactive Agent console traces */}
                      {m.tools && m.tools.length > 0 && (
                        <div className="agent-console" style={{ alignSelf: 'flex-start', maxWidth: '75%', width: '100%', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                          <button
                            onClick={() => setExpandedTraces(prev => ({ ...prev, [idx]: !prev[idx] }))}
                            className="agent-console-title"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', justifyContent: 'space-between', padding: 0, color: 'var(--color-primary)' }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Terminal size={12} />
                              {m.tools.length} agent action{m.tools.length > 1 ? "s" : ""}
                            </span>
                            {expandedTraces[idx] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>

                          {expandedTraces[idx] && (
                            <div style={{ marginTop: '0.5rem' }}>
                              {m.tools.map((t, tIdx) => (
                                <div key={tIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginBottom: '6px' }}>
                                  <div className="agent-console-row" style={{ color: 'var(--text-primary)' }}>
                                    <span style={{ fontWeight: 700 }}>{TOOL_LABELS[t.tool_name] || t.tool_name}</span>
                                    {summarizeArgs(t.tool_name, t.arguments) && (
                                      <span style={{ color: 'var(--color-primary)' }}>· {summarizeArgs(t.tool_name, t.arguments)}</span>
                                    )}
                                  </div>
                                  <div style={{ marginTop: '4px', paddingLeft: '4px' }}>
                                    {renderToolResult(t.tool_name, t.status, t.result)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {aiTyping && (
                    <div className="chat-message assistant" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Agent is routing tools</span>
                      <div className="thinking-dots" style={{ display: 'flex', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)' }}></span>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-accent)' }}></span>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)' }}></span>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                <div className="chat-input-area">
                  <input 
                    type="text" 
                    value={chatInput} 
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                    placeholder="Ask AI: 'Am I eligible to travel to Germany?' or 'Show my active health credentials'..." 
                    style={{ flex: 1 }}
                  />
                  <button onClick={handleSendChat} className="btn btn-primary" style={{ padding: '0.75rem 1.25rem' }}>
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= VERIFIER SCANNER TAB ================= */}
        {activeTab === "scanner" && (
          <div>
            <div className="hero" style={{ padding: '2rem 1rem' }}>
              <h2 className="hero-title">Decentralized <span className="hero-gradient-text">Verification</span></h2>
              <p className="hero-subtitle">
                Border officials and health verifiers scan the patient's passport QR code. The proof is validated cryptographically against Stellar Soroban commitments and revocation registry state.
              </p>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1.2fr 1.8fr' }}>
              <div className="glass-panel scanner-container">
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Proof Scanner</h3>
                
                <div className="scanner-viewfinder">
                  <div className="scanner-laser" />
                  <QrCode size={120} style={{ opacity: 0.15, color: 'var(--color-primary)' }} />
                </div>
                
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Paste QR Payload / Witness Data</label>
                    <textarea 
                      rows={3} 
                      value={verifyProofInput} 
                      onChange={(e) => setVerifyProofInput(e.target.value)}
                      placeholder='Pasted QR JSON object {"proof_hash": "...", "public_inputs": {...}}' 
                      style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Associated Credential ID (e.g. CRED-123456)</label>
                    <input 
                      type="text" 
                      value={verifyCredIdInput} 
                      onChange={(e) => setVerifyCredIdInput(e.target.value)}
                      placeholder='CRED-XXXXXX (Optional)' 
                    />
                  </div>
                  
                  <button onClick={handleVerifyProof} className="btn btn-primary" style={{ width: '100%' }}>
                    <Scan size={16} /> Verify ZK Passport
                  </button>
                </div>

                {verificationResult?.checked && (
                  <div className={`compliance-status ${verificationResult.verified ? "verified" : "failed"}`} style={{ width: '100%' }}>
                    {verificationResult.verified ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    <div>
                      <p style={{ fontSize: '0.9rem' }}>{verificationResult.verified ? "Passport VERIFIED" : "Verification FAILED"}</p>
                      {verificationResult.verified && verificationResult.vaccine_type && (
                        <p style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '4px' }}>
                          Certificate Type: {verificationResult.vaccine_type}
                        </p>
                      )}
                      <p style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>{verificationResult.details}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* History logs */}
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Verification Audit Logs</h3>
                  <button onClick={syncData} className="btn btn-secondary" style={{ padding: '6px' }}>
                    <RefreshCw size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      <History size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                      <p>No verification log history recorded.</p>
                    </div>
                  ) : (
                    history.map((h) => (
                      <div key={h.id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Verifier: {h.verifier_address.substring(0, 10)}...</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ID: {h.credential_id}</span>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{h.details}</p>
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{new Date(h.timestamp * 1000).toLocaleString()}</p>
                        </div>
                        <span className={`card-badge ${h.status === "Verified" ? "active" : "revoked"}`}>
                          {h.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= AUTHORITY PORTAL TAB ================= */}
        {activeTab === "issuer" && (
          <div>
            <div className="hero" style={{ padding: '2rem 1rem' }}>
              <h2 className="hero-title">Healthcare <span className="hero-gradient-text">Authority Portal</span></h2>
              <p className="hero-subtitle">
                Hospitals, laboratories, and health authorities issue credentials and manage cryptographic deactivations in the Revocation Registry.
              </p>
            </div>

            <div className="dashboard-grid">
              {/* Form left: issue credentials */}
              <div className="glass-panel">
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlusCircle size={20} style={{ color: 'var(--color-primary)' }} />
                  Issue Health Credential
                </h3>

                {userRole !== "issuer" && (
                  <div className="compliance-status failed" style={{ marginBottom: '1.5rem' }}>
                    <AlertCircle size={20} />
                    <p style={{ fontSize: '0.8rem' }}>
                      <strong>Warning:</strong> You are currently viewing as a <strong>{userRole}</strong>. The Soroban smart contract will reject this transaction unless your connected wallet is a registered issuer. Switch to <strong>Issuer View</strong> above, or register this wallet as an authority first.
                    </p>
                  </div>
                )}

                <form onSubmit={handleIssueCredential} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Credential ID (auto-generated)</label>
                      <input
                        type="text"
                        value={newCredForm.id}
                        readOnly
                        style={{ opacity: 0.7, cursor: 'not-allowed' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Patient Public Stellar Key</label>
                      <input 
                        type="text" 
                        required
                        value={newCredForm.patientAddress} 
                        onChange={(e) => setNewCredForm(prev => ({ ...prev, patientAddress: e.target.value }))}
                        placeholder="GD..." 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Patient Full Name</label>
                      <input 
                        type="text" 
                        required
                        value={newCredForm.name} 
                        onChange={(e) => setNewCredForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="John Doe" 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Date of Birth</label>
                      <input 
                        type="date" 
                        required
                        value={newCredForm.dob} 
                        onChange={(e) => setNewCredForm(prev => ({ ...prev, dob: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Vaccine / Certificate Type</label>
                      <select 
                        value={newCredForm.vaccineType} 
                        onChange={(e) => setNewCredForm(prev => ({ ...prev, vaccineType: e.target.value }))}
                      >
                        <option value="COVID-19 Vaccination">COVID-19 Vaccination</option>
                        <option value="COVID-19 Booster">COVID-19 Booster</option>
                        <option value="Yellow Fever Certificate">Yellow Fever Certificate</option>
                        <option value="Tuberculosis Clearance">Tuberculosis Clearance</option>
                        <option value="Hepatitis A Vaccination">Hepatitis A Vaccination</option>
                        <option value="Hepatitis B Vaccination">Hepatitis B Vaccination</option>
                        <option value="Typhoid Vaccination">Typhoid Vaccination</option>
                        <option value="Polio Vaccination">Polio Vaccination</option>
                        <option value="Measles, Mumps & Rubella (MMR)">Measles, Mumps & Rubella (MMR)</option>
                        <option value="Meningococcal Vaccination">Meningococcal Vaccination</option>
                        <option value="Rabies Vaccination">Rabies Vaccination</option>
                        <option value="Cholera Vaccination">Cholera Vaccination</option>
                        <option value="Tetanus & Diphtheria (Tdap)">Tetanus & Diphtheria (Tdap)</option>
                        <option value="Influenza Vaccination">Influenza Vaccination</option>
                        <option value="Japanese Encephalitis Vaccination">Japanese Encephalitis Vaccination</option>
                        <option value="Negative PCR Test (COVID-19)">Negative PCR Test (COVID-19)</option>
                        <option value="Negative Rapid Antigen Test">Negative Rapid Antigen Test</option>
                        <option value="General Health Clearance">General Health Clearance</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Vaccination Date</label>
                      <input 
                        type="date" 
                        required
                        value={newCredForm.vaccineDate} 
                        onChange={(e) => setNewCredForm(prev => ({ ...prev, vaccineDate: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Patient Secret Preimage (for ZK Vault)</label>
                      <input 
                        type="text" 
                        value={newCredForm.patientSecret} 
                        onChange={(e) => setNewCredForm(prev => ({ ...prev, patientSecret: e.target.value }))}
                        placeholder="Leave blank to auto-generate" 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Credential Expiry</label>
                      <select 
                        value={newCredForm.expiryDays} 
                        onChange={(e) => setNewCredForm(prev => ({ ...prev, expiryDays: e.target.value }))}
                      >
                        <option value="90">90 Days</option>
                        <option value="180">180 Days</option>
                        <option value="365">1 Year</option>
                        <option value="1825">5 Years</option>
                      </select>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                    Mint Health Passport NFT & Commit Hash
                  </button>
                </form>
              </div>

              {/* Right panel: Revocation panel and registered list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Active registry list for revokes */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.10rem', fontWeight: 700, marginBottom: '1.25rem' }}>Revocation Registry Manager</h3>
                  
                  {credentials.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No active credentials registered to manage.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {credentials.map((c) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div>
                            <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.name} - {c.vaccine_type.substring(0, 12)}...</p>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Hash: {c.credential_hash.substring(0, 10)}...</p>
                          </div>
                          {c.status === "Active" ? (
                            <button 
                              onClick={() => handleRevoke(c.credential_hash)} 
                              className="btn btn-danger" 
                              style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '2px' }}
                            >
                              <Trash2 size={12} /> Revoke
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-error)', fontWeight: 700 }}>REVOKED</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Admin Issuer Registration Widget */}
                {userRole === "admin" && (
                  <div className="glass-panel" style={{ border: '1px solid var(--color-accent)' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-accent)' }}>
                      Register Health Authority
                    </h3>
                    <form onSubmit={handleRegisterIssuer} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Stellar Account Address</label>
                        <input 
                          type="text" 
                          required
                          value={newIssuerForm.walletAddress} 
                          onChange={(e) => setNewIssuerForm(prev => ({ ...prev, walletAddress: e.target.value }))}
                          placeholder="GC..." 
                          style={{ padding: '0.5rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Hospital Name</label>
                        <input 
                          type="text" 
                          required
                          value={newIssuerForm.organizationName} 
                          onChange={(e) => setNewIssuerForm(prev => ({ ...prev, organizationName: e.target.value }))}
                          placeholder="Berlin General" 
                          style={{ padding: '0.5rem' }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Numeric ID</label>
                          <input 
                            type="number" 
                            required
                            value={newIssuerForm.id} 
                            onChange={(e) => setNewIssuerForm(prev => ({ ...prev, id: e.target.value }))}
                            placeholder="e.g. 104" 
                            style={{ padding: '0.5rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Country</label>
                          <input 
                            type="text" 
                            required
                            value={newIssuerForm.country} 
                            onChange={(e) => setNewIssuerForm(prev => ({ ...prev, country: e.target.value }))}
                            placeholder="Germany" 
                            style={{ padding: '0.5rem' }}
                          />
                        </div>
                      </div>
                      <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                        Register Authority
                      </button>
                    </form>
                  </div>
                )}

                {/* Show active registered authorities */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.10rem', fontWeight: 700, marginBottom: '0.75rem' }}>Authorized Issuers</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {issuers.map((i) => (
                      <div key={i.wallet_address} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: i.is_active ? 1 : 0.5 }}>
                        <span><strong>{i.organization_name}</strong> ({i.country})</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{i.wallet_address.substring(0, 6)}...</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', padding: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
        <p>© 2026 ZK Health Passport. Secured by Stellar Soroban & Noir ZK Engine.</p>
      </footer>
    </div>
  );
}
