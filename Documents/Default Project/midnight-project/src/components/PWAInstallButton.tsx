import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="w-full flex items-center justify-center gap-2 border border-[#262626] bg-[#0A0A0A] px-3 py-2 text-xs font-medium text-white hover:border-white transition-colors whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="w-full flex items-center justify-center gap-2 border border-[#262626] bg-[#0A0A0A] px-3 py-2 text-xs font-medium text-[#858585] hover:text-white hover:border-white transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Install on iOS</span>
        </button>
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-sm border border-[#262626] bg-[#0A0A0A] p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-white">Install MIDNIGHT</h3>
                <button
                  type="button"
                  aria-label="Close iOS install guide"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-[#858585] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-sm text-[#858585] leading-relaxed">
                1. Tap the Share button in Safari.<br />
                2. Scroll and select Add to Home Screen.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full bg-white text-black py-2 text-xs font-semibold hover:bg-[#D4D4D4] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-18 lg:bottom-5 right-4 z-40 flex items-center gap-2 border border-[#404040] bg-[#111111] px-3 py-1.5 text-xs text-white"
    >
      <WifiOff className="w-3.5 h-3.5 text-[#858585]" aria-hidden="true" />
      <span>Offline · Local data active</span>
    </div>
  );
};
