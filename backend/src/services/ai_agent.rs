use crate::db::Database;
use crate::services::groq_client::{ChatMessage, GroqClient, ToolDef};
use crate::services::soroban::SorobanClient;
use crate::services::zk::ZkEngine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolCallLog {
    pub tool_name: String,
    pub arguments: String,
    pub status: String,
    pub result: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgentResponse {
    pub text: String,
    pub tools_called: Vec<ToolCallLog>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TravelComplianceResult {
    pub country: String,
    pub known_system_rule: Option<String>,
    pub active_vaccine_credentials: Vec<String>,
}

const MAX_TOOL_ROUNDS: usize = 4;

pub struct AiAgent {
    db: Database,
    soroban: SorobanClient,
    groq: Option<GroqClient>,
}

impl AiAgent {
    pub fn new(db: Database, soroban: SorobanClient) -> Self {
        let groq = std::env::var("GROQ_API_KEY")
            .ok()
            .filter(|key| !key.is_empty())
            .map(|key| {
                let model = std::env::var("GROQ_MODEL")
                    .unwrap_or_else(|_| "llama-3.3-70b-versatile".to_string());
                GroqClient::new(key, model)
            });

        AiAgent { db, soroban, groq }
    }

    pub async fn process_chat(&self, user_message: &str, user_address: &str, is_authority: bool) -> AgentResponse {
        let groq = match &self.groq {
            Some(g) => g,
            None => {
                return AgentResponse {
                    text: "The AI assistant isn't configured yet. Set GROQ_API_KEY in the project's .env file and restart the backend to enable natural-language chat.".to_string(),
                    tools_called: vec![],
                };
            }
        };

        let tools = self.tool_definitions(is_authority);
        let mut messages = vec![
            ChatMessage::system(self.system_prompt(user_address, is_authority)),
            ChatMessage::user(user_message),
        ];

        let mut tools_called = Vec::new();

        for _ in 0..MAX_TOOL_ROUNDS {
            let reply = match groq.chat(&messages, &tools).await {
                Ok(r) => r,
                Err(e) => {
                    return AgentResponse {
                        text: format!("Sorry, I couldn't reach the AI service: {}", e),
                        tools_called,
                    };
                }
            };

            let calls = reply.tool_calls.clone().unwrap_or_default();
            if calls.is_empty() {
                let text = reply
                    .content
                    .clone()
                    .unwrap_or_else(|| "I'm not sure how to respond to that.".to_string());
                return AgentResponse { text, tools_called };
            }

            messages.push(reply);

            for call in calls {
                let args: Value = serde_json::from_str(&call.function.arguments).unwrap_or_else(|_| json!({}));
                let result = self.execute_tool(&call.function.name, &args, user_address).await;

                let (status, result_value) = match &result {
                    Ok(v) => ("success".to_string(), v.clone()),
                    Err(e) => ("failed".to_string(), json!({ "error": e })),
                };

                tools_called.push(ToolCallLog {
                    tool_name: call.function.name.clone(),
                    arguments: call.function.arguments.clone(),
                    status,
                    result: result_value.clone(),
                });

                messages.push(ChatMessage::tool_result(call.id, result_value.to_string()));
            }
        }

        AgentResponse {
            text: "I had trouble completing that request after several tool calls. Could you try rephrasing?".to_string(),
            tools_called,
        }
    }

    fn system_prompt(&self, user_address: &str, is_authority: bool) -> String {
        let role_desc = if is_authority {
            "they are currently viewing the app as an authorized Health Authority (issuer) - they can see credentials they've issued and the revocation registry"
        } else {
            "they are currently viewing the app as a patient - they can see credentials held in their own vault"
        };

        format!(
            "You are the ValidFi AI assistant for a Zero-Knowledge Health Passport app built on Stellar Soroban. \
            The connected wallet address is {user_address}, and {role_desc}. \
            For questions about the user's own credentials, proofs, revocation status, or verification history, \
            always use the provided tools to look up real data - never invent IDs, hashes, statuses, or dates. \
            For general questions about a destination country's vaccination entry requirements, you may draw on \
            your own knowledge, but always call check_travel_eligibility first to see the user's active vaccine \
            credentials (and any system-defined rule for that country) and compare them against those \
            requirements yourself. Remind the user that official entry requirements can change and should be \
            confirmed with the destination country's embassy or health authority before travel. \
            If a tool returns an error, explain it to the user in plain language and suggest a next step (e.g. \
            issue a new credential, or check the Authority Portal). \
            Keep replies concise and conversational. Do not use markdown formatting such as asterisks, bullet \
            characters, or headers, since the chat UI renders plain text."
        )
    }

    fn tool_definitions(&self, is_authority: bool) -> Vec<ToolDef> {
        let empty_params = json!({ "type": "object", "properties": {}, "required": [] });

        let mut tools = vec![
            ToolDef::new(
                "list_my_credentials",
                "List the health credentials held in the current user's vault as a patient: vaccine type, status (Active/Revoked), issuer address, credential ID, issue date and expiry date.",
                empty_params.clone(),
            ),
            ToolDef::new(
                "check_travel_eligibility",
                "Look up the current user's active vaccine credentials, plus any system-defined entry rule for a destination country (if one exists). Use this alongside your own knowledge of that country's vaccination entry requirements to assess the user's eligibility.",
                json!({
                    "type": "object",
                    "properties": {
                        "country": {
                            "type": "string",
                            "description": "Destination country name, e.g. Germany, Japan, or Canada"
                        }
                    },
                    "required": ["country"]
                }),
            ),
            ToolDef::new(
                "generate_zk_proof",
                "Generate a zero-knowledge proof for one of the current user's credentials. Proves an authorized issuer signed the credential without revealing the patient's name, DOB, or other personal details. Call list_my_credentials first if the credential ID is unknown.",
                json!({
                    "type": "object",
                    "properties": {
                        "credential_id": {
                            "type": "string",
                            "description": "The credential ID, e.g. CRED-7701"
                        }
                    },
                    "required": ["credential_id"]
                }),
            ),
            ToolDef::new(
                "get_verification_history",
                "Get the recent audit log of ZK proof verification attempts: which verifier checked which proof, and whether it passed or failed.",
                empty_params.clone(),
            ),
            ToolDef::new(
                "check_revocation_status",
                "Check whether a specific credential commitment hash has been revoked in the on-chain Revocation Registry.",
                json!({
                    "type": "object",
                    "properties": {
                        "credential_hash": {
                            "type": "string",
                            "description": "The 64-character hex credential commitment hash"
                        }
                    },
                    "required": ["credential_hash"]
                }),
            ),
        ];

        if is_authority {
            tools.push(ToolDef::new(
                "list_issued_credentials",
                "List the health credentials issued by the current user's wallet acting as a health authority: credential ID, patient address, status, issue date and expiry date.",
                empty_params,
            ));
        }

        tools
    }

    async fn execute_tool(&self, name: &str, args: &Value, user_address: &str) -> Result<Value, String> {
        match name {
            "list_my_credentials" => {
                let creds = self.db.list_credentials_by_patient(user_address).map_err(|e| e.to_string())?;
                Ok(json!({ "credentials": creds }))
            }

            "list_issued_credentials" => {
                let creds = self.db.list_credentials_by_issuer(user_address).map_err(|e| e.to_string())?;
                Ok(json!({ "credentials": creds }))
            }

            "check_travel_eligibility" => {
                let country = args.get("country").and_then(|v| v.as_str()).unwrap_or("");
                let result = self.check_travel_requirements(country, user_address);
                Ok(json!(result))
            }

            "generate_zk_proof" => {
                let credential_id = args
                    .get("credential_id")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing credential_id argument")?;

                let cred = self
                    .db
                    .get_credential(credential_id)
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| format!("No credential found with id {}", credential_id))?;

                if cred["patient_address"].as_str() != Some(user_address) {
                    return Err("That credential does not belong to the connected wallet's vault.".to_string());
                }

                let issuer = cred["issuer"].as_str().unwrap_or("");
                let (_priv, pub_x, pub_y) = self.db.get_or_create_issuer_keypair(issuer).map_err(|e| e.to_string())?;

                let proof = ZkEngine::generate_proof(
                    cred["patient_secret"].as_str().unwrap_or(""),
                    cred["name"].as_str().unwrap_or(""),
                    cred["dob"].as_str().unwrap_or(""),
                    cred["vaccine_type"].as_str().unwrap_or(""),
                    cred["vaccine_date"].as_str().unwrap_or(""),
                    cred["issuer_signature"].as_str().unwrap_or(""),
                    &pub_x,
                    &pub_y,
                )?;

                Ok(json!(proof))
            }

            "get_verification_history" => {
                let history = self.db.list_verification_history().map_err(|e| e.to_string())?;
                let recent: Vec<Value> = history.into_iter().take(10).collect();
                Ok(json!({ "history": recent }))
            }

            "check_revocation_status" => {
                let hash = args
                    .get("credential_hash")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing credential_hash argument")?;
                let revoked = self.soroban.check_revocation(hash).await.unwrap_or(false);
                Ok(json!({ "credential_hash": hash, "revoked": revoked }))
            }

            other => Err(format!("Unknown tool: {}", other)),
        }
    }

    fn check_travel_requirements(&self, country: &str, user_address: &str) -> TravelComplianceResult {
        let creds = self.db.list_credentials_by_patient(user_address).unwrap_or_default();

        let known_system_rule = match country {
            "Germany" => Some("Requires active COVID-19 vaccine OR Yellow Fever vaccine."),
            "Japan" => Some("Requires active COVID-19 vaccine."),
            _ => None,
        };

        let active_vaccine_credentials: Vec<String> = creds
            .into_iter()
            .filter(|c| c["status"].as_str() == Some("Active"))
            .map(|c| c["vaccine_type"].as_str().unwrap_or("").to_string())
            .collect();

        TravelComplianceResult {
            country: country.to_string(),
            known_system_rule: known_system_rule.map(|s| s.to_string()),
            active_vaccine_credentials,
        }
    }
}
