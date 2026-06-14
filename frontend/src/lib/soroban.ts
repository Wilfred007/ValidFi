import {
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";

export const CONTRACTS = {
  issuerRegistry: process.env.NEXT_PUBLIC_CONTRACT_ISSUER_REGISTRY || "",
  credentialRegistry: process.env.NEXT_PUBLIC_CONTRACT_CREDENTIAL_REGISTRY || "",
  revocationRegistry: process.env.NEXT_PUBLIC_CONTRACT_REVOCATION_REGISTRY || "",
  nft: process.env.NEXT_PUBLIC_CONTRACT_NFT || "",
};

export const server = () => new rpc.Server(RPC_URL);

// --- ScVal converters ---

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

export const scBytes32 = (hex: string) => nativeToScVal(hexToBytes(hex), { type: "bytes" });
export const scAddress = (address: string) => new Address(address).toScVal();
export const scU32 = (n: number) => nativeToScVal(n, { type: "u32" });
export const scU64 = (n: number) => nativeToScVal(n, { type: "u64" });
export const scString = (s: string) => nativeToScVal(s, { type: "string" });

// --- Transaction helpers ---

async function buildTx(contractId: string, method: string, args: xdr.ScVal[], sourceAddress: string) {
  const s = server();
  const account = await s.getAccount(sourceAddress);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();
  return { server: s, tx };
}

/**
 * Simulate a read-only contract call (no signing, no submission).
 */
export async function simulateRead<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string
): Promise<T> {
  const { server: s, tx } = await buildTx(contractId, method, args, sourceAddress);
  const sim = await s.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
    return scValToNative(sim.result.retval) as T;
  }
  throw new Error("Simulation returned no result");
}

/**
 * Build, simulate, sign (via Freighter), submit and confirm a contract call.
 * Returns the decoded return value plus the transaction hash.
 */
export async function invokeAndConfirm<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string
): Promise<{ result: T; hash: string }> {
  const { server: s, tx } = await buildTx(contractId, method, args, sourceAddress);

  let prepared;
  try {
    prepared = await s.prepareTransaction(tx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Transaction simulation failed: ${msg}`);
  }

  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: sourceAddress,
  });
  if (signed.error) {
    throw new Error(`Freighter signing failed: ${signed.error}`);
  }

  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE);
  const sendResponse = await s.sendTransaction(signedTx);

  if (sendResponse.status === "ERROR") {
    throw new Error(`Transaction submission failed: ${JSON.stringify(sendResponse.errorResult)}`);
  }

  let getResponse = await s.getTransaction(sendResponse.hash);
  const start = Date.now();
  while (getResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    if (Date.now() - start > 30000) {
      throw new Error("Timed out waiting for transaction confirmation");
    }
    await new Promise((r) => setTimeout(r, 1500));
    getResponse = await s.getTransaction(sendResponse.hash);
  }

  if (getResponse.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed on-chain (hash ${sendResponse.hash})`);
  }

  const result =
    "returnValue" in getResponse && getResponse.returnValue !== undefined
      ? (scValToNative(getResponse.returnValue) as T)
      : (undefined as T);

  return { result, hash: sendResponse.hash };
}
