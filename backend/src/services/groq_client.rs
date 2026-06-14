use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const GROQ_API_URL: &str = "https://api.groq.com/openai/v1/chat/completions";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    pub fn system(text: impl Into<String>) -> Self {
        ChatMessage { role: "system".into(), content: Some(text.into()), tool_calls: None, tool_call_id: None }
    }

    pub fn user(text: impl Into<String>) -> Self {
        ChatMessage { role: "user".into(), content: Some(text.into()), tool_calls: None, tool_call_id: None }
    }

    pub fn tool_result(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        ChatMessage { role: "tool".into(), content: Some(content.into()), tool_calls: None, tool_call_id: Some(tool_call_id.into()) }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Serialize, Debug)]
pub struct ToolDef {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDef,
}

#[derive(Serialize, Debug)]
pub struct FunctionDef {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

impl ToolDef {
    pub fn new(name: &str, description: &str, parameters: Value) -> Self {
        ToolDef {
            tool_type: "function".into(),
            function: FunctionDef {
                name: name.to_string(),
                description: description.to_string(),
                parameters,
            },
        }
    }
}

#[derive(Serialize, Debug)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<&'a [ToolDef]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<&'a str>,
    temperature: f32,
}

#[derive(Deserialize, Debug)]
struct ChatCompletion {
    choices: Vec<Choice>,
}

#[derive(Deserialize, Debug)]
struct Choice {
    message: ChatMessage,
}

pub struct GroqClient {
    api_key: String,
    model: String,
    client: reqwest::Client,
}

impl GroqClient {
    pub fn new(api_key: String, model: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap();
        GroqClient { api_key, model, client }
    }

    pub async fn chat(&self, messages: &[ChatMessage], tools: &[ToolDef]) -> Result<ChatMessage, String> {
        let body = ChatRequest {
            model: &self.model,
            messages,
            tools: if tools.is_empty() { None } else { Some(tools) },
            tool_choice: if tools.is_empty() { None } else { Some("auto") },
            temperature: 0.3,
        };

        let res = self
            .client
            .post(GROQ_API_URL)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Groq request failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("Groq API error ({}): {}", status, err_text));
        }

        let parsed: ChatCompletion = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse Groq response: {}", e))?;

        parsed
            .choices
            .into_iter()
            .next()
            .map(|c| c.message)
            .ok_or_else(|| "Groq returned no choices".to_string())
    }
}
