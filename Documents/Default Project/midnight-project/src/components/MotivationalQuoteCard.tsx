import React, { useMemo, useState } from 'react';
import {
  getDailyMotivationalQuote,
  getNextMotivationalQuote,
  MotivationalQuote,
} from '../data/motivationalQuotes.ts';

interface MotivationalQuoteCardProps {
  activeDate: string;
  variant?: 'today-hero' | 'focus-top' | 'focus-center';
  className?: string;
  quote?: MotivationalQuote;
}

export const MotivationalQuoteCard: React.FC<MotivationalQuoteCardProps> = ({
  activeDate,
  variant = 'today-hero',
  className = '',
  quote: overrideQuote,
}) => {
  const [internalQuote, setInternalQuote] = useState<MotivationalQuote>(() =>
    getDailyMotivationalQuote(activeDate, 'all')
  );

  const currentQuote = overrideQuote ?? internalQuote;

  // Dynamic font size computation to guarantee the quote fits the reserved box
  const fontSizeClass = useMemo(() => {
    const len = currentQuote.text.length;
    if (variant === 'focus-top') {
      if (len < 40) return 'text-xl sm:text-2xl md:text-3xl font-semibold';
      if (len < 75) return 'text-lg sm:text-xl md:text-2xl font-medium';
      return 'text-base sm:text-lg md:text-xl font-normal';
    }
    // today-hero variant: reserved box
    if (len < 45) return 'text-base sm:text-lg font-semibold';
    if (len < 80) return 'text-sm sm:text-base font-medium';
    return 'text-xs sm:text-sm font-normal';
  }, [currentQuote.text, variant]);

  // Focus Top Variant: Balanced, clean, stable layout area above the timer
  if (variant === 'focus-top' || variant === 'focus-center') {
    return (
      <div
        className={`w-full max-w-2xl mx-auto text-center min-h-[76px] sm:min-h-[88px] flex flex-col items-center justify-center transition-all ${className}`}
        data-testid="motivational-quote-focus"
      >
        <blockquote
          className={`${fontSizeClass} text-white tracking-tight leading-snug text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]`}
        >
          “{currentQuote.text}”
        </blockquote>
        {currentQuote.author && (
          <p className="mt-1.5 text-xs font-mono text-white/60 tracking-wider">
            — {currentQuote.author}
          </p>
        )}
      </div>
    );
  }

  // TODAY / HOME: Reserved clean box, NO heading, NO copy/next buttons, fits reserved area
  return (
    <div
      className={`border border-[#262626] bg-[#0A0A0A] px-5 py-4 rounded-none min-h-[88px] sm:min-h-[100px] flex flex-col justify-center transition-all ${className}`}
      data-testid="motivational-quote-card"
    >
      <blockquote className={`${fontSizeClass} text-white tracking-tight leading-snug text-balance`}>
        “{currentQuote.text}”
      </blockquote>
      {currentQuote.author && (
        <p className="mt-1 text-xs font-mono text-[#858585] tracking-wide">
          — {currentQuote.author}
        </p>
      )}
    </div>
  );
};
