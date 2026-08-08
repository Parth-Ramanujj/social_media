'use client';

import type { ReactNode } from 'react';

export function PlatformMark({ platform, size = 14 }: { platform: string; size?: number }) {
  const letter = platform.slice(0, 2).toUpperCase();
  return (
    <span
      className="pmark"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {letter}
    </span>
  );
}

export function PulseMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      style={{ display: 'block' }}
    >
      <path
        d="M1 10h3l2-6 3.5 10L12 6l1.5 4H17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Icon({ children, size = 14 }: { children: ReactNode; size?: number }) {
  return (
    <span aria-hidden className="icon" style={{ width: size, height: size, fontSize: size }}>
      {children}
    </span>
  );
}
