import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useStats, UserProfile } from "@/context/StatsContext";
import { RefreshCw, Edit } from 'lucide-react';
import { useWallet } from "@solana/wallet-adapter-react";
import { Progress } from "@/components/ui/progress";

const compressImage = (file: File, maxWidth: number, maxHeight: number, quality: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round(width * (maxHeight / height));
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context'));
                }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

const OptionsPage = () => {
    const { publicKey } = useWallet();
    const { 
        isStreamerMode,
        toggleStreamerMode,
        userProfile,
        updateUserProfile,
        level,
        xp,
        xpToNextLevel,
    } = useStats();
    
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [clientSeed, setClientSeed] = useState('');
    const [referredBy, setReferredBy] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (userProfile) {
            setName(userProfile.name);
            setEmail(userProfile.email);
            setClientSeed(userProfile.clientSeed);
        }
    }, [userProfile]);

    const handleProfileSave = () => {
        if (!userProfile) return;
        const updatedProfile: UserProfile = { ...userProfile, name, email, clientSeed, avatarUrl: userProfile.avatarUrl };
        updateUserProfile(updatedProfile);
        toast({ title: "Profile Saved", description: "Your details have been updated." });
    }

    const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && userProfile) {
            compressImage(file, 128, 128, 0.8)
                .then(compressedBase64 => {
                    updateUserProfile({ ...userProfile, avatarUrl: compressedBase64 });
                })
                .catch(error => {
                    console.error("Image compression failed:", error);
                    toast({
                        title: "Upload Failed",
                        description: "Could not process the image. Please try another.",
                        variant: "destructive",
                    });
                });
        }
    };

    const handleEditClick = () => {
        fileInputRef.current?.click();
    };
    
    const generateNewSeed = () => {
        const newSeed = Math.random().toString(36).substring(2);
        setClientSeed(newSeed);
    }

    const handleStreamerModeToggle = () => {
        toggleStreamerMode();
        toast({
            title: `Streamer mode ${!isStreamerMode ? "enabled" : "disabled"}`,
            description: `Your information is now ${!isStreamerMode ? "hidden" : "visible"}.`,
        });
    };

    if (!publicKey || !userProfile) {
        return (
            <div className="container mx-auto p-4 text-center">
                <h1 className="text-4xl font-bold mb-4">Options</h1>
                <p>Please connect your wallet to view your options.</p>
            </div>
        );
    }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-3xl font-bold">Profile & Settings</h1>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="flex-shrink-0 flex flex-col items-center gap-2 w-full md:w-auto">
              <Avatar className="w-24 h-24">
                <AvatarImage src={userProfile.avatarUrl} />
                <AvatarFallback>{name.charAt(0)}</AvatarFallback>
              </Avatar>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarUpload}
                className="hidden"
                accept="image/png, image/jpeg, image/gif"
              />
              <Button variant="outline" size="sm" onClick={handleEditClick} className="w-full">
                <Edit className="w-3 h-3 mr-2" />
                Edit Avatar
              </Button>
            </div>
            <div className="flex-grow space-y-4 w-full">
              <div>
                <label className="text-sm font-medium">Level {level}</label>
                <Progress value={(xp / xpToNextLevel) * 100} className="w-full" />
                <p className="text-xs text-right text-muted-foreground mt-1">
                  {xp.toFixed(0)} / {xpToNextLevel} XP
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Display Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" />
                 <p className="text-xs text-muted-foreground mt-1">This will be shown in chat and on leaderboards.</p>
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Card */}
      <Card>
        <CardHeader>
          <CardTitle>Security & Provably Fair</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Client Seed</label>
             <p className="text-xs text-muted-foreground mb-2">Used for verifying game fairness. You can change this at any time.</p>
            <div className="flex gap-2">
              <Input value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} />
              <Button variant="secondary" onClick={generateNewSeed}><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Card */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Connected Account</label>
            <Input value={publicKey.toBase58()} readOnly disabled />
          </div>
          <div>
            <label className="text-sm font-medium">Referred By</label>
            <Input value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Referral code (optional)" />
          </div>
          <div className="flex items-center justify-between pt-4">
            <div>
                <label htmlFor="streamer-mode" className="font-medium">Streamer Mode</label>
                <p className="text-xs text-muted-foreground">Hide your sensitive information while streaming.</p>
            </div>
            <Switch id="streamer-mode" checked={isStreamerMode} onCheckedChange={handleStreamerModeToggle} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleProfileSave} size="lg">Save All Changes</Button>
      </div>
    </div>
  );
};

export default OptionsPage; 