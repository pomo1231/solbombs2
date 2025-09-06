import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Twitter, MessageSquare, Globe } from 'lucide-react';
import { useI18n, LANG_DISPLAY } from '@/context/I18nContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Language selector styled like the rest of the site
const LanguageSelector = () => {
  const { language, setLanguage } = useI18n();
  const options = ['en','es','fr','pt','de'] as const;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Language selector"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition-colors"
        >
          <Globe className="w-4 h-4 text-white/80" />
          <span className="hidden sm:inline">{LANG_DISPLAY[language]}</span>
          <span className="sm:hidden uppercase">{language}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={6} className="min-w-[10rem] bg-[#0b0e14] border border-white/10 text-white/90">
        {options.map((code) => (
          <DropdownMenuItem
            key={code}
            className={`flex items-center gap-2 text-sm focus:bg-white/10 ${language === code ? 'text-white' : 'text-white/80'}`}
            onClick={() => setLanguage(code as any)}
          >
            <span className="w-5 text-center uppercase text-[10px] opacity-70">{code}</span>
            <span>{LANG_DISPLAY[code]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default function Footer({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <footer className={cn('mt-8 pb-8', className)}>
      <div className="px-6">
        {/* Compliance/info banner */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          <div className="flex flex-col gap-2">
            <p>
              {t('footer.welcome')}
            </p>
            <p>
              {t('footer.disclaimer2', { terms: t('footer.terms'), provably: t('footer.provablyFair') })}
              {' '}
              (<Link to="/terms-of-service" className="text-white hover:underline">{t('footer.terms')}</Link> · <Link to="/provably-fair" className="text-white hover:underline">{t('footer.provablyFair')}</Link>)
            </p>
          </div>
        </div>

        {/* Ownership/compliance row */}
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70">
          <p>
            {t('footer.disclaimer1')}
          </p>
        </div>

        

        {/* Contacts + Socials */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="space-y-1 text-sm text-white/80">
            <div className="flex gap-2"><span className="text-white/60 w-36">{t('footer.contactSupport')}</span> <a href="mailto:support@example.com" className="hover:underline">support@example.com</a></div>
            <div className="flex gap-2"><span className="text-white/60 w-36">{t('footer.marketing')}</span> <a href="mailto:partners@example.com" className="hover:underline">partners@example.com</a></div>
          </div>
          <div className="flex flex-col items-start md:items-center gap-2">
            <div className="flex flex-wrap gap-2 justify-start md:justify-center">
              <Button variant="secondary" className="h-8 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10">
                <Twitter className="w-4 h-4 mr-1" /> {t('footer.followTwitter')}
              </Button>
              <Button variant="secondary" className="h-8 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10">
                <MessageSquare className="w-4 h-4 mr-1" /> {t('footer.joinDiscord')}
              </Button>
            </div>
            {/* Move language selector here to avoid overlapping the chat bubble at bottom-right */}
            <div className="mt-1">
              <LanguageSelector />
            </div>
          </div>
          {/* Right column: important links */}
          <div className="flex w-full md:w-auto justify-start md:justify-end">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" className="h-8 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10">
                <Link to="/provably-fair">{t('footer.provablyFair')}</Link>
              </Button>
              <Button asChild variant="secondary" className="h-8 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10">
                <Link to="/terms-of-service">{t('footer.terms')}</Link>
              </Button>
              <Button asChild variant="secondary" className="h-8 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10">
                <Link to="/support">{t('footer.support')}</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 flex items-center justify-between text-xs text-white/50">
          <span>© {new Date().getFullYear()} Solbombs. {t('footer.copyright')}</span>
          <span className="hidden sm:inline" />
        </div>
      </div>
    </footer>
  );
}
