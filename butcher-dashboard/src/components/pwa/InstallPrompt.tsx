'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  dismissInstallPrompt,
  isAndroidDevice,
  isStandaloneDisplay,
  markInstalled,
  shouldShowIosInstallHelp,
  wasInstallDismissed,
} from '@/lib/pwa';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ready, setReady] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const [message, setMessage] = useState('');
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 1600);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      markInstalled();
      setDeferred(null);
      setShowIos(false);
      setHidden(true);
      setMessage('تم تثبيت Sarh بنجاح');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!ready || isStandaloneDisplay() || wasInstallDismissed()) {
      setHidden(true);
      return;
    }
    if (deferred) {
      setHidden(false);
      setShowIos(false);
      return;
    }
    if (shouldShowIosInstallHelp() && !isAndroidDevice()) {
      setShowIos(true);
      setHidden(false);
    }
  }, [ready, deferred]);

  if (message) {
    return (
      <div className="border-b border-brand/30 bg-brand/10 px-4 py-2 text-center text-sm text-brand">
        {message}
      </div>
    );
  }

  if (hidden) return null;

  return (
    <div className="border-b border-white/10 bg-surface-raised px-4 py-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink">ثبّت سرح على جهازك</p>
          {showIos ? (
            <p className="mt-1 text-xs text-ink-muted">
              في Safari: مشاركة ← إضافة إلى الشاشة الرئيسية
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">يفتح كلوحة مستقلة بدون شريط المتصفح.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!showIos && deferred ? (
            <Button
              type="button"
              size="md"
              onClick={async () => {
                await deferred.prompt();
                const choice = await deferred.userChoice;
                if (choice.outcome === 'accepted') {
                  markInstalled();
                  setMessage('تم تثبيت Sarh بنجاح');
                  setDeferred(null);
                  setHidden(true);
                } else {
                  dismissInstallPrompt();
                  setHidden(true);
                }
              }}
            >
              تثبيت التطبيق
            </Button>
          ) : null}
          <Button
            type="button"
            size="md"
            variant="ghost"
            onClick={() => {
              dismissInstallPrompt();
              setHidden(true);
            }}
          >
            ليس الآن
          </Button>
        </div>
      </div>
    </div>
  );
}
