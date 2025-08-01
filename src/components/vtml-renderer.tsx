"use client";

import React, { useMemo } from 'react';
import { useI18n } from '@/locales/client';

// Game-tested palette
export const PREVIEW_COLOR_MAP: { [key: string]: string } = {
  '█': '#D7D6C0', '▓': '#B2B1B9', '▒': '#8F888F', '░': '#736A5F',
  'Σ': '#9C7063', 'Ω': '#B1877E', 'ƒ': '#7B5446', '®': '#796F42',
  'Ò': '#7D7354', '»': '#918A5D', 'χ': '#586248', 'τ': '#526B3E',
  'ó': '#678063', '¥': '#8C869F', 'σ': '#8D879E', '♥': '#C7A5BE',
  'Ẅ': '#AF87A0', '≥': '#5B464E', '•': '#62574A', 'ю': '#9DBDB4',
  'ζ': '#606C6E', 'È': '#82636D', '◊': '#62575A', '┐': '#55494B',
  '┴': '#766D7C',
};

interface VtmlRendererProps {
  code: string;
}

const parseVtml = (vtmlCode: string) => {
    if (!vtmlCode) {
        return { content: [], fontSize: 1, fontFamily: 'monospace', align: 'center' };
    }

    const fontTagMatch = vtmlCode.match(/<font\s+size="([^"]+)"\s+family="([^"]+)"\s+align="([^"]+)"[^>]*>/);
    const fontSize = fontTagMatch ? parseInt(fontTagMatch[1], 10) : 1;
    const fontFamily = fontTagMatch ? fontTagMatch[2] : 'monospace';
    const align = fontTagMatch ? fontTagMatch[3] : 'center';

    let contentString = vtmlCode;
    const fontContentMatch = vtmlCode.match(/<font[^>]*>([\s\S]*)<\/font>/);
    if (fontContentMatch) {
        contentString = fontContentMatch[1];
    }
    
    // Split by <br> tag, potentially with spaces around it
    const lines = contentString.split(/<br\s*\/?>/);

    const elements = lines.map((line, lineIndex) => {
        // If a line is empty, render a non-breaking space to ensure the line height is preserved
        if (line.trim() === '' && line.length > 0) {
           return <div key={lineIndex}>{'\u00A0'}</div>
        }
        if (line.length === 0) {
           return <div key={lineIndex}><br/></div>
        }
        return (
            <div key={lineIndex}>
                {Array.from(line).map((char, charIndex) => {
                    const color = PREVIEW_COLOR_MAP[char] || '#FFFFFF'; // Default to white
                    // Use non-breaking space for space characters to ensure they are rendered
                    return (
                        <span key={charIndex} style={{ color }}>
                            {char === ' ' ? '\u00A0' : char}
                        </span>
                    );
                })}
            </div>
        );
    });
    
    return { content: elements, fontSize, fontFamily, align };
};


export function VtmlRenderer({ code }: VtmlRendererProps) {
  const t = useI18n();
  const { content, fontSize, fontFamily, align } = useMemo(() => parseVtml(code), [code]);

  return (
    <pre 
      className="font-mono" 
      style={{ 
        fontSize: `${fontSize}px`, 
        fontFamily: `"${fontFamily}", monospace`,
        lineHeight: '1',
        whiteSpace: 'pre', 
        textAlign: align as 'center' | 'left' | 'right',
        wordBreak: 'break-all',
      }}
    >
      {content.length > 0 ? <code>{content}</code> : <div className="text-center text-muted-foreground p-4">{t('vtmlConverter.previewPlaceholder')}</div>}
    </pre>
  );
}
