import React, { useMemo } from 'react';
import katex from 'katex';

interface MathRendererProps {
  latex: string;
  displayMode?: boolean;
  className?: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({
  latex,
  displayMode = true,
  className = '',
}) => {
  const html = useMemo(() => {
    const trimmed = latex.trim();
    if (!trimmed) return '';
    try {
      return katex.renderToString(trimmed, {
        displayMode,
        throwOnError: false,
        strict: false,
        output: 'htmlAndMathml',
      });
    } catch {
      return '';
    }
  }, [latex, displayMode]);

  if (!latex.trim()) {
    return <span className="text-xs text-[#555555]">No formula entered</span>;
  }

  if (!html) {
    return <code className="font-mono text-sm text-[#858585]">{latex}</code>;
  }

  return (
    <div
      className={`overflow-x-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
