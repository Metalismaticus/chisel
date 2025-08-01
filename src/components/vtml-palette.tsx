
'use client';

import { PREVIEW_COLOR_MAP } from './vtml-renderer';

export function VtmlPalette() {
  return (
    <div className="flex flex-wrap gap-2 p-2 rounded-md bg-black/30 border border-border">
      {Object.entries(PREVIEW_COLOR_MAP).map(([char, color]) => (
        <div key={char} className="flex items-center gap-2 p-1.5 rounded-sm bg-background/50">
          <span
            style={{
              color: color,
              fontSize: '16px',
              lineHeight: '1',
              width: '16px',
              textAlign: 'center',
            }}
          >
            {char}
          </span>
          <code className="text-xs text-muted-foreground font-mono">{color}</code>
        </div>
      ))}
    </div>
  );
}

    