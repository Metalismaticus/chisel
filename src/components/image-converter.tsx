'use client';

import { useState, useRef, useEffect, type DragEvent } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { SchematicPreview } from './schematic-preview';
import { UploadCloud, Loader2, HelpCircle } from 'lucide-react';
import type { SchematicOutput } from '@/lib/schematic-utils';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useI18n } from '@/locales/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type ConversionMode = 'bw' | 'color';

export function ImageConverter() {
  const t = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [schematic, setSchematic] = useState<SchematicOutput | null>(null);
  const [mode, setMode] = useState<ConversionMode>('bw');
  const [threshold, setThreshold] = useState([128]);
  const [outputWidth, setOutputWidth] = useState('64');
  const [isPending, setIsPending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker>();
  const { toast } = useToast();

  useEffect(() => {
    workerRef.current = new Worker(new URL('../lib/image.worker.ts', import.meta.url));
    
    workerRef.current.onmessage = (event: MessageEvent<SchematicOutput | { error: string }>) => {
      setIsPending(false); 
      if ('error' in event.data) {
        toast({
          title: t('imageConverter.errors.conversionFailed'),
          description: event.data.error,
          variant: "destructive",
        });
        setSchematic(null);
      } else {
        setSchematic(event.data);
      }
    };
    
    workerRef.current.onerror = (error) => {
       toast({
         title: t('imageConverter.errors.workerError'),
         description: t('imageConverter.errors.workerErrorDesc'),
         variant: "destructive",
       });
       setSchematic(null);
       setIsPending(false);
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, [toast, t]);

  const processFile = (selectedFile: File | undefined) => {
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        toast({
          title: t('imageConverter.errors.invalidFileType'),
          description: t('imageConverter.errors.invalidFileTypeDesc'),
          variant: 'destructive',
        });
        return;
      }

      setFile(selectedFile);
      setSchematic(null);
      
      if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
      }
      
      const newPreviewUrl = URL.createObjectURL(selectedFile);
      setPreviewUrl(newPreviewUrl);
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFile(event.target.files?.[0]);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    processFile(event.dataTransfer.files?.[0]);
  };

  const handleConvert = () => {
    if (!file) {
      toast({
        title: t('imageConverter.errors.noImage'),
        description: t('imageConverter.errors.noImageDesc'),
        variant: "destructive",
      });
      return;
    }
    
    const width = parseInt(outputWidth, 10);
    if (isNaN(width) || width <= 0) {
       toast({
        title: t('imageConverter.errors.invalidWidth'),
        description: t('imageConverter.errors.invalidWidthDesc'),
        variant: "destructive",
      });
      return;
    }
    
    setSchematic(null);
    setIsPending(true);
    
    workerRef.current?.postMessage({ file, threshold: threshold[0], outputWidth: width, mode });
  };
  
  useEffect(() => {
    return () => {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }
    }
  }, [previewUrl]);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
         <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('imageConverter.title')}</CardTitle>
              <CardDescription>{t('imageConverter.description')}</CardDescription>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                 <Button variant="ghost" size="icon"><HelpCircle className="h-6 w-6 text-primary" /></Button>
              </DialogTrigger>
               <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('imageConverter.help.title')}</DialogTitle>
                </DialogHeader>
                <div className="prose prose-invert max-w-none text-foreground text-sm">
                  <p>{t('imageConverter.help.p1')}</p>
                  <p>{t('imageConverter.help.p2')}</p>
                </div>
              </DialogContent>
            </Dialog>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="image-upload">{t('imageConverter.uploadLabel')}</Label>
            <div 
              className={cn(
                "mt-2 flex justify-center rounded-lg border border-dashed border-input px-6 py-10 cursor-pointer hover:border-primary transition-colors",
                 isDragging && "border-primary bg-primary/10"
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="text-center">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
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
                  ref={fileInputRef}
                  id="image-upload"
                  type="file"
                  className="sr-only"
                  onChange={handleFileChange}
                  accept="image/png, image/jpeg, image/gif"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="outputWidth">{t('imageConverter.widthLabel')}</Label>
                <Input 
                  id="outputWidth"
                  type="number"
                  value={outputWidth}
                  onChange={(e) => setOutputWidth(e.target.value)}
                  placeholder="e.g., 64"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('imageConverter.modeLabel')}</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as ConversionMode)} className="flex pt-2 space-x-4">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="bw" id="mode-bw" />
                        <Label htmlFor="mode-bw">{t('imageConverter.modes.bw')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="color" id="mode-color" />
                        <Label htmlFor="mode-color">{t('imageConverter.modes.color')}</Label>
                    </div>
                </RadioGroup>
              </div>
          </div>
          
          {mode === 'bw' && (
            <div className="space-y-2">
              <Label htmlFor="threshold">{t('imageConverter.thresholdLabel')}: {threshold[0]}</Label>
              <Slider
                id="threshold"
                min={0}
                max={255}
                step={1}
                value={threshold}
                onValueChange={setThreshold}
              />
            </div>
          )}

          <Button onClick={handleConvert} disabled={isPending || !file} className="w-full uppercase font-bold tracking-wider">
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.converting')}
              </>
            ) : (
              t('imageConverter.button')
            )}
          </Button>
        </CardContent>
      </Card>
      <SchematicPreview schematicOutput={schematic} loading={isPending} />
    </div>
  );
}
