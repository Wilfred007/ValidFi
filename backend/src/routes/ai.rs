use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use crate::routes::AppState;
use crate::services::ai_agent::AgentResponse;

#[derive(Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub user_address: String,
    pub is_authority: bool,
}

pub async fn ai_chat(
    State(state): State<AppState>,
    Json(payload): Json<ChatRequest>,
) -> Result<Json<AgentResponse>, (StatusCode, String)> {
    let response = state.ai_agent
        .process_chat(&payload.message, &payload.user_address, payload.is_authority)
        .await;
    Ok(Json(response))
}
