'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { SchematicPreview } from './schematic-preview';
import { useToast } from '@/hooks/use-toast';
import { textToSchematic, type SchematicOutput, type FontStyle } from '@/lib/schematic-utils';
import { Upload, HelpCircle } from 'lucide-react';
import { useI18n } from '@/locales/client';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function TextConstructor() {
  const t = useI18n();
  const [text, setText] = useState('Vintage');
  const [fontSize, setFontSize] = useState([24]);
  const [font, setFont] = useState<FontStyle>('monospace');
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [outline, setOutline] = useState(false);
  const [outlineGap, setOutlineGap] = useState([1]);
  const fontFileUrlRef = useRef<string | null>(null);
  const [schematicOutput, setSchematicOutput] = useState<SchematicOutput | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  
  useEffect(() => {
    return () => {
      if (fontFileUrlRef.current) {
        URL.revokeObjectURL(fontFileUrlRef.current);
      }
    };
  }, []);

  const handleFontFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (fontFileUrlRef.current) {
        URL.revokeObjectURL(fontFileUrlRef.current);
      }
      setFontFile(file);
      const url = URL.createObjectURL(file);
      fontFileUrlRef.current = url;
      setFont('custom'); 
    }
  };


  const handleGenerate = () => {
    if (!text) {
      toast({
        title: t('textConstructor.errors.noText'),
        description: t('textConstructor.errors.noTextDesc'),
        variant: "destructive",
      });
      return;
    }

    setSchematicOutput(null);
    startTransition(async () => {
      try {
        const result = await textToSchematic({
            text, 
            font, 
            fontSize: fontSize[0], 
            fontUrl: fontFileUrlRef.current ?? undefined, 
            outline,
            outlineGap: outlineGap[0],
        });
        setSchematicOutput(result);
      } catch (error) {
        console.error(error);
        toast({
          title: t('common.errors.generationFailed'),
          description: error instanceof Error ? error.message : t('common.errors.genericError'),
          variant: "destructive",
        });
        setSchematicOutput(null);
      }
    });
  };

  const handleFontChange = (value: FontStyle) => {
    setFont(value);
    if (value !== 'custom') {
      setFontFile(null);
      if (fontFileUrlRef.current) {
        URL.revokeObjectURL(fontFileUrlRef.current);
        fontFileUrlRef.current = null;
      }
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('textConstructor.title')}</CardTitle>
              <CardDescription>{t('textConstructor.description')}</CardDescription>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                 <Button variant="ghost" size="icon"><HelpCircle className="h-6 w-6 text-primary" /></Button>
              </DialogTrigger>
               <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('textConstructor.help.title')}</DialogTitle>
                </DialogHeader>
                <div className="prose prose-invert max-w-none text-foreground text-sm">
                  <p>{t('textConstructor.help.p1')}</p>
                  <p className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: t('textConstructor.help.p2') }}></p>
                </div>
              </DialogContent>
            </Dialog>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="text-input">{t('textConstructor.textLabel')}</Label>
            <Input id="text-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('textConstructor.textPlaceholder')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>{t('textConstructor.fontLabel')}</Label>
                <Select 
                value={font} 
                onValueChange={(v) => handleFontChange(v as FontStyle)}>
                <SelectTrigger>
                    <SelectValue placeholder={t('textConstructor.fontPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="monospace">{t('textConstructor.fonts.monospace')}</SelectItem>
                    <SelectItem value="serif">{t('textConstructor.fonts.serif')}</SelectItem>
                    <SelectItem value="sans-serif">{t('textConstructor.fonts.sans-serif')}</SelectItem>
                    {fontFile && <SelectItem value="custom" disabled>{fontFile.name}</SelectItem>}
                </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="font-upload">{t('textConstructor.uploadLabel')}</Label>
                <Button asChild variant="outline" className="w-full">
                <label className="cursor-pointer flex items-center justify-center">
                    <Upload className="mr-2 h-4 w-4" />
                    {fontFile ? fontFile.name : t('textConstructor.uploadButton')}
                    <input id="font-upload" type="file" className="sr-only" onChange={handleFontFileChange} accept=".ttf,.otf,.woff,.woff2" />
                </label>
                </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="font-size">{t('textConstructor.sizeLabel')}: {fontSize[0]}px</Label>
            <Slider
              id="font-size"
              min={8}
              max={128}
              step={1}
              value={fontSize}
              onValueChange={setFontSize}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="outline-switch" checked={outline} onCheckedChange={setOutline} />
            <Label htmlFor="outline-switch">{t('textConstructor.outlineLabel')}</Label>
          </div>
          {outline && (
             <div className="space-y-2">
                <Label htmlFor="outline-gap">{t('textConstructor.outlineGapLabel')}: {outlineGap[0]}px</Label>
                <Slider
                id="outline-gap"
                min={1}
                max={5}
                step={1}
                value={outlineGap}
                onValueChange={setOutlineGap}
                />
            </div>
          )}
          <Button onClick={handleGenerate} disabled={isPending} className="w-full uppercase font-bold tracking-wider">
            {isPending ? t('common.generating') : t('textConstructor.button')}
          </Button>
        </CardContent>
      </Card>
      <SchematicPreview schematicOutput={schematicOutput} loading={isPending} />
    </div>
  );
}
