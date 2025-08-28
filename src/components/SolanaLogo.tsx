type Props = {
  className?: string;
  // coin = glyph inside black circle (no white bg), glyph = standalone
  variant?: 'coin' | 'glyph';
};

export const SolanaLogo = ({ className = 'w-6 h-6 mr-2', variant = 'coin' }: Props) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Solana"
  >
    <defs>
      <linearGradient id="solanaGradient" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#9945FF" />
        <stop offset="50%" stopColor="#8752F3" />
        <stop offset="100%" stopColor="#14F195" />
      </linearGradient>
    </defs>
    {variant === 'coin' && (
      <circle cx="12" cy="12" r="12" fill="#000" />
    )}
    {/* Solana glyph: three slanted bars */}
    <g>
      {/* Top bar (slants right) */}
      <path
        fill="url(#solanaGradient)"
        d="M6 6h11l-1.6 2H4.4L6 6z"
      />
      {/* Middle bar (slants left) */}
      <path
        fill="url(#solanaGradient)"
        d="M7.2 11h11l-1.6 2H5.6l1.6-2z"
      />
      {/* Bottom bar (slants right) */}
      <path
        fill="url(#solanaGradient)"
        d="M6 16h11l-1.6 2H4.4L6 16z"
      />
    </g>
  </svg>
);
 