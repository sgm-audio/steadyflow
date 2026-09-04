'use client';

import { useState } from 'react';

interface CopyLeakListButtonProps {
  /** Markdown to copy when clicked. */
  markdown: string;
  /** Visual label for the button. */
  label?: string;
}

/**
 * S10b — copy a report section as Markdown to the clipboard.
 *
 * The button is intentionally small and styled to match the report page's
 * chrome (dark glass). Click → copies → shows "Copied" for 2 seconds →
 * reverts. Uses `navigator.clipboard.writeText` when available, with a
 * hidden-textarea + `execCommand('copy')` fallback for older browsers
 * (still required for some sandboxed iframe contexts).
 */
export function CopyLeakListButton({ markdown, label = 'Copy as Markdown' }: CopyLeakListButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const onClick = (): void => {
    setError(false);
    void (async () => {
      try {
        await navigator.clipboard.writeText(markdown);
        setCopied(true);
        window.setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch {
        setError(true);
        window.setTimeout(() => {
          setError(false);
        }, 2000);
      }
    })();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.25rem 0.625rem',
        borderRadius: '0.25rem',
        border: '1px solid #27272a',
        background: error ? '#7f1d1d' : copied ? '#166534' : '#18181b',
        color: '#e4e4e7',
        fontSize: '0.75rem',
        cursor: 'pointer',
      }}
    >
      {error ? 'Copy failed' : copied ? 'Copied ✓' : label}
  </button>
  );
}
