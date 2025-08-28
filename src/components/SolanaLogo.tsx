type Props = {
  className?: string;
  // coin = glyph inside black circle (no white bg), glyph = standalone
  variant?: 'coin' | 'glyph';
};

export const SolanaLogo = ({ className = 'w-6 h-6 mr-2', variant = 'glyph' }: Props) => {
  const src = new URL('../assets/solana-logo-mark.svg', import.meta.url).toString();
  if (variant === 'coin') {
    return (
      <div className={`inline-flex items-center justify-center rounded-full bg-black ${className}`}>
        <img src={src} alt="Solana" className="w-3/4 h-3/4 object-contain" />
      </div>
    );
  }
  return <img src={src} alt="Solana" className={className} />;
};
 