
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/locales/client';
import { HelpCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from '@/lib/utils';
import { VoxGeneratorShape } from './vox-generator/vox-generator-shape';
import { VoxGeneratorText } from './vox-generator/vox-generator-text';
import { VoxGeneratorPixelArt } from './vox-generator/vox-generator-pixelart';
import { VoxGeneratorQr } from './vox-generator/vox-generator-qr';
import { VoxGeneratorSign } from './vox-generator/vox-generator-sign';

type GeneratorMode = 'shape' | 'text' | 'qr' | 'pixelart' | 'sign';

export function VoxGenerator() {
  const t = useI18n();
  const [mode, setMode] = useState<GeneratorMode>('shape');

  const renderInputs = () => {
    switch (mode) {
      case 'shape':
        return <VoxGeneratorShape />;
      case 'text':
        return <VoxGeneratorText />;
      case 'pixelart':
        return <VoxGeneratorPixelArt />;
      case 'qr':
        return <VoxGeneratorQr />;
      case 'sign':
        return <VoxGeneratorSign />;
      default:
        return null;
    }
  }

  return (
    <div className="grid md:grid-cols-1 gap-6">
      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('voxGenerator.title')}</CardTitle>
            <CardDescription>{t('voxGenerator.description')}</CardDescription>
          </div>
           <Dialog>
              <DialogTrigger asChild>
                 <Button variant="ghost" size="icon"><HelpCircle className="h-6 w-6 text-primary" /></Button>
              </DialogTrigger>
               <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('voxGenerator.help.title')}</DialogTitle>
                </DialogHeader>
                <div className="prose prose-invert max-w-none text-foreground text-sm space-y-4">
                   <p dangerouslySetInnerHTML={{ __html: t('voxGenerator.help.p1', { link: t('voxGenerator.help.link') })}} />
                   <p className="text-muted-foreground">{t('voxGenerator.help.p2')}</p>
                </div>
              </DialogContent>
            </Dialog>
        </CardHeader>
        <CardContent className="space-y-6">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as GeneratorMode)} className="grid grid-cols-3 lg:grid-cols-5 gap-1 pt-2 bg-muted/30 p-1 rounded-lg">
                <RadioGroupItem value="shape" id="mode-shape" className="sr-only" />
                <Label htmlFor="mode-shape" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", mode === 'shape' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                   {t('voxGenerator.modes.shape')}
                </Label>
                <RadioGroupItem value="text" id="mode-text" className="sr-only" />
                <Label htmlFor="mode-text" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", mode === 'text' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                    {t('voxGenerator.modes.text')}
                </Label>
                <RadioGroupItem value="pixelart" id="mode-pixelart" className="sr-only" />
                <Label htmlFor="mode-pixelart" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", mode === 'pixelart' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                    {t('voxGenerator.modes.pixelart')}
                </Label>
                 <RadioGroupItem value="qr" id="mode-qr" className="sr-only" />
                <Label htmlFor="mode-qr" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", mode === 'qr' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                    {t('voxGenerator.modes.qr')}
                </Label>
                <RadioGroupItem value="sign" id="mode-sign" className="sr-only" />
                <Label htmlFor="mode-sign" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", mode === 'sign' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                    {t('voxGenerator.modes.sign')}
                </Label>
            </RadioGroup>
        </CardContent>
      </Card>
      {renderInputs()}
    </div>
  );
}
