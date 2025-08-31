
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SchematicPreview } from '@/components/schematic-preview';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/locales/client';
import { generateSignToVoxFlow, type SignToVoxInput, type SignToVoxOutput } from '@/ai/flows/sign-to-vox-flow';
import { Loader2, Upload, ExternalLink, ArrowLeftRight, WholeWord } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '../ui/switch';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type SignType = 'standard' | 'hanging';

export function VoxGeneratorSign() {
  const t = useI18n();
  const [signType, setSignType] = useState<SignType>('standard');
  const [signIconFile, setSignIconFile] = useState<File | null>(null);
  const [signIconUrl, setSignIconUrl] = useState<string | null>(null);
  const [signText, setSignText] = useState('GEARSTED PATH');
  
  // Standard sign
  const [signWidth, setSignWidth] = useState(48);
  const [signHeight, setSignHeight] = useState(40);
  const [signFrameWidth, setSignFrameWidth] = useState(2);
  const [signFrame, setSignFrame] = useState(true);

  // Hanging sign
  const [hangingWidth, setHangingWidth] = useState(64);
  const [hangingIconPosition, setHangingIconPosition] = useState<'left' | 'right'>('left');
  const [hangingSignThickness, setHangingSignThickness] = useState(4);
  const [hangingSignIconOffsetX, setHangingSignIconOffsetX] = useState(0);
  const [hangingSignTextOffsetX, setHangingSignTextOffsetX] = useState(0);

  // Common
  const signIconInputRef = useRef<HTMLInputElement>(null);
  const [signIconScale, setSignIconScale] = useState(50);
  const [signIconOffsetY, setSignIconOffsetY] = useState(0);
  const [textOffsetY, setTextOffsetY] = useState(0);
  const [signWithIcon, setSignWithIcon] = useState(true);


  const [schematicOutput, setSchematicOutput] = useState<any | null>(null);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  
  useEffect(() => {
    if (signType === 'hanging') {
      setSignIconScale(20);
    }
  }, [signType]);

  useEffect(() => {
    return () => {
      if (signIconUrl) { URL.revokeObjectURL(signIconUrl); }
    };
  }, [signIconUrl]);

  const handleSignIconFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({ title: t('imageConverter.errors.invalidFileType'), variant: 'destructive' });
        return;
      }
      setSignIconFile(file);
      if (signIconUrl) { URL.revokeObjectURL(signIconUrl); }
      setSignIconUrl(URL.createObjectURL(file));
    }
  };

  const imageToPixels = async (img: HTMLImageElement, targetWidth: number): Promise<{pixels: boolean[], width: number, height: number}> => {
      const aspectRatio = img.naturalHeight / img.naturalWidth;
      const width = targetWidth;
      const height = Math.round(width * aspectRatio);

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Could not get canvas context for icon');
      
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      
      const pixels: boolean[] = [];
      for (let i = 0; i < imageData.data.length; i += 4) {
          pixels.push(imageData.data[i+3] > 128);
      }

      return { pixels, width, height };
  }

  const handleGenerateSign = async () => {
    if (!signText.trim() && (!signIconFile || !signWithIcon)) {
        toast({ title: t('voxGenerator.errors.noIcon'), description: t('voxGenerator.errors.noIconDesc'), variant: 'destructive' });
        return;
    }
    
    setIsPending(true);
    setSchematicOutput(null);

    try {
        let iconData: { pixels: boolean[], width: number, height: number, offsetY?: number } | undefined = undefined;
        
        if (signIconFile && signWithIcon) {
            const currentSignWidth = signType === 'hanging' ? hangingWidth : signWidth;
            const currentFrameWidth = signType === 'hanging' ? 2 : (signFrame ? signFrameWidth : 0);
            const contentWidth = currentSignWidth - currentFrameWidth * 2;
            
            const img = document.createElement('img');
            const imgPromise = new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = reject;
                img.src = URL.createObjectURL(signIconFile);
            });
            await imgPromise;
            URL.revokeObjectURL(img.src);

            const iconTargetWidth = Math.floor(contentWidth * (signIconScale / 100));
            iconData = await imageToPixels(img, iconTargetWidth);
        }
        
        const input: SignToVoxInput = {
            signType,
            width: signWidth,
            height: signHeight,
            frameWidth: signFrameWidth,
            hangingWidth,
            hangingIconPosition,
            icon: iconData,
            text: signText,
            frame: signFrame,
            signIconScale: signIconScale,
            signIconOffsetY: signIconOffsetY,
            textOffsetY: textOffsetY,
            signWithIcon: signWithIcon,
            hangingSignThickness,
            hangingSignIconOffsetX,
            hangingSignTextOffsetX,
        };

        const result: SignToVoxOutput = await generateSignToVoxFlow(input);
        const voxDataBytes = Buffer.from(result.voxData, 'base64');
        setSchematicOutput({ ...result, voxData: voxDataBytes, voxSize: result.voxSize });
    } catch (error) {
        console.error("Sign generation failed:", error);
        toast({
            title: t('common.errors.generationFailed'),
            description: (error instanceof Error) ? error.message : t('common.errors.serverError'),
            variant: "destructive",
        });
        setSchematicOutput(null);
    } finally {
        setIsPending(false);
    }
  };

  const currentContentHeight = (signType === 'standard' ? signHeight : 16) - ((signType === 'standard' && signFrame) ? signFrameWidth * 2 : 4);
  const maxIconOffset = Math.floor(currentContentHeight / 2);
  const maxHangingOffsetX = 20;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
        <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
                <Label>{t('voxGenerator.sign.signType')}</Label>
                <RadioGroup value={signType} onValueChange={(v) => setSignType(v as SignType)} className="flex pt-2 space-x-4 bg-muted/30 p-1 rounded-lg">
                   <RadioGroupItem value="standard" id="type-standard" className="sr-only" />
                    <Label htmlFor="type-standard" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", signType === 'standard' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                       {t('voxGenerator.sign.types.standard')}
                    </Label>
                    <RadioGroupItem value="hanging" id="type-hanging" className="sr-only" />
                    <Label htmlFor="type-hanging" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", signType === 'hanging' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                        {t('voxGenerator.sign.types.hanging')}
                    </Label>
                </RadioGroup>
            </div>

            {signType === 'standard' ? (
              <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                      <Switch id="sign-frame" checked={signFrame} onCheckedChange={setSignFrame} />
                      <Label htmlFor="sign-frame">{t('voxGenerator.sign.withFrame')}</Label>
                  </div>
              </div>
            ) : (
              <div className="space-y-4">
                 <div className="space-y-2">
                    <Label>{t('voxGenerator.dims.width')}</Label>
                    <Select value={String(hangingWidth)} onValueChange={(v) => setHangingWidth(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="48">48</SelectItem>
                            <SelectItem value="64">64</SelectItem>
                            <SelectItem value="80">80</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
                 <div className="space-y-2">
                    <Label>{t('voxGenerator.sign.iconPosition')}</Label>
                     <RadioGroup value={hangingIconPosition} onValueChange={(v) => setHangingIconPosition(v as any)} className="flex pt-2 space-x-4 bg-muted/30 p-1 rounded-lg">
                       <RadioGroupItem value="left" id="pos-left" className="sr-only" />
                        <Label htmlFor="pos-left" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer flex items-center justify-center gap-2", hangingIconPosition === 'left' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                           <ArrowLeftRight className="h-4 w-4 transform -scale-x-100" /> <WholeWord className="h-4 w-4" />
                        </Label>
                        <RadioGroupItem value="right" id="pos-right" className="sr-only" />
                        <Label htmlFor="pos-right" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer flex items-center justify-center gap-2", hangingIconPosition === 'right' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                           <WholeWord className="h-4 w-4" /> <ArrowLeftRight className="h-4 w-4" />
                        </Label>
                    </RadioGroup>
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="hanging-sign-thickness">{t('voxGenerator.sign.thickness')}: {hangingSignThickness}px</Label>
                    <Slider id="hanging-sign-thickness" min={1} max={16} step={1} value={[hangingSignThickness]} onValueChange={(v) => setHangingSignThickness(v[0])} />
                  </div>
              </div>
            )}
            <div className="space-y-2">
                <Label htmlFor="sign-text-input">{t('textConstructor.textLabel')}</Label>
                <Input id="sign-text-input" value={signText} onChange={(e) => setSignText(e.target.value)} placeholder={t('textConstructor.textPlaceholder')} />
                <p className="text-xs text-muted-foreground bg-black/20 p-2 rounded-md border border-input">{t('voxGenerator.sign.textHint')}</p>
            </div>
            
             <div className="flex items-center space-x-2 pt-2">
                <Switch id="sign-with-icon" checked={signWithIcon} onCheckedChange={setSignWithIcon} />
                <Label htmlFor="sign-with-icon">{t('voxGenerator.sign.iconLabel')}</Label>
            </div>
            
            {signWithIcon && (
                <div className="space-y-4 pt-4 border-t border-primary/20">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="sign-icon-upload">{t('voxGenerator.sign.iconLabel')}</Label>
                            <Button asChild variant="link" size="sm" className="text-muted-foreground -mr-3">
                                <a href="https://ru.freepik.com/icons" target="_blank" rel="noopener noreferrer">
                                    {t('voxGenerator.sign.findIcons')} <ExternalLink className="ml-2 h-4 w-4" />
                                </a>
                            </Button>
                        </div>
                        <div className="flex gap-2">
                            <Button asChild variant="outline" className="flex-1">
                                <label className="cursor-pointer flex items-center justify-center">
                                    <Upload className="mr-2 h-4 w-4" />
                                    {signIconFile ? signIconFile.name : t('voxGenerator.sign.uploadButton')}
                                    <input ref={signIconInputRef} id="sign-icon-upload" type="file" className="sr-only" onChange={handleSignIconFileChange} accept="image/png, image/jpeg, image/gif, image/svg+xml" />
                                </label>
                            </Button>
                            {signIconUrl && <img src={signIconUrl} alt="Icon Preview" className="h-10 w-10 p-1 border rounded-md object-contain" />}
                        </div>
                    </div>
                
                    <div className="space-y-2">
                        <Label htmlFor="sign-icon-scale">{t('voxGenerator.sign.iconScale')}: {signIconScale}%</Label>
                        <Slider id="sign-icon-scale" min={10} max={100} step={1} value={[signIconScale]} onValueChange={(v) => setSignIconScale(v[0])} disabled={signType === 'hanging'} />
                    </div>
                </div>
            )}
            
            <div className="space-y-2 pt-4 border-t border-primary/20">
              <Label>{t('voxGenerator.sign.layout')}</Label>
              {signType === 'hanging' ? (
                <>
                  {signWithIcon && (
                     <div className="space-y-2">
                        <Label htmlFor="hanging-icon-offset-x">{t('voxGenerator.sign.iconOffsetX')}: {hangingSignIconOffsetX}px</Label>
                        <Slider id="hanging-icon-offset-x" min={-maxHangingOffsetX} max={maxHangingOffsetX} step={1} value={[hangingSignIconOffsetX]} onValueChange={(v) => setHangingSignIconOffsetX(v[0])} />
                      </div>
                  )}
                   <div className="space-y-2">
                        <Label htmlFor="hanging-text-offset-x">{t('voxGenerator.sign.textOffsetX')}: {hangingSignTextOffsetX}px</Label>
                        <Slider id="hanging-text-offset-x" min={-maxHangingOffsetX} max={maxHangingOffsetX} step={1} value={[hangingSignTextOffsetX]} onValueChange={(v) => setHangingSignTextOffsetX(v[0])} />
                      </div>
                </>
              ) : (
                <>
                  {signWithIcon && (
                    <div className="space-y-2">
                      <Label htmlFor="sign-icon-offset-y">{t('voxGenerator.sign.iconOffsetY')}: {signIconOffsetY}px</Label>
                      <Slider id="sign-icon-offset-y" min={-maxIconOffset} max={maxIconOffset} step={1} value={[signIconOffsetY]} onValueChange={(v) => setSignIconOffsetY(v[0])} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="text-offset-y">{t('voxGenerator.sign.textOffsetY')}: {textOffsetY}px</Label>
                    <Slider id="text-offset-y" min={-maxIconOffset} max={maxIconOffset} step={1} value={[textOffsetY]} onValueChange={(v) => setTextOffsetY(v[0])} />
                  </div>
                </>
              )}
            </div>
          <Button onClick={handleGenerateSign} disabled={isPending} className="w-full uppercase font-bold tracking-wider">
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
