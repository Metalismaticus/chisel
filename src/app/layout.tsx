import type { Metadata } from 'next';
import { Oswald, Roboto_Condensed } from 'next/font/google';
import './globals.css';
import type { ReactNode } from 'react';
import Script from 'next/script';

const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-oswald',
  weight: ['400', '700'],
});

const robotoCondensed = Roboto_Condensed({
  subsets: ['latin'],
  variable: '--font-roboto-condensed',
  weight: ['400'],
});

export const metadata: Metadata = {
  title: 'helper for chiselling',
  description: 'Create pixel art schematics for Vintage Story',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${oswald.variable} ${robotoCondensed.variable} font-body antialiased dark`}>
      <body>
        {children}
        <Script src="https://cdn.counter.dev/script.js" data-id="1615e2b7-7e18-4517-b0fc-49d5111c0e76" data-utcoffset="3" />
      </body>
    </html>
  );
}
