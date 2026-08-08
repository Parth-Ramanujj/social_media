'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`btn btn--sm btn--mono${copied ? ' is-copied' : ''}`}
      onClick={() => void copy()}
      aria-label={`Copy ${label} to clipboard`}
    >
      {copied ? 'copied ✓' : label}
    </button>
  );
}
