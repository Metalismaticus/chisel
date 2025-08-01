'use client';

import { Button } from '@/components/ui/button';
import { Github } from 'lucide-react';
import Link from 'next/link';

export default function GithubButton() {
  return (
    <Button asChild variant="outline" size="icon">
      <Link href="https://github.com/Metalismaticus/chisel_vintage_story" target="_blank" rel="noopener noreferrer">
        <Github className="h-5 w-5" />
        <span className="sr-only">GitHub</span>
      </Link>
    </Button>
  );
}
