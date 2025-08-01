
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Loader2, RefreshCw, X, Copy, HelpCircle } from 'lucide-react';
import { VtmlRenderer } from './vtml-renderer';
import { useI18n } from '@/locales/client';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { VtmlPalette } from './vtml-palette';


// Game-tested palette
const CHAR_COLOR_MAP: { [key: string]: string } = {
  '█': '#D7D6C0', '▓': '#B2B1B9', '▒': '#8F888F', '░': '#736A5F',
  'Σ': '#9C7063', 'Ω': '#B1877E', 'ƒ': '#7B5446', '®': '#796F42',
  'Ò': '#7D7354', '»': '#918A5D', 'χ': '#586248', 'τ': '#526B3E',
  'ó': '#678063', '¥': '#8C869F', 'σ': '#8D879E', '♥': '#C7A5BE',
  'Ẅ': '#AF87A0', '≥': '#5B464E', '•': '#62574A', 'ю': '#9DBDB4',
  'ζ': '#606C6E', 'È': '#82636D', '◊': '#62575A', '┐': '#55494B',
  '┴': '#766D7C', '·': '#000000',
};

const BW_CHAR_RAMP = ['·', '░', '▒', '▓', '█'];
const BW_CHAR_MAP: {[key: string]: string} = {
    '█': '#D7D6C0',
    '▓': '#B2B1B9',
    '▒': '#8F888F',
    '░': '#736A5F',
    '·': '#000000',
};

type ConversionMode = 'color' | 'bw';

// --- Helper Functions ---
const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
};

const colorDistance = (c1: [number, number, number], c2: [number, number, number]): number => {
  const dr = c1[0] - c2[0];
  const dg = c1[1] - c2[1];
  const db = c1[2] - c2[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

// Cache palette for quick access
const PALETTE_CHARS = Object.keys(CHAR_COLOR_MAP);
const PALETTE_RGB = PALETTE_CHARS.map(char => hexToRgb(CHAR_COLOR_MAP[char]));

const findClosestRgb = (r: number, g: number, b: number): [number, number, number] => {
  let minDistance = Infinity;
  let closestColor: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < PALETTE_RGB.length; i++) {
    const distance = colorDistance([r, g, b], PALETTE_RGB[i]);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = PALETTE_RGB[i];
    }
  }
  return closestColor;
};

const findClosestChar = (r: number, g: number, b: number): string => {
  const closestRgb = findClosestRgb(r, g, b);
  const index = PALETTE_RGB.findIndex(color => color[0] === closestRgb[0] && color[1] === closestRgb[1] && color[2] === closestRgb[2]);
  return PALETTE_CHARS[index] || '·';
};

const getGrayscaleChar = (r: number, g: number, b: number): string => {
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const rampIndex = Math.round((gray / 255) * (BW_CHAR_RAMP.length - 1));
    return BW_CHAR_RAMP[rampIndex] || '·';
};

interface GenerateVtmlOptions {
    mode: ConversionMode;
    outputWidth: number;
    outputHeight: number;
    preserveAspectRatio: boolean;
    fontSize: number;
    dithering: boolean;
    brightness: number;
    contrast: number;
    posterizeLevels: number;
    charAspectRatio: number;
}

const generateVtml = (
  img: HTMLImageElement,
  options: GenerateVtmlOptions
): Promise<string> => {
  return new Promise((resolve) => {
    const { mode, outputWidth, outputHeight, preserveAspectRatio, fontSize, dithering, brightness, contrast, posterizeLevels, charAspectRatio } = options;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return resolve('');

    const imageAspectRatio = img.height / img.width;
    let width = outputWidth;
    let height = outputHeight;

    if (preserveAspectRatio) {
      height = Math.round(width * imageAspectRatio / charAspectRatio);
    }

    canvas.width = width;
    canvas.height = height;

    // Apply brightness and contrast filters
    const filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    context.filter = filter;
    
    context.drawImage(img, 0, 0, width, height);
    context.filter = 'none'; // Reset filter to not affect subsequent operations

    const imageData = context.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const f32Pixels = new Float32Array(pixels.length);

    for (let i = 0; i < pixels.length; i += 4) {
      // Posterization
      const factor = 255 / (posterizeLevels - 1);
      f32Pixels[i] = Math.round(Math.round(pixels[i] / factor) * factor);
      f32Pixels[i+1] = Math.round(Math.round(pixels[i+1] / factor) * factor);
      f32Pixels[i+2] = Math.round(Math.round(pixels[i+2] / factor) * factor);
      f32Pixels[i+3] = pixels[i+3];
    }


    let finalLines: string[] = [];

    for (let y = 0; y < height; y++) {
      let line = '';
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        
        if (f32Pixels[i+3] < 128) {
            line += '·';
            continue;
        }

        const oldR = f32Pixels[i];
        const oldG = f32Pixels[i + 1];
        const oldB = f32Pixels[i + 2];
        
        let char = '·';
        
        if (mode === 'color') {
            const [newR, newG, newB] = findClosestRgb(oldR, oldG, oldB);
            char = findClosestChar(newR, newG, newB);
            if (dithering) {
                const errR = oldR - newR;
                const errG = oldG - newG;
                const errB = oldB - newB;

                const distributeError = (dx: number, dy: number, factor: number) => {
                    const ni = ((y + dy) * width + (x + dx)) * 4;
                    if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
                        f32Pixels[ni]     = Math.max(0, Math.min(255, f32Pixels[ni]     + errR * factor));
                        f32Pixels[ni + 1] = Math.max(0, Math.min(255, f32Pixels[ni + 1] + errG * factor));
                        f32Pixels[ni + 2] = Math.max(0, Math.min(255, f32Pixels[ni + 2] + errB * factor));
                    }
                };
                distributeError(1, 0, 7 / 16);
                distributeError(-1, 1, 3 / 16);
                distributeError(0, 1, 5 / 16);
                distributeError(1, 1, 1 / 16);
            }
        } else { // 'bw' mode
            const newChar = getGrayscaleChar(oldR, oldG, oldB);
            char = newChar;
            
            if (dithering) {
                const gray = 0.299 * oldR + 0.587 * oldG + 0.114 * oldB;
                const newGray = BW_CHAR_RAMP.indexOf(newChar) * (255 / (BW_CHAR_RAMP.length -1));
                const err = gray - newGray;
                const distributeError = (dx: number, dy: number, factor: number) => {
                    const ni = ((y + dy) * width + (x + dx)) * 4;
                    if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
                        const r = Math.max(0, Math.min(255, f32Pixels[ni] + err * factor));
                        const g = Math.max(0, Math.min(255, f32Pixels[ni+1] + err * factor));
                        const b = Math.max(0, Math.min(255, f32Pixels[ni+2] + err * factor));
                        f32Pixels[ni] = r;
                        f32Pixels[ni+1] = g;
                        f32Pixels[ni+2] = b;
                    }
                };
                distributeError(1, 0, 7 / 16);
                distributeError(-1, 1, 3 / 16);
                distributeError(0, 1, 5 / 16);
                distributeError(1, 1, 1 / 16);
            }
        }
        
        line += char;

      }
      finalLines.push(line);
    }
    
    const content = finalLines.join('<br>');
    const vtmlString = `<font size="${fontSize}" family="Lucida Console" align="center">${content}</font>`;
    resolve(vtmlString);
  });
};

export function VtmlConverter() {
  const t = useI18n();

  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [conversionMode, setConversionMode] = useState<ConversionMode>('color');
  const [fontSize, setFontSize] = useState(1);
  const [outputWidth, setOutputWidth] = useState(80);
  const [outputHeight, setOutputHeight] = useState(80);
  const [preserveAspectRatio, setPreserveAspectRatio] = useState(true);
  const [dithering, setDithering] = useState(true);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [posterizeLevels, setPosterizeLevels] = useState(8);
  const [charAspectRatio, setCharAspectRatio] = useState(2);

  const [vtmlCode, setVtmlCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDirty, setIsDirty] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          variant: "destructive",
          title: t('vtmlConverter.errors.invalidFileType'),
          description: t('vtmlConverter.errors.invalidFileTypeDesc'),
        });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoDataUri(reader.result as string);
        setVtmlCode('');
        setIsDirty(true);
      };
      reader.onerror = () => {
        toast({
          variant: "destructive",
          title: t('vtmlConverter.errors.fileReadError'),
          description: t('vtmlConverter.errors.fileReadErrorDesc'),
        });
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleGenerateClick = useCallback(async () => {
    if (!photoDataUri || !imageRef.current || !imageRef.current.complete || imageRef.current.naturalHeight === 0) {
      toast({
        title: t('vtmlConverter.errors.imageNotReady'),
        description: t('vtmlConverter.errors.imageNotReadyDesc'),
      });
      return;
    }
    setIsGenerating(true);
    try {
      const code = await generateVtml(imageRef.current, { 
        mode: conversionMode, 
        outputWidth,
        outputHeight,
        preserveAspectRatio,
        fontSize, 
        dithering, 
        brightness, 
        contrast, 
        posterizeLevels, 
        charAspectRatio 
      });
      setVtmlCode(code);
      setIsDirty(false); 
    } catch (error) {
      console.error("Image to VTML conversion error:", error);
      toast({
        variant: "destructive",
        title: t('common.errors.generationFailed'),
        description: (error instanceof Error) ? error.message : t('common.errors.genericError'),
      });
    } finally {
      setIsGenerating(false);
    }
  }, [photoDataUri, conversionMode, outputWidth, outputHeight, preserveAspectRatio, fontSize, dithering, brightness, contrast, posterizeLevels, charAspectRatio, toast, t]);
  
  const handleSettingsChange = (setter: React.Dispatch<React.SetStateAction<any>>) => (value: any) => {
    setter(value);
    setIsDirty(true);
  };

  const handleSliderChange = (setter: React.Dispatch<React.SetStateAction<any>>) => (value: number[]) => {
      setter(value[0]);
      setIsDirty(true);
  };
   const handleDecimalSliderChange = (setter: React.Dispatch<React.SetStateAction<any>>) => (value: number[]) => {
      setter(value[0]);
      setIsDirty(true);
  };

  const handleDownload = () => {
    if (!vtmlCode) {
      toast({
        variant: "destructive",
        title: t('vtmlConverter.errors.nothingToDownload'),
        description: t('vtmlConverter.errors.nothingToDownloadDesc'),
      });
      return;
    }
    const blob = new Blob([vtmlCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'art.vtml.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
   const handleCopy = () => {
    if (!vtmlCode) {
      toast({
        variant: 'destructive',
        title: t('vtmlConverter.errors.nothingToCopy'),
        description: t('vtmlConverter.errors.nothingToCopyDesc'),
      });
      return;
    }
    navigator.clipboard.writeText(vtmlCode);
    toast({
      title: t('schematicPreview.copied'),
    });
  };
  
   const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
     if (fileInputRef.current) {
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            fileInputRef.current.files = files;
            const changeEvent = new Event('change', { bubbles: true });
            fileInputRef.current.dispatchEvent(changeEvent);
        }
      }
  };

  const isLoading = isGenerating;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {photoDataUri && <img ref={imageRef} src={photoDataUri} alt="Hidden source for canvas" className="hidden" onLoad={() => setIsDirty(true)} />}
      
      <div className="space-y-6">
        <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
           <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t('vtmlConverter.step1.title')}</CardTitle>
                <CardDescription>{t('vtmlConverter.step1.description')}</CardDescription>
              </div>
               <Dialog>
                <DialogTrigger asChild>
                   <Button variant="ghost" size="icon"><HelpCircle className="h-6 w-6 text-primary" /></Button>
                </DialogTrigger>
                <DialogContent className="max-w-[80vw] w-full max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t('vtmlConverter.help.title')}</DialogTitle>
                    <DialogDescription>{t('vtmlConverter.help.intro')}</DialogDescription>
                  </DialogHeader>
                  <div className="prose prose-invert max-w-none text-foreground space-y-4">
                      <p>{t('vtmlConverter.help.main_desc')}</p>
                      <h3 className="font-headline text-xl text-primary">{t('vtmlConverter.help.palette_title')}</h3>
                       <p>{t('vtmlConverter.help.palette_info')}</p>
                       <VtmlPalette />
                       <h3 className="font-headline text-xl text-primary">{t('vtmlConverter.help.example_title')}</h3>
                       <p className="text-muted-foreground">{t('vtmlConverter.help.example_intro')}</p>
                       <div className="bg-black/50 p-2 rounded-md font-code text-sm overflow-x-auto">
                         <VtmlRenderer code={t('vtmlConverter.help.example_code')} />
                       </div>
                       <p className="text-muted-foreground">{t('vtmlConverter.help.palette_footer')}</p>
                  </div>
                </DialogContent>
              </Dialog>
           </CardHeader>
          <CardContent>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/png, image/jpeg, image/gif"
              id="file-upload"
            />
            {photoDataUri ? (
              <div className="relative aspect-video w-full rounded-lg overflow-hidden border-2 border-dashed border-primary">
                <Image src={photoDataUri} alt={t('imageConverter.previewAlt')} layout="fill" objectFit="contain" />
                <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={() => { setPhotoDataUri(null); setVtmlCode(''); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
                <label 
                    className={cn(
                        "flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-card/50 hover:bg-muted/50 transition-colors",
                        isDragging && "border-primary bg-primary/10"
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    htmlFor="file-upload"
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground">
                        <span className="font-semibold text-primary">{t('vtmlConverter.step1.clickToUpload')}</span> {t('vtmlConverter.step1.orDragAndDrop')}
                      </p>
                      <p className="text-xs text-muted-foreground">{t('vtmlConverter.step1.fileTypes')}</p>
                    </div>
                </label>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>{t('vtmlConverter.step2.title')}</CardTitle>
            <CardDescription>{t('vtmlConverter.step2.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
             <div className="grid gap-2">
                <Label>{t('imageConverter.modeLabel')}</Label>
                <RadioGroup value={conversionMode} onValueChange={handleSettingsChange(setConversionMode)} className="flex pt-2 space-x-4">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="color" id="mode-color" />
                        <Label htmlFor="mode-color">{t('imageConverter.modes.color')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="bw" id="mode-bw" />
                        <Label htmlFor="mode-bw">{t('imageConverter.modes.bw')}</Label>
                    </div>
                </RadioGroup>
              </div>

             <div className="flex items-center space-x-2">
                <Switch id="dithering-mode" checked={dithering} onCheckedChange={handleSettingsChange(setDithering)} disabled={isLoading} />
                <Label htmlFor="dithering-mode">{t('vtmlConverter.step2.dithering')}</Label>
            </div>
            <div className="grid gap-2">
                <div className="flex justify-between items-center">
                    <Label htmlFor="brightness-slider">{t('vtmlConverter.step2.brightness')}</Label>
                    <span className="text-sm font-mono px-2 py-1 rounded-md bg-muted">{brightness}%</span>
                </div>
                <Slider id="brightness-slider" min={0} max={200} step={1} value={[brightness]} onValueChange={handleSliderChange(setBrightness)} disabled={isLoading} />
            </div>
             <div className="grid gap-2">
                <div className="flex justify-between items-center">
                    <Label htmlFor="contrast-slider">{t('vtmlConverter.step2.contrast')}</Label>
                    <span className="text-sm font-mono px-2 py-1 rounded-md bg-muted">{contrast}%</span>
                </div>
                <Slider id="contrast-slider" min={0} max={200} step={1} value={[contrast]} onValueChange={handleSliderChange(setContrast)} disabled={isLoading} />
            </div>
            <div className="grid gap-2">
                <div className="flex justify-between items-center">
                    <Label htmlFor="posterize-slider">{t('vtmlConverter.step2.posterization')}</Label>
                    <span className="text-sm font-mono px-2 py-1 rounded-md bg-muted">{posterizeLevels}</span>
                </div>
                <Slider id="posterize-slider" min={2} max={32} step={1} value={[posterizeLevels]} onValueChange={handleSliderChange(setPosterizeLevels)} disabled={isLoading} />
            </div>
            <div className="grid gap-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="char-aspect-ratio-slider">{t('vtmlConverter.step2.charAspectRatio')}</Label>
                  <span className="text-sm font-mono px-2 py-1 rounded-md bg-muted">{charAspectRatio.toFixed(1)}</span>
                </div>
                <Slider id="char-aspect-ratio-slider" min={1.0} max={3.0} step={0.1} value={[charAspectRatio]} onValueChange={handleDecimalSliderChange(setCharAspectRatio)} disabled={isLoading} />
            </div>
             <div className="flex items-center space-x-2">
                <Switch id="preserve-aspect-ratio-mode" checked={preserveAspectRatio} onCheckedChange={handleSettingsChange(setPreserveAspectRatio)} disabled={isLoading} />
                <Label htmlFor="preserve-aspect-ratio-mode">{t('vtmlConverter.step2.preserveAspectRatio')}</Label>
            </div>
            <div className="grid gap-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="width-slider">{t('vtmlConverter.step2.outputWidth')}</Label>
                <span className="text-sm font-mono px-2 py-1 rounded-md bg-muted">{outputWidth}</span>
              </div>
              <Slider id="width-slider" min={20} max={400} step={1} value={[outputWidth]} onValueChange={handleSliderChange(setOutputWidth)} disabled={isLoading} />
            </div>
            {!preserveAspectRatio && (
              <div className="grid gap-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="height-slider">{t('vtmlConverter.step2.outputHeight')}</Label>
                  <span className="text-sm font-mono px-2 py-1 rounded-md bg-muted">{outputHeight}</span>
                </div>
                <Slider id="height-slider" min={20} max={400} step={1} value={[outputHeight]} onValueChange={handleSliderChange(setOutputHeight)} disabled={isLoading} />
              </div>
            )}
            <div className="grid gap-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="font-size">{t('vtmlConverter.step2.fontSize')}</Label>
                <span className="text-sm font-mono px-2 py-1 rounded-md bg-muted">{fontSize}</span>
              </div>
              <Slider id="font-size" min={1} max={24} step={1} value={[fontSize]} onValueChange={handleSliderChange(setFontSize)} disabled={isLoading} />
            </div>
             <Button onClick={handleGenerateClick} disabled={isLoading || !isDirty || !photoDataUri} className="w-full uppercase font-bold tracking-wider">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {isDirty ? t('vtmlConverter.step2.button') : t('vtmlConverter.step2.buttonUpToDate')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm h-full min-h-[500px] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('vtmlConverter.step3.title')}</CardTitle>
            <CardDescription>{t('vtmlConverter.step3.description')}</CardDescription>
           </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={!vtmlCode || isLoading}>
                <Copy className="mr-2 h-4 w-4" />
                {t('common.copy')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} disabled={!vtmlCode || isLoading}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.download')}
              </Button>
            </div>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col gap-4">
            <div className="flex-1 border rounded-md bg-black/50 p-2 overflow-auto relative">
              {isLoading && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 backdrop-blur-sm">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
              )}
              <VtmlRenderer code={vtmlCode} />
            </div>
            <Textarea
              readOnly
              placeholder={isLoading ? t('common.generating') : t('vtmlConverter.step3.placeholder')}
              value={vtmlCode}
              className="flex-1 w-full font-mono text-xs bg-black/20 resize-none"
            />
        </CardContent>
      </Card>
    </div>
  );
}

    