import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Twitter, MessageSquare } from 'lucide-react';
import { useI18n, LANG_DISPLAY } from '@/context/I18nContext';

// Real language selector using I18nContext
const LanguageSelector = () => {
  const { language, setLanguage } = useI18n();
  const options = ['en','es','fr','pt','de'] as const;
  return (
    <label className="inline-flex items-center gap-2 text-xs text-white/70">
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        value={language}
        onChange={(e) => setLanguage(e.target.value as any)}
        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/80 hover:bg-white/10 focus:outline-none"
      >
        {options.map((code) => (
          <option key={code} value={code} className="bg-[#0b0f16]">
            {LANG_DISPLAY[code]}
          </option>
        ))}
      </select>
    </label>
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
          <div className="flex flex-wrap gap-2 justify-start md:justify-center">
            <Button variant="secondary" className="h-8 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10">
              <Twitter className="w-4 h-4 mr-1" /> {t('footer.followTwitter')}
            </Button>
            <Button variant="secondary" className="h-8 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10">
              <MessageSquare className="w-4 h-4 mr-1" /> {t('footer.joinDiscord')}
            </Button>
          </div>
          <div className="flex justify-start md:justify-end">
            <LanguageSelector />
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 flex items-center justify-between text-xs text-white/50">
          <span>© {new Date().getFullYear()} Solbombs. {t('footer.copyright')}</span>
          <div className="flex gap-4">
            <Link to="/provably-fair" className="hover:underline">{t('footer.provablyFair')}</Link>
            <Link to="/terms-of-service" className="hover:underline">{t('footer.terms')}</Link>
            <Link to="/support" className="hover:underline">{t('footer.support')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
