import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WalletConnect } from '@/components/WalletConnect';
import { useWallet } from '@solana/wallet-adapter-react';

const SupportPage = () => {
  const { connected } = useWallet();
  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Support & Contact</CardTitle>
        </CardHeader>
        <CardContent>
          {connected ? (
            <>
              <p>
                Welcome to our support page! For immediate assistance, please use the chat widget.
              </p>
              <p className="mt-4">
                Our team is available to help you with any questions or issues you may have.
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-300">
                Connect your wallet to access support chat.
              </p>
              <WalletConnect />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SupportPage; 