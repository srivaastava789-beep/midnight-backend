import React, { useState } from 'react';

interface MoonHeroProps {
  className?: string;
}

const NIGHT_STARS: Array<{ cx: number; cy: number; r: number; o: number }> = [
  { cx: 85, cy: 32, r: 0.8, o: 0.4 },
  { cx: 160, cy: 70, r: 0.6, o: 0.3 },
  { cx: 240, cy: 25, r: 1.0, o: 0.6 },
  { cx: 320, cy: 85, r: 0.7, o: 0.35 },
  { cx: 410, cy: 40, r: 0.9, o: 0.5 },
  { cx: 490, cy: 110, r: 0.6, o: 0.3 },
  { cx: 560, cy: 30, r: 1.1, o: 0.7 },
  { cx: 640, cy: 75, r: 0.8, o: 0.4 },
  { cx: 720, cy: 35, r: 0.7, o: 0.3 },
  { cx: 810, cy: 95, r: 0.9, o: 0.5 },
  { cx: 890, cy: 45, r: 0.7, o: 0.35 },
  { cx: 960, cy: 115, r: 0.6, o: 0.25 },
  { cx: 1040, cy: 30, r: 1.0, o: 0.6 },
  { cx: 1120, cy: 80, r: 0.7, o: 0.4 },
];

export const MoonHero: React.FC<MoonHeroProps> = ({ className = '' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  // Center coordinates for the celestial moon
  const moonCx = 960;
  const moonCy = 135;
  const moonR = 68;

  return (
    <div
      aria-hidden="true"
      data-testid="moon-hero"
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none ${className}`}
    >
      {/* Monochrome Celestial Atmosphere */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 75% 90% at 80% 45%, rgba(24, 24, 24, 0.75) 0%, rgba(16, 16, 16, 0.92) 50%, rgba(8, 8, 8, 0.98) 100%)',
        }}
      />

      <svg
        viewBox="0 0 1200 300"
        preserveAspectRatio="xMaxYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          {/* Moonlight Halo - monochrome */}
          <radialGradient id="celestialMoonHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#9CA3AF" stopOpacity="0.22" />
            <stop offset="35%" stopColor="#6B7280" stopOpacity="0.1" />
            <stop offset="70%" stopColor="#4B5563" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#111827" stopOpacity="0" />
          </radialGradient>

          {/* Lunar Sphere Shading - monochrome */}
          <radialGradient id="celestialMoonDisc" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#F9FAFB" stopOpacity="0.98" />
            <stop offset="45%" stopColor="#D1D5DB" stopOpacity="0.9" />
            <stop offset="78%" stopColor="#9CA3AF" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#374151" stopOpacity="0.95" />
          </radialGradient>

          <linearGradient id="celestialTerminator" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.15" />
            <stop offset="55%" stopColor="#1F2937" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0B0B0B" stopOpacity="0.75" />
          </linearGradient>

          <linearGradient id="celestialMist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F2937" stopOpacity="0" />
            <stop offset="70%" stopColor="#111827" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#111827" stopOpacity="0.98" />
          </linearGradient>

          {/* Fine lunar surface grain */}
          <filter id="lunarTexture" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" seed="5" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.8 0 0 0 0 0.8 0 0 0 0 0.8 0 0 0 0.14 0" in="noise" result="softNoise" />
            <feComposite in="softNoise" in2="SourceGraphic" operator="atop" />
          </filter>

          <clipPath id="moonDiscClip">
            <circle cx={moonCx} cy={moonCy} r={moonR} />
          </clipPath>
        </defs>

        {/* Night Stars */}
        {NIGHT_STARS.map((star, idx) => (
          <circle
            key={idx}
            cx={star.cx}
            cy={star.cy}
            r={star.r}
            fill="#D1D5DB"
            fillOpacity={star.o}
          />
        ))}

        {/* Soft Moonlight Glow */}
        <circle cx={moonCx} cy={moonCy} r={moonR * 3.4} fill="url(#celestialMoonHalo)" />
        <circle
          cx={moonCx}
          cy={moonCy}
          r={moonR * 1.5}
          fill="none"
          stroke="#9CA3AF"
          strokeOpacity="0.12"
          strokeWidth="1"
        />

        {/* Realistic Moon Disc with Maria & Craters */}
        <g clipPath="url(#moonDiscClip)">
          <circle cx={moonCx} cy={moonCy} r={moonR} fill="url(#celestialMoonDisc)" filter="url(#lunarTexture)" />
          {/* Ocean of Storms & Lunar Maria */}
          <ellipse cx={moonCx - 20} cy={moonCy - 14} rx={18} ry={13} fill="#6B7280" fillOpacity="0.32" />
          <circle cx={moonCx + 18} cy={moonCy + 15} r={17} fill="#4B5563" fillOpacity="0.35" />
          <circle cx={moonCx - 8} cy={moonCy + 26} r={10} fill="#6B7280" fillOpacity="0.28" />
          <circle cx={moonCx + 22} cy={moonCy - 20} r={7} fill="#9CA3AF" fillOpacity="0.25" />
          {/* Terminator Shadow */}
          <circle cx={moonCx} cy={moonCy} r={moonR} fill="url(#celestialTerminator)" />
        </g>

        {/* Crisp Moon Limb Highlight with subtle mint luminescence */}
        <circle
          cx={moonCx}
          cy={moonCy}
          r={moonR}
          fill="none"
          stroke="#D1D5DB"
          strokeOpacity="0.35"
          strokeWidth="0.8"
        />

        {/* Lower Atmospheric Horizon Fog */}
        <rect x="0" y="180" width="1200" height="120" fill="url(#celestialMist)" />
      </svg>

      {/* Scrim ensuring left side text readability */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,8,8,0.96) 0%, rgba(8,8,8,0.85) 45%, rgba(8,8,8,0.2) 85%, transparent 100%)',
        }}
      />
    </div>
  );
};
