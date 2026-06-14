"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { Fade } from "react-awesome-reveal";
import {
  ShieldCheck,
  ArrowRight,
  KeyRound,
  ShieldAlert,
  Wallet,
  Bot,
  ScanLine,
  BarChart3,
} from "lucide-react";

const HeroSphere = dynamic(() => import("@/components/HeroSphere"), {
  ssr: false,
  loading: () => <div className="hero-sphere-fallback" />,
});

const features = [
  {
    icon: KeyRound,
    title: "Zero-Knowledge Proofs",
    description:
      "Generate cryptographic proofs of vaccination status without revealing your name, date of birth, or medical history.",
  },
  {
    icon: ShieldAlert,
    title: "On-Chain Revocation Registry",
    description:
      "Health authorities can instantly revoke compromised or expired credentials on Soroban's revocation registry.",
  },
  {
    icon: Wallet,
    title: "Freighter-Native Signing",
    description:
      "Every credential, proof, and revocation is signed by your own Stellar wallet — no custodial keys, ever.",
  },
  {
    icon: Bot,
    title: "AI Compliance Assistant",
    description:
      "Ask natural-language questions about travel eligibility, proof status, and your verification history.",
  },
  {
    icon: ScanLine,
    title: "Instant Verifier Scanner",
    description:
      "Border agents and employers scan a QR code and verify proofs in seconds — with zero personal data exposed.",
  },
  {
    icon: BarChart3,
    title: "System-Wide Dashboard",
    description:
      "Real-time analytics across every issued credential, health authority, and verification event.",
  },
];

const steps = [
  {
    title: "Authority Issues a Credential",
    description:
      "A registered health authority signs and issues an encrypted credential, minting a ZK commitment and a Health Passport NFT on-chain.",
  },
  {
    title: "Patient Stores it Securely",
    description:
      "The encrypted credential lands in your personal vault, accessible only with your Freighter wallet.",
  },
  {
    title: "Generate a ZK Proof",
    description:
      'Prove your status — e.g. "fully vaccinated" — without revealing the underlying data, and share it as a QR code.',
  },
  {
    title: "Instant Verification",
    description:
      "Verifiers scan the proof and get a pass/fail result in seconds, with every check logged to the audit history.",
  },
];

export default function LandingPage() {
  const pointer = useRef({ x: 0, y: 0 });
  const [showSphere, setShowSphere] = useState(false);

  useEffect(() => {
    const checkSize = () => setShowSphere(window.innerWidth >= 768);
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  useEffect(() => {
    let raf = 0;
    let curX = 0;
    let curY = 0;

    const handleMove = (e: MouseEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const tick = () => {
      curX += (pointer.current.x - curX) * 0.08;
      curY += (pointer.current.y - curY) * 0.08;
      document.documentElement.style.setProperty("--mx", curX.toFixed(4));
      document.documentElement.style.setProperty("--my", curY.toFixed(4));
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", handleMove);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="app-container">
      <div className="bg-orbs" aria-hidden="true">
        <div className="bg-orb-wrap bg-orb-1-wrap"><div className="bg-orb bg-orb-1" /></div>
        <div className="bg-orb-wrap bg-orb-2-wrap"><div className="bg-orb bg-orb-2" /></div>
        <div className="bg-orb-wrap bg-orb-3-wrap"><div className="bg-orb bg-orb-3" /></div>
      </div>

      <header className="header">
        <Link href="/" className="logo-group" style={{ textDecoration: "none" }}>
          <ShieldCheck size={28} className="logo-badge" style={{ padding: 0, border: "none", background: "transparent" }} />
          <h1 className="logo-text">ValidFi</h1>
        </Link>
        <nav className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#how-it-works" className="nav-link">How it Works</a>
          <Link href="/app" className="btn btn-primary">
            Launch App <ArrowRight size={16} />
          </Link>
        </nav>
      </header>

      <main className="main-content">
        <section className="landing-hero">
          <div className="hero-left">
            <Fade delay={200} damping={0.4} duration={800} triggerOnce cascade>
              <h1 className="hero-title">
                Prove your health status.
                <br />
                <span className="hero-gradient-text">Without sharing your data.</span>
              </h1>
              <p className="hero-subtitle">
                ValidFi issues tamper-proof, encrypted health credentials on Stellar Soroban and lets you prove
                vaccination status with zero-knowledge proofs — no names, no birthdates, and no medical history
                exposed to anyone but you.
              </p>
              <div className="landing-hero-actions">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} style={{ display: "inline-block" }}>
                  <Link href="/app" className="btn btn-primary btn-lg">
                    Launch App <ArrowRight size={18} />
                  </Link>
                </motion.div>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} style={{ display: "inline-block" }}>
                  <a href="#how-it-works" className="btn btn-secondary btn-lg">
                    How it Works
                  </a>
                </motion.div>
              </div>
            </Fade>
          </div>

          <div className="hero-sphere-wrap">
            {showSphere ? <HeroSphere pointer={pointer} /> : <div className="hero-sphere-fallback" />}
          </div>
        </section>

        <section id="features" className="landing-section">
          <Fade delay={200} damping={0.4} duration={800} triggerOnce cascade>
            <h2 className="landing-section-title">Everything you need for verifiable health credentials</h2>
            <p className="landing-section-subtitle">
              A full Soroban-native stack — issuance, storage, proofs, verification, and revocation — wrapped
              in one privacy-first experience.
            </p>
            <div className="feature-grid">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="glass-panel feature-card">
                    <div className="feature-icon"><Icon size={22} /></div>
                    <h3>{f.title}</h3>
                    <p>{f.description}</p>
                  </div>
                );
              })}
            </div>
          </Fade>
        </section>

        <section id="how-it-works" className="landing-section">
          <Fade delay={200} damping={0.4} duration={800} triggerOnce cascade>
            <h2 className="landing-section-title">How ValidFi works</h2>
            <p className="landing-section-subtitle">
              From issuance to verification, every step is signed by a real Stellar wallet and backed by
              on-chain proofs.
            </p>
            <div className="steps-grid">
              {steps.map((s, i) => (
                <div key={s.title} className="glass-panel">
                  <div className="step-number">{i + 1}</div>
                  <h3>{s.title}</h3>
                  <p>{s.description}</p>
                </div>
              ))}
            </div>
          </Fade>
        </section>

        <section className="landing-section">
          <Fade delay={200} damping={0.4} duration={800} triggerOnce cascade>
            <div className="glass-panel landing-cta-panel">
              <h2 className="landing-section-title">Ready to take control of your health data?</h2>
              <p className="landing-section-subtitle">
                Connect your Freighter wallet to access your encrypted credential vault, AI compliance
                assistant, and verification dashboard.
              </p>
              <div className="landing-hero-actions">
                <Link href="/app" className="btn btn-primary btn-lg">
                  Launch App <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </Fade>
        </section>
      </main>

      <footer className="landing-footer">
        © 2026 ValidFi — ZK Health Passport. Secured by Stellar Soroban &amp; Noir ZK Engine.
      </footer>
    </div>
  );
}
