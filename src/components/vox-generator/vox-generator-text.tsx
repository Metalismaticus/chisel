
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SchematicPreview } from '@/components/schematic-preview';
import { useToast } from '@/hooks/use-toast';
import { type FontStyle, type TextOrientation, rasterizeText } from '@/lib/schematic-utils';
import { useI18n } from '@/locales/client';
import { generateTextToVoxFlow, type TextToVoxInput, type TextToVoxOutput } from '@/ai/flows/text-to-vox-flow';
import { Loader2, Upload } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '../ui/switch';
import { cn } from '@/lib/utils';

type TextVoxMode = 'extrude' | 'engrave';

export function VoxGeneratorText() {
  const t = useI18n();
  const [text, setText] = useState('Vintage');
  const [fontSize, setFontSize] = useState([24]);
  const [font, setFont] = useState<FontStyle>('monospace');
  const [fontFile, setFontFile] = useState<File | null>(null);
  const fontFileUrlRef = useRef<string | null>(null);
  const [textVoxMode, setTextVoxMode] = useState<TextVoxMode>('extrude');
  const [textStickerMode, setTextStickerMode] = useState(true);
  const [letterDepth, setLetterDepth] = useState([5]);
  const [engraveDepth, setEngraveDepth] = useState([3]);
  const [textOrientation, setTextOrientation] = useState<TextOrientation>('horizontal');
  const [textOutline, setTextOutline] = useState(false);
  const [textOutlineGap, setTextOutlineGap] = useState([1]);
  
  const [schematicOutput, setSchematicOutput] = useState<any | null>(null);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (fontFileUrlRef.current) { URL.revokeObjectURL(fontFileUrlRef.current); }
    };
  }, []);

  const handleFontFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (fontFileUrlRef.current) {
        URL.revokeObjectURL(fontFileUrlRef.current);
      }
      const newUrl = URL.createObjectURL(file);
      fontFileUrlRef.current = newUrl;
      setFontFile(file);
      setFont('custom');
    }
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

  const handleGenerateText = async () => {
    if (!text || !text.trim()) {
        toast({ title: t('textConstructor.errors.noText'), description: t('textConstructor.errors.noTextDesc'), variant: "destructive" });
        return;
    }
    
    setIsPending(true);
    setSchematicOutput(null);
    
    try {
        const { pixels, width, height } = await rasterizeText({
            text, 
            font, 
            fontSize: fontSize[0], 
            fontUrl: fontFileUrlRef.current ?? undefined,
            outline: textOutline,
            outlineGap: textOutlineGap[0],
        });

        if (width === 0 || height === 0) {
            toast({ title: t('common.errors.generationFailed'), description: t('textConstructor.errors.rasterizeFailed'), variant: 'destructive'});
            setIsPending(false);
            return;
        }

        const input: TextToVoxInput = {
            pixels,
            width,
            height,
            mode: textVoxMode,
            letterDepth: letterDepth[0],
            backgroundDepth: 16, // Locked value
            engraveDepth: textVoxMode === 'engrave' ? engraveDepth[0] : 0,
            orientation: textOrientation,
            stickerMode: textStickerMode,
        };

        const result: TextToVoxOutput = await generateTextToVoxFlow(input);
        const voxDataBytes = Buffer.from(result.voxData, 'base64');
        setSchematicOutput({ ...result, voxData: voxDataBytes, voxSize: result.voxSize });

    } catch (error) {
        console.error(error);
        toast({
          title: t('common.errors.generationFailed'),
          description: (error instanceof Error) ? error.message : String(error),
          variant: "destructive",
        });
        setSchematicOutput(null);
    } finally {
        setIsPending(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
        <CardContent className="space-y-6 pt-6">
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
            <Switch id="outline-switch" checked={textOutline} onCheckedChange={setTextOutline} />
            <Label htmlFor="outline-switch">{t('textConstructor.outlineLabel')}</Label>
          </div>
          {textOutline && (
             <div className="space-y-2">
                <Label htmlFor="outline-gap">{t('textConstructor.outlineGapLabel')}: {textOutlineGap[0]}px</Label>
                <Slider
                id="outline-gap"
                min={1}
                max={5}
                step={1}
                value={textOutlineGap}
                onValueChange={setTextOutlineGap}
                />
            </div>
          )}

           <div className="space-y-2">
            <Label>{t('voxGenerator.text.orientation.label')}</Label>
            <RadioGroup value={textOrientation} onValueChange={(v) => setTextOrientation(v as TextOrientation)} className="flex pt-2 space-x-4 bg-muted/30 p-1 rounded-lg">
                <RadioGroupItem value="horizontal" id="text-horizontal" className="sr-only" />
                <Label 
                    htmlFor="text-horizontal"
                    className={cn(
                        "flex-1 text-center py-2 px-4 rounded-md cursor-pointer",
                        textOrientation === 'horizontal' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50'
                     )}
                 >
                    {t('voxGenerator.text.orientation.horizontal')}
                </Label>
                 <RadioGroupItem value="vertical-lr" id="text-vertical" className="sr-only" />
                <Label 
                    htmlFor="text-vertical"
                    className={cn(
                        "flex-1 text-center py-2 px-4 rounded-md cursor-pointer",
                        textOrientation === 'vertical-lr' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50'
                     )}
                >
                    {t('voxGenerator.text.orientation.vertical')}
                </Label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
             <Label>{t('voxGenerator.text.modeLabel')}</Label>
             <RadioGroup value={textVoxMode} onValueChange={(v) => setTextVoxMode(v as TextVoxMode)} className="flex pt-2 space-x-4">
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="extrude" id="mode-extrude" />
                    <Label htmlFor="mode-extrude">{t('voxGenerator.text.modes.extrude')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="engrave" id="mode-engrave" />
                    <Label htmlFor="mode-engrave">{t('voxGenerator.text.modes.engrave')}</Label>
                </div>
            </RadioGroup>
          </div>
          
           <div className="flex items-center space-x-2">
                <Switch id="text-sticker-mode" checked={textStickerMode} onCheckedChange={setTextStickerMode} />
                <Label htmlFor="text-sticker-mode">{t('voxGenerator.text.stickerMode')}</Label>
           </div>

          {textVoxMode === 'extrude' && (
            <div className="space-y-2">
                <Label htmlFor="letter-depth">{t('voxGenerator.text.letterDepth')}: {letterDepth[0]}px</Label>
                <Slider
                    id="letter-depth"
                    min={1} max={50} step={1}
                    value={letterDepth}
                    onValueChange={setLetterDepth}
                />
            </div>
          )}

           {textVoxMode === 'engrave' && (
            <div className="space-y-4">
                 <div className="space-y-2">
                    <Label htmlFor="engrave-depth">{t('voxGenerator.text.engraveDepth')}: {engraveDepth[0]}px</Label>
                    <Slider
                        id="engrave-depth"
                        min={1} max={15} step={1}
                        value={engraveDepth}
                        onValueChange={setEngraveDepth}
                    />
                </div>
            </div>
          )}
          <Button onClick={handleGenerateText} disabled={isPending} className="w-full uppercase font-bold tracking-wider">
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.generating')}
              </>
            ) : t('voxGenerator.button')}
          </Button>
        </CardContent>
      </Card>
      <SchematicPreview schematicOutput={schematicOutput} loading={isPending} />
    </div>
  );
}
