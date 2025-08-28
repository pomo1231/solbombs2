import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export function WalletConnect() {
  return (
    <div className="wallet-connect-wrapper">
      <WalletMultiButton className="wallet-btn" />
    </div>
  );
}