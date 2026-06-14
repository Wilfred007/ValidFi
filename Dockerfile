FROM rust:1.87-slim-bookworm AS builder

# System deps for rusqlite (bundled) and reqwest (TLS)
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    curl \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install noirup (Noir toolchain) and nargo
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
ENV PATH="/root/.nargo/bin:${PATH}"
RUN noirup

# Verify nargo is installed
RUN nargo --version

WORKDIR /app

# Copy workspace Cargo files first (layer-cache dependencies)
COPY Cargo.toml Cargo.lock ./
COPY backend/Cargo.toml backend/

# Copy contract crates so the workspace resolves (backend only needs their Cargo.toml for the workspace)
COPY contracts/issuer-registry/Cargo.toml contracts/issuer-registry/
COPY contracts/credential-registry/Cargo.toml contracts/credential-registry/
COPY contracts/revocation-registry/Cargo.toml contracts/revocation-registry/
COPY contracts/health-passport-nft/Cargo.toml contracts/health-passport-nft/

# Create stub lib.rs files so cargo can resolve the workspace without full source
RUN mkdir -p contracts/issuer-registry/src && echo "" > contracts/issuer-registry/src/lib.rs
RUN mkdir -p contracts/credential-registry/src && echo "" > contracts/credential-registry/src/lib.rs
RUN mkdir -p contracts/revocation-registry/src && echo "" > contracts/revocation-registry/src/lib.rs
RUN mkdir -p contracts/health-passport-nft/src && echo "" > contracts/health-passport-nft/src/lib.rs
RUN mkdir -p backend/src && echo "fn main() {}" > backend/src/main.rs

# Cache dependencies
RUN cargo build --release -p backend 2>/dev/null || true

# Now copy real source and rebuild
COPY backend/src backend/src
RUN cargo build --release -p backend

# ─── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy nargo from builder
COPY --from=builder /root/.nargo /root/.nargo
ENV PATH="/root/.nargo/bin:${PATH}"

# Copy compiled backend binary
COPY --from=builder /app/target/release/backend /usr/local/bin/backend

# Copy ZK circuits (needed at runtime for nargo execute)
COPY circuits /app/circuits

# Set working directory and circuits path
WORKDIR /app
RUN mkdir -p /app/data
ENV CIRCUITS_DIR=/app/circuits
ENV DATABASE_PATH=/app/data/validfi.db

# Railway injects PORT automatically
EXPOSE 8080

CMD ["backend"]
