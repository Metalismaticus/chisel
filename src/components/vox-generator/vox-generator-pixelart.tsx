
'use client';

import { useState, useRef, useEffect, DragEvent } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SchematicPreview } from '@/components/schematic-preview';
import { useToast } from '@/hooks/use-toast';
import { type SchematicOutput, type TextOrientation } from '@/lib/schematic-utils';
import { useI18n } from '@/locales/client';
import { generatePixelArtToVoxFlow, type PixelArtToVoxInput, type PixelArtToVoxOutput } from '@/ai/flows/pixelart-to-vox-flow';
import { Loader2, UploadCloud } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '../ui/switch';
import { cn } from '@/lib/utils';

type PixelArtVoxMode = 'extrude' | 'engrave';

export function VoxGeneratorPixelArt() {
  const t = useI18n();
  const [paFile, setPaFile] = useState<File | null>(null);
  const [paPreviewUrl, setPaPreviewUrl] = useState<string | null>(null);
  const [paThreshold, setPaThreshold] = useState([128]);
  const [paOutputWidth, setPaOutputWidth] = useState('64');
  const [paInvert, setPaInvert] = useState(false);
  const [paVoxMode, setPaVoxMode] = useState<PixelArtVoxMode>('extrude');
  const [paExtrudeDepth, setPaExtrudeDepth] = useState([5]);
  const [paStickerMode, setPaStickerMode] = useState(true);
  const [paEngraveBgDepth, setPaEngraveBgDepth] = useState([16]);
  const [paEngraveDepth, setPaEngraveDepth] = useState([3]);
  const [isDragging, setIsDragging] = useState(false);
  const paFileInputRef = useRef<HTMLInputElement>(null);
  const paWorkerRef = useRef<Worker>();
  const [paOrientation, setPaOrientation] = useState<TextOrientation>('horizontal');

  const [schematicOutput, setSchematicOutput] = useState<any | null>(null);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (paPreviewUrl) { URL.revokeObjectURL(paPreviewUrl); }
    };
  }, [paPreviewUrl]);

  useEffect(() => {
    paWorkerRef.current = new Worker(new URL('../../lib/image.worker.ts', import.meta.url));
    
    paWorkerRef.current.onerror = (error) => {
       toast({
         title: t('imageConverter.errors.workerError'),
         description: t('imageConverter.errors.workerErrorDesc'),
         variant: "destructive",
       });
       setSchematicOutput(null);
       setIsPending(false);
    }

    return () => {
      paWorkerRef.current?.terminate();
    };
  }, [toast, t]);

  const validateAndParse = (value: string, name: string, min = 1): number | null => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min) {
      toast({ title: t('voxGenerator.errors.invalid', { name }), description: t('voxGenerator.errors.enterPositiveNumber', { name }), variant: "destructive" });
      return null;
    }
    return parsed;
  }

  const handleGeneratePixelArt = async () => {
    if (!paFile) {
        toast({ title: t('imageConverter.errors.noImage'), description: t('imageConverter.errors.noImageDesc'), variant: "destructive" });
        return;
    }
    const width = validateAndParse(paOutputWidth, t('imageConverter.widthLabel'));
    if (width === null) return;
    
    setIsPending(true);
    setSchematicOutput(null);

    paWorkerRef.current!.onmessage = async (event: MessageEvent<SchematicOutput | { error: string }>) => {
        if ('error' in event.data) {
            toast({
                title: t('imageConverter.errors.conversionFailed'),
                description: event.data.error,
                variant: "destructive",
            });
            setSchematicOutput(null);
            setIsPending(false);
        } else {
            let pixelData = event.data.pixels;
            if (paInvert) {
                pixelData = pixelData.map(p => !p);
            }
            
            const input: PixelArtToVoxInput = {
                pixels: pixelData as boolean[],
                width: event.data.width,
                height: event.data.height,
                mode: paVoxMode,
                extrudeDepth: paExtrudeDepth[0],
                engraveBackgroundDepth: paEngraveBgDepth[0],
                engraveDepth: paEngraveDepth[0],
                stickerMode: paStickerMode,
                orientation: paOrientation,
            };

            try {
              const result: PixelArtToVoxOutput = await generatePixelArtToVoxFlow(input);
              const voxDataBytes = Buffer.from(result.voxData, 'base64');
              setSchematicOutput({ ...result, voxData: voxDataBytes, voxSize: (result as any).voxSize });
            } catch (flowError) {
               toast({
                title: t('common.errors.generationFailed'),
                description: (flowError instanceof Error) ? flowError.message : t('common.errors.serverError'),
                variant: "destructive",
              });
              setSchematicOutput(null);
            } finally {
              setIsPending(false);
            }
        }
    };
    
    paWorkerRef.current?.postMessage({ file: paFile, threshold: paThreshold[0], outputWidth: width, mode: 'bw' });
  }

  const handlePaFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processPaFile(event.target.files?.[0]);
  };

  const handlePaDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handlePaDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handlePaDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    processPaFile(event.dataTransfer.files?.[0]);
  };
  
   const processPaFile = (selectedFile: File | undefined) => {
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        toast({
          title: t('imageConverter.errors.invalidFileType'),
          description: t('imageConverter.errors.invalidFileTypeDesc'),
          variant: 'destructive',
        });
        return;
      }

      setPaFile(selectedFile);
      setSchematicOutput(null);
      
      if (paPreviewUrl) {
          URL.revokeObjectURL(paPreviewUrl);
      }
      
      const newPreviewUrl = URL.createObjectURL(selectedFile);
      setPaPreviewUrl(newPreviewUrl);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
        <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
                <Label htmlFor="image-upload">{t('imageConverter.uploadLabel')}</Label>
                <div 
                  className={cn(
                    "mt-2 flex justify-center rounded-lg border border-dashed border-input px-6 py-10 cursor-pointer hover:border-primary transition-colors",
                     isDragging && "border-primary bg-primary/10"
                  )}
                  onClick={() => paFileInputRef.current?.click()}
                  onDragOver={handlePaDragOver}
                  onDragLeave={handlePaDragLeave}
                  onDrop={handlePaDrop}
                >
                  <div className="text-center">
                    {paPreviewUrl ? (
                      <Image
                        src={paPreviewUrl}
                        alt={t('imageConverter.previewAlt')}
                        width={200}
                        height={200}
                        className="mx-auto h-32 w-auto rounded-md object-contain"
                      />
                    ) : (
                      <>
                        <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
                        <div className="mt-4 flex text-sm leading-6 text-muted-foreground">
                          <p className="pl-1">{t('imageConverter.dropzone')}</p>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">{t('imageConverter.dropzoneHint')}</p>
                      </>
                    )}
                    <Input
                      ref={paFileInputRef}
                      id="pa-image-upload"
                      type="file"
                      className="sr-only"
                      onChange={handlePaFileChange}
                      accept="image/png, image/jpeg, image/gif"
                    />
                  </div>
                </div>
            </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="paOutputWidth">{t('imageConverter.widthLabel')}</Label>
                    <Input 
                    id="paOutputWidth"
                    type="number"
                    value={paOutputWidth}
                    onChange={(e) => setPaOutputWidth(e.target.value)}
                    placeholder="e.g., 64"
                    />
                </div>
                <div className="flex items-center space-x-2 self-end pb-2">
                  <Switch id="pa-invert" checked={paInvert} onCheckedChange={setPaInvert} />
                  <Label htmlFor="pa-invert">{t('voxGenerator.pixelart.invert')}</Label>
                </div>
             </div>
             <div className="space-y-2">
              <Label htmlFor="pa-threshold">{t('imageConverter.thresholdLabel')}: {paThreshold[0]}</Label>
              <Slider
                id="pa-threshold"
                min={0}
                max={255}
                step={1}
                value={paThreshold}
                onValueChange={setPaThreshold}
              />
            </div>

            <div className="space-y-2">
                <Label>{t('voxGenerator.text.orientation.label')}</Label>
                <RadioGroup value={paOrientation} onValueChange={(v) => setPaOrientation(v as TextOrientation)} className="flex pt-2 space-x-4 bg-muted/30 p-1 rounded-lg">
                    <RadioGroupItem value="horizontal" id="pa-horizontal" className="sr-only" />
                    <Label 
                        htmlFor="pa-horizontal"
                        className={cn(
                            "flex-1 text-center py-2 px-4 rounded-md cursor-pointer",
                            paOrientation === 'horizontal' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50'
                        )}
                    >
                        {t('voxGenerator.text.orientation.horizontal')}
                    </Label>
                    <RadioGroupItem value="vertical-lr" id="pa-vertical" className="sr-only" />
                    <Label 
                        htmlFor="pa-vertical"
                        className={cn(
                            "flex-1 text-center py-2 px-4 rounded-md cursor-pointer",
                            paOrientation === 'vertical-lr' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50'
                        )}
                    >
                        {t('voxGenerator.text.orientation.vertical')}
                    </Label>
                </RadioGroup>
            </div>
            
            <div className="space-y-2">
             <Label>{t('voxGenerator.text.modeLabel')}</Label>
             <RadioGroup value={paVoxMode} onValueChange={(v) => setPaVoxMode(v as PixelArtVoxMode)} className="flex pt-2 space-x-4">
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="extrude" id="pa-mode-extrude" />
                    <Label htmlFor="pa-mode-extrude">{t('voxGenerator.text.modes.extrude')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="engrave" id="pa-mode-engrave" />
                    <Label htmlFor="pa-mode-engrave">{t('voxGenerator.text.modes.engrave')}</Label>
                </div>
            </RadioGroup>
          </div>
          
           <div className="flex items-center space-x-2">
                <Switch id="pa-sticker-mode" checked={paStickerMode} onCheckedChange={setPaStickerMode} />
                <Label htmlFor="pa-sticker-mode">{t('voxGenerator.text.stickerMode')}</Label>
           </div>
           
            {paVoxMode === 'extrude' && (
              <div className="space-y-2">
                  <Label htmlFor="pa-extrude-depth">{t('voxGenerator.pixelart.drawingDepth')}: {paExtrudeDepth[0]}px</Label>
                  <Slider
                      id="pa-extrude-depth"
                      min={1} max={50} step={1}
                      value={paExtrudeDepth}
                      onValueChange={setPaExtrudeDepth}
                  />
              </div>
            )}

           {paVoxMode === 'engrave' && (
            <div className="space-y-4">
                 <div className="space-y-2">
                    <Label htmlFor="pa-background-depth">{t('voxGenerator.text.backgroundDepth')}: {paEngraveBgDepth[0]}px</Label>
                    <Slider
                        id="pa-background-depth"
                        min={1} max={50} step={1}
                        value={paEngraveBgDepth}
                        onValueChange={setPaEngraveBgDepth}
                    />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="pa-engrave-depth">{t('voxGenerator.text.engraveDepth')}: {paEngraveDepth[0]}px</Label>
                    <Slider
                        id="pa-engrave-depth"
                        min={1} max={paEngraveBgDepth[0]} step={1}
                        value={paEngraveDepth}
                        onValueChange={setPaEngraveDepth}
                    />
                </div>
            </div>
          )}
          <Button onClick={handleGeneratePixelArt} disabled={isPending} className="w-full uppercase font-bold tracking-wider">
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
