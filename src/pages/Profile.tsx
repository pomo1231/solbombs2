import { useWallet } from "@solana/wallet-adapter-react";
import { useStats } from "@/context/StatsContext";

export default function ProfilePage() {
    const { publicKey } = useWallet();
    const { userProfile } = useStats();

    if (!publicKey || !userProfile) {
        return (
            <div className="container mx-auto p-4 text-center">
                <h1 className="text-4xl font-bold mb-4">Profile</h1>
                <p>Please connect your wallet to view your profile.</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 text-white">
            <h1 className="text-4xl font-bold mb-4">Profile</h1>
            <p>This is your profile page. Use the dropdown menu to navigate to other sections.</p>
        </div>
    );
} 