import type { ReactNode } from 'react';
import '../globals.css';
import { LocaleProvider } from '@/components/locale-provider';
import GithubButton from '@/components/github-button';

export default function LocaleLayout({
  children,
  params
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  return (
    <LocaleProvider locale={locale}>
      <div className="absolute top-4 left-4 z-10">
        <GithubButton />
      </div>
      {children}
    </LocaleProvider>
  );
}
