"use client";

import { useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles, Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

const MAX_TILT = 0.14; // ~8 degrees
const AXIAL_TILT = 0.35; // ~20 degrees, like a tilted planet

const GLOBE_RADIUS = 1.4;
const DOT_RADIUS = GLOBE_RADIUS * 1.01;
const DOT_COUNT = 8000;

type Pointer = { x: number; y: number };

// Rough lat/lon "blobs" (degrees) approximating the continents, used to
// decide which points on the sphere become landmass dots.
const LAND_BLOBS: { lat: number; lon: number; r: number }[] = [
  // North America
  { lat: 62, lon: -110, r: 17 },
  { lat: 45, lon: -100, r: 14 },
  { lat: 30, lon: -100, r: 10 },
  { lat: 18, lon: -92, r: 6 },
  { lat: 50, lon: -65, r: 8 },
  { lat: 75, lon: -42, r: 6 }, // Greenland
  // South America
  { lat: 2, lon: -62, r: 11 },
  { lat: -18, lon: -62, r: 10 },
  { lat: -40, lon: -67, r: 8 },
  // Europe
  { lat: 50, lon: 12, r: 9 },
  { lat: 58, lon: 32, r: 9 },
  { lat: 63, lon: 18, r: 6 },
  // Africa
  { lat: 18, lon: 18, r: 13 },
  { lat: -2, lon: 22, r: 12 },
  { lat: -25, lon: 25, r: 10 },
  { lat: -19, lon: 47, r: 4 }, // Madagascar
  // Asia
  { lat: 58, lon: 65, r: 14 },
  { lat: 60, lon: 105, r: 16 },
  { lat: 35, lon: 80, r: 12 },
  { lat: 32, lon: 105, r: 10 },
  { lat: 22, lon: 80, r: 9 },
  { lat: 12, lon: 108, r: 7 },
  { lat: 38, lon: 45, r: 6 },
  { lat: 36, lon: 138, r: 4 }, // Japan
  // Australia
  { lat: -25, lon: 134, r: 10 },
];

function hash2(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function isLand(latDeg: number, lonDeg: number) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const edgeJitter = (hash2(latDeg, lonDeg) - 0.5) * 4;

  for (const blob of LAND_BLOBS) {
    const blat = (blob.lat * Math.PI) / 180;
    const blon = (blob.lon * Math.PI) / 180;
    const cosD = Math.sin(lat) * Math.sin(blat) + Math.cos(lat) * Math.cos(blat) * Math.cos(lon - blon);
    const dDeg = (Math.acos(Math.min(1, Math.max(-1, cosD))) * 180) / Math.PI;
    if (dDeg < blob.r + edgeJitter) return true;
  }
  return false;
}

function useGlobeDots(count: number) {
  return useMemo(() => {
    const points: number[] = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      const lat = (Math.asin(y) * 180) / Math.PI;
      const lon = (Math.atan2(z, x) * 180) / Math.PI;

      if (isLand(lat, lon)) {
        points.push(x * DOT_RADIUS, y * DOT_RADIUS, z * DOT_RADIUS);
      }
    }

    return new Float32Array(points);
  }, [count]);
}

function Globe({ pointer }: { pointer: RefObject<Pointer> }) {
  const groupRef = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const tilt = useRef({ x: 0, y: 0 });
  const dotPositions = useGlobeDots(DOT_COUNT);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    spin.current += delta * 0.3;

    const targetTiltX = pointer.current.y * MAX_TILT;
    const targetTiltY = pointer.current.x * MAX_TILT;
    tilt.current.x += (targetTiltX - tilt.current.x) * 0.05;
    tilt.current.y += (targetTiltY - tilt.current.y) * 0.05;

    group.rotation.x = AXIAL_TILT + tilt.current.x;
    group.rotation.y = spin.current + tilt.current.y;
    group.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.12;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 48, 48]} />
        <meshStandardMaterial color="#0d0d0d" roughness={0.65} metalness={0.1} />
      </mesh>
      <Points positions={dotPositions}>
        <PointMaterial transparent color="#ffffff" size={0.022} sizeAttenuation depthWrite={false} />
      </Points>
    </group>
  );
}

export default function HeroSphere({ pointer }: { pointer: RefObject<Pointer> }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 0, 4.4], fov: 38 }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 2, 5]} intensity={2.2} color="#ffffff" />
      <pointLight position={[-4, -2, 3]} intensity={0.6} color="#ffffff" />
      <Globe pointer={pointer} />
      <Sparkles count={60} scale={3.6} size={4} speed={0.3} color="#ffffff" opacity={0.8} />
      <Sparkles count={30} scale={3.2} size={6} speed={0.2} color="#ffffff" opacity={0.4} />
    </Canvas>
  );
}
