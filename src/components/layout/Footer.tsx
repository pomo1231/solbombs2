import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Twitter, MessageSquare } from 'lucide-react';

// Simple language selector placeholder
const LanguageSelector = () => (
  <div className="relative">
    <button className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10">
      English
      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
      </svg>
    </button>
  </div>
);

export default function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn('mt-8 pb-8', className)}>
      <div className="px-6">
        {/* Compliance/info banner */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          <div className="flex flex-col gap-2">
            <p>
              Welcome to our Solana casino. Play responsibly. We provide instant on-chain deposits and withdrawals for a better experience. Games are provably fair via SHA-256. Earn and play responsibly.
            </p>
            <p>
              By using the website, you agree to our <Link to="/terms-of-service" className="text-white hover:underline">Terms of Service</Link> and acknowledge our <Link to="/provably-fair" className="text-white hover:underline">Provably Fair</Link> system. Product updates may take effect after announcement windows.
            </p>
          </div>
        </div>

        {/* Ownership/compliance row */}
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70">
          <p>
            This site is operated by its respective owner. Use is restricted where prohibited by law. Ensure gambling with cryptocurrency is legal in your jurisdiction.
          </p>
        </div>

        {/* Contacts + Socials */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="space-y-1 text-sm text-white/80">
            <div className="flex gap-2"><span className="text-white/60 w-36">Contact Support:</span> <a href="mailto:support@example.com" className="hover:underline">support@example.com</a></div>
            <div className="flex gap-2"><span className="text-white/60 w-36">Marketing Inquiries:</span> <a href="mailto:partners@example.com" className="hover:underline">partners@example.com</a></div>
          </div>
          <div className="flex flex-wrap gap-2 justify-start md:justify-center">
            <Button variant="secondary" className="h-8 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10">
              <Twitter className="w-4 h-4 mr-1" /> Follow our X / Twitter
            </Button>
            <Button variant="secondary" className="h-8 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10">
              <MessageSquare className="w-4 h-4 mr-1" /> Join our Discord
            </Button>
          </div>
          <div className="flex justify-start md:justify-end">
            <LanguageSelector />
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 flex items-center justify-between text-xs text-white/50">
          <span>© {new Date().getFullYear()} Solbombs. All rights reserved.</span>
          <div className="flex gap-4">
            <Link to="/provably-fair" className="hover:underline">Provably Fair</Link>
            <Link to="/terms-of-service" className="hover:underline">Terms</Link>
            <Link to="/support" className="hover:underline">Support</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
