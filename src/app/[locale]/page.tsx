
'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextConstructor } from "@/components/text-constructor";
import { ImageConverter } from "@/components/image-converter";
import { ShapeGenerator } from "@/components/shape-generator";
import { VoxGenerator } from "@/components/vox-generator";
import { VtmlConverter } from "@/components/vtml-converter";
import { useI18n } from "@/locales/client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { VintageVisionsLogo } from "@/components/vintage-visions-logo";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export default function Home() {
  const t = useI18n();
  return (
    <div className="flex flex-col items-center min-h-screen p-4 sm:p-6 md:p-8">
      <header className="flex items-center gap-4 my-4 border-b-2 border-primary/50 pb-4 px-8 text-center">
        <VintageVisionsLogo className="w-16 h-16 text-primary animate-spin-slow" />
        <h1 className="text-4xl md:text-5xl font-headline text-foreground font-bold tracking-wider uppercase">
          {t('title')}
        </h1>
      </header>
      <main className="w-full max-w-6xl p-4 border border-foreground/30 bg-background/50 rounded-lg shadow-2xl">
        <Tabs defaultValue="vtml" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="text">{t('tabs.text')}</TabsTrigger>
            <TabsTrigger value="image">{t('tabs.image')}</TabsTrigger>
            <TabsTrigger value="shape">{t('tabs.shape')}</TabsTrigger>
            <TabsTrigger value="vox">{t('tabs.vox')}</TabsTrigger>
            <TabsTrigger value="vtml">{t('tabs.vtml')}</TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="mt-6">
            <TextConstructor />
          </TabsContent>
          <TabsContent value="image" className="mt-6">
            <ImageConverter />
          </TabsContent>
          <TabsContent value="shape" className="mt-6">
            <ShapeGenerator />
          </TabsContent>
          <TabsContent value="vox" className="mt-6">
            <VoxGenerator />
          </TabsContent>
           <TabsContent value="vtml" className="mt-6">
            <VtmlConverter />
          </TabsContent>
        </Tabs>
      </main>
      <footer className="w-full max-w-6xl flex justify-between items-center mt-8 text-muted-foreground px-2">
        <Button asChild variant="link" className="text-muted-foreground hover:text-primary transition-colors">
          <Link href="https://metalismaticus.github.io/TOPS/" target="_blank" rel="noopener noreferrer">
            русский гайд для игры на TOPS
          </Link>
        </Button>
        <div className="flex items-center gap-4">
            <a href="https://discord.com/users/698122435266084975" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
               <svg
                  className="h-5 w-5 fill-current"
                  viewBox="0 -28.5 256 256"
                  xmlns="http://www.w3.org/2000/svg"
                  preserveAspectRatio="xMidYMid"
               >
                  <path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" />
               </svg>
               <span className="sr-only">Discord</span>
            </a>
            <span>by Metalismatic</span>
        </div>
      </footer>
    </div>
  );
}
