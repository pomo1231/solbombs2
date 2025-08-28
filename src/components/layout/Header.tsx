import React from 'react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { WalletConnect } from '@/components/WalletConnect';
import { Users } from 'lucide-react';

export const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-12 items-center">
        <div className="mr-4 hidden md:flex">
          <a href="/" className="mr-4 flex items-center space-x-2">
            <Logo />
          </a>
          <nav className="flex items-center space-x-4 text-sm font-medium">
            <a
              href="/provably-fair"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Provably Fair
            </a>
            <a
              href="/terms-of-service"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Terms of Service
            </a>
            <a
              href="/support"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Support
            </a>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <div className="flex items-center text-sm font-medium text-foreground/60">
            <Users className="h-4 w-4 mr-2" />
            <span>1,234 Online</span>
          </div>
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}; 