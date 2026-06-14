use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

mod db;
mod services {
    pub mod soroban;
    pub mod zk;
    pub mod ai_agent;
    pub mod groq_client;
    pub mod nargo_runner;
}
mod routes;

use db::Database;
use services::soroban::SorobanClient;
use services::ai_agent::AiAgent;
use routes::{AppState, create_router};

#[tokio::main]
async fn main() {
    // 1. Load .env (project root) and initialize logging
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    // 2. Initialize Database & Encryption Key
    let db_path = std::env::var("DATABASE_PATH")
        .unwrap_or_else(|_| "validfi.db".to_string());
    
    // 32-byte master key in hex (64 chars) for AES-256 local storage
    let master_key_hex = std::env::var("VALIDFI_MASTER_KEY")
        .unwrap_or_else(|_| "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string());

    println!("Initializing Database at: {}", db_path);
    let db = Database::new(&db_path, &master_key_hex);

    // 3. Initialize Soroban Smart Contract Client & AI Agent
    let soroban = SorobanClient::new(db.clone());
    let ai_agent = Arc::new(AiAgent::new(db.clone(), SorobanClient::new(db.clone())));

    // Pre-populate with a default Issuer for demo purposes if database is empty
    if let Ok(true) = db.is_authorized_issuer("GCISSUER1234567890HEALTHAUTHORITYVALIDFI0001") {
        // Already registered
    } else {
        let _ = db.register_issuer(
            "GCISSUER1234567890HEALTHAUTHORITYVALIDFI0001",
            101,
            "Berlin General Hospital",
            "Germany",
        );
        let _ = db.register_issuer(
            "GCISSUER000000000000000HEALTHAUTHORITYVALIDFI0002",
            102,
            "St. Luke Medical Center",
            "Japan",
        );
        println!("Registered default health authorities (Berlin General & St. Luke)");
    }

    // 4. Setup State & Router
    let state = AppState {
        db,
        soroban,
        ai_agent,
    };

    // Configure CORS to allow Next.js frontend connection
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(Any)
        .allow_methods(Any);

    let app = create_router(state).layer(cors);

    // 5. Start Server
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .unwrap();

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("ZK Health Passport Backend starting on: http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
