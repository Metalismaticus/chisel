
'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SchematicPreview } from './schematic-preview';
import { useToast } from '@/hooks/use-toast';
import { type VoxShape, type SchematicOutput, rasterizeText, type FontStyle, type TextOrientation } from '@/lib/schematic-utils';
import { useI18n } from '@/locales/client';
import { generateVoxFlow, type VoxOutput } from '@/ai/flows/vox-flow';
import { generateTextToVoxFlow, type TextToVoxInput } from '@/ai/flows/text-to-vox-flow';
import { Loader2, Upload, QrCode, HelpCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from './ui/switch';
import { cn } from '@/lib/utils';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import Link from 'next/link';


type GeneratorMode = 'shape' | 'text' | 'qr';
type TextVoxMode = 'extrude' | 'engrave';

export function VoxGenerator() {
  const t = useI18n();
  const [mode, setMode] = useState<GeneratorMode>('shape');
  
  // Shape state
  const [shape, setShape] = useState<VoxShape['type']>('cuboid');
  const [dimensions, setDimensions] = useState({ 
    width: '16', 
    height: '16', 
    depth: '16', 
    radius: '16', 
    pyramidBase: '16',
    pyramidHeight: '16',
    coneRadius: '16',
    coneHeight: '16',
    columnRadius: '8',
    columnHeight: '16',
    baseRadius: '10',
    baseHeight: '4',
    breakAngle: '45',
    archWidth: '16',
    archHeight: '16',
    archDepth: '8',
    archOuterRadius: '4',
    circularArchWidth: '32',
    circularArchThickness: '4',
    diskRadius: '16',
    diskHeight: '1',
    ringRadius: '16',
    ringThickness: '4',
    ringHeight: '4',
  });
  const [spherePart, setSpherePart] = useState<'full' | 'hemisphere'>('full');
  const [hemisphereDirection, setHemisphereDirection] = useState<'top' | 'bottom' | 'vertical'>('top');
  const [diskPart, setDiskPart] = useState<'full' | 'half'>('full');
  const [diskOrientation, setDiskOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
    const [ringPart, setRingPart] = useState<'full' | 'half'>('full');
  const [ringOrientation, setRingOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [archType, setArchType] = useState<'rectangular' | 'rounded' | 'circular'>('rectangular');
  const [circularArchOrientation, setCircularArchOrientation] = useState<'top' | 'bottom'>('top');
  const [withBase, setWithBase] = useState(false);
  const [withCapital, setWithCapital] = useState(false);
  const [brokenTop, setBrokenTop] = useState(false);

  // Text state
  const [text, setText] = useState('Vintage');
  const [fontSize, setFontSize] = useState([32]);
  const [font, setFont] = useState<FontStyle>('serif');
  const [fontFile, setFontFile] = useState<File | null>(null);
  const fontFileUrlRef = useRef<string | null>(null);
  const [textVoxMode, setTextVoxMode] = useState<TextVoxMode>('extrude');
  const [textStickerMode, setTextStickerMode] = useState(true);
  const [letterDepth, setLetterDepth] = useState([5]);
  const [backgroundDepth, setBackgroundDepth] = useState([16]);
  const [engraveDepth, setEngraveDepth] = useState([3]);
  const [textOrientation, setTextOrientation] = useState<TextOrientation>('horizontal');
  
  // QR Code State
  const [qrUrl, setQrUrl] = useState('https://www.vintagestory.at/');
  const [qrCodeDepth, setQrCodeDepth] = useState([1]);
  const [withBackdrop, setWithBackdrop] = useState(false);
  const [backdropDepth, setBackdropDepth] = useState([4]);
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  const [schematicOutput, setSchematicOutput] = useState<any | null>(null);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  // Common logic
  const handleDimensionChange = (field: keyof typeof dimensions, value: string) => {
    setDimensions(prev => ({...prev, [field]: value}));
  };
  
  const handleSliderChange = (field: keyof typeof dimensions, value: number[]) => {
    setDimensions(prev => ({...prev, [field]: String(value[0])}));
  };
  
   useEffect(() => {
    return () => {
      if (fontFileUrlRef.current) {
        URL.revokeObjectURL(fontFileUrlRef.current);
      }
    };
  }, []);
  
    // Generate QR preview when URL changes
  useEffect(() => {
    if (mode === 'qr' && qrUrl) {
      QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'L', margin: 2 }, (err, url) => {
        if (err) {
          setQrPreview(null);
          return;
        };
        setQrPreview(url);
      });
    }
  }, [qrUrl, mode]);

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

  const validateAndParse = (value: string, name: string, min = 1): number | null => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min) {
      toast({ title: t('voxGenerator.errors.invalid', { name }), description: t('voxGenerator.errors.enterPositiveNumber', { name }), variant: "destructive" });
      return null;
    }
    return parsed;
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
            orientation: textOrientation,
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
            backgroundDepth: textVoxMode === 'engrave' ? backgroundDepth[0] : 0,
            engraveDepth: textVoxMode === 'engrave' ? engraveDepth[0] : 0,
            orientation: textOrientation,
            stickerMode: textStickerMode,
        };

        const result = await generateTextToVoxFlow(input);
        const voxDataBytes = Buffer.from(result.voxData, 'base64');
        setSchematicOutput({ ...result, voxData: voxDataBytes });

    } catch (error) {
        console.error(error);
        toast({
          title: t('common.errors.generationFailed'),
          description: (error instanceof Error) ? error.message : t('common.errors.serverError'),
          variant: "destructive",
        });
        setSchematicOutput(null);
    } finally {
        setIsPending(false);
    }
  }
  
  const handleGenerateQr = async () => {
    if (!qrUrl.trim()) {
        toast({ title: t('voxGenerator.errors.noQrUrl'), description: t('voxGenerator.errors.noQrUrlDesc'), variant: "destructive" });
        return;
    }
    
    setIsPending(true);
    setSchematicOutput(null);
    
    try {
      const qrData = QRCode.create(qrUrl, { errorCorrectionLevel: 'L' });
      const pixels: boolean[] = [];
      const size = qrData.modules.size;
      const borderSize = size + 2;
      for (let y = 0; y < borderSize; y++) {
          for (let x = 0; x < borderSize; x++) {
              if (x === 0 || y === 0 || x === borderSize - 1 || y === borderSize - 1) {
                  pixels.push(false);
              } else {
                  const module = qrData.modules.get(y - 1, x - 1);
                  pixels.push(module === 1);
              }
          }
      }

      const shapeParams: VoxShape = {
          type: 'qrcode',
          pixels,
          size: borderSize,
          depth: qrCodeDepth[0],
          stickerMode: true,
          withBackdrop: withBackdrop,
          backdropDepth: withBackdrop ? backdropDepth[0] : 0,
      };

      const result = await generateVoxFlow(shapeParams);
      const voxDataBytes = Buffer.from(result.voxData, 'base64');
      setSchematicOutput({ ...result, voxData: voxDataBytes });

    } catch (error) {
       console.error(error);
        toast({
          title: t('common.errors.generationFailed'),
          description: (error instanceof Error) ? error.message : t('common.errors.serverError'),
          variant: "destructive",
        });
        setSchematicOutput(null);
    } finally {
        setIsPending(false);
    }
  }

  const handleGenerateShape = async () => {
    setSchematicOutput(null);
    let shapeParams: VoxShape | null = null;

    try {
      switch(shape) {
        case 'cuboid': {
          const width = validateAndParse(dimensions.width, t('voxGenerator.dims.width'));
          const height = validateAndParse(dimensions.height, t('voxGenerator.dims.height'));
          const depth = validateAndParse(dimensions.depth, t('voxGenerator.dims.depth'));
          if (width === null || height === null || depth === null) return;
          shapeParams = { type: 'cuboid', width, height, depth };
          break;
        }
        case 'sphere': {
          const radius = validateAndParse(dimensions.radius, t('voxGenerator.dims.radius'));
          if (radius === null) return;
          let part: VoxShape['part'] = 'full';
          if (spherePart === 'hemisphere') {
            part = `hemisphere-${hemisphereDirection}`;
          }
          shapeParams = { type: 'sphere', radius, part };
          break;
        }
        case 'pyramid': {
           const base = validateAndParse(dimensions.pyramidBase, t('voxGenerator.dims.baseSize'));
           const height = validateAndParse(dimensions.pyramidHeight, t('voxGenerator.dims.height'));
           if (base === null || height === null) return;
           shapeParams = { type: 'pyramid', base, height };
          break;
        }
        case 'column': {
           const radius = validateAndParse(dimensions.columnRadius, t('voxGenerator.dims.radius'));
           const height = validateAndParse(dimensions.columnHeight, t('voxGenerator.dims.height'));
           if (radius === null || height === null) return;

           const baseRadius = withBase || withCapital ? validateAndParse(dimensions.baseRadius, t('voxGenerator.column.baseRadius')) : undefined;
           const baseHeight = withBase || withCapital ? validateAndParse(dimensions.baseHeight, t('voxGenerator.column.baseHeight')) : undefined;
           if ((withBase || withCapital) && (baseRadius === null || baseHeight === null)) return;
           if ((withBase || withCapital) && baseRadius && baseRadius <= radius) {
                toast({ title: t('voxGenerator.errors.invalid', { name: t('voxGenerator.column.baseRadius')}), description: t('voxGenerator.errors.baseRadiusTooSmall'), variant: "destructive" });
                return;
           }

           const breakAngle = brokenTop ? validateAndParse(dimensions.breakAngle, t('voxGenerator.column.breakAngle')) : undefined;
           if(brokenTop && breakAngle === null) return;

           shapeParams = { type: 'column', radius, height, withBase, withCapital, baseRadius, baseHeight, brokenTop, breakAngle };
          break;
        }
        case 'cone': {
           const radius = validateAndParse(dimensions.coneRadius, t('voxGenerator.dims.baseRadius'));
           const height = validateAndParse(dimensions.coneHeight, t('voxGenerator.dims.height'));
           if (radius === null || height === null) return;
           shapeParams = { type: 'cone', radius, height };
          break;
        }
        case 'arch': {
          if (archType === 'circular') {
            const width = validateAndParse(dimensions.circularArchWidth, t('voxGenerator.dims.width'));
            const thickness = validateAndParse(dimensions.circularArchThickness, t('voxGenerator.arch.thickness'));
            const depth = validateAndParse(dimensions.archDepth, t('voxGenerator.dims.depth'));
            if (width === null || thickness === null || depth === null) return;
            const outerRadius = width / 2;
            if (thickness >= outerRadius) {
              toast({ title: t('voxGenerator.errors.invalid', { name: t('voxGenerator.arch.thickness')}), description: t('voxGenerator.errors.thicknessTooLarge'), variant: "destructive" });
              return;
            }
            shapeParams = { type: 'arch', archType, width, thickness, depth, orientation: circularArchOrientation };
          } else {
            const width = validateAndParse(dimensions.archWidth, t('voxGenerator.dims.width'));
            const height = validateAndParse(dimensions.archHeight, t('voxGenerator.dims.height'));
            const depth = validateAndParse(dimensions.archDepth, t('voxGenerator.dims.depth'));
            if (width === null || height === null || depth === null) return;
            
            let outerCornerRadius = 0;
            if (archType === 'rounded') {
              outerCornerRadius = validateAndParse(dimensions.archOuterRadius, t('voxGenerator.arch.outerRadius')) ?? 0;
              if (outerCornerRadius > width / 2) {
                 toast({ title: t('voxGenerator.errors.invalid', { name: t('voxGenerator.arch.outerRadius')}), description: t('voxGenerator.errors.radiusTooLarge'), variant: "destructive" });
                 return;
              }
            }
            shapeParams = { type: 'arch', archType, width, height, depth, outerCornerRadius };
          }
          break;
        }
         case 'disk': {
          const radius = validateAndParse(dimensions.diskRadius, t('voxGenerator.dims.radius'));
          const height = validateAndParse(dimensions.diskHeight, t('voxGenerator.dims.height'));
          if (radius === null || height === null) return;
          let part: VoxShape['part'] = 'full';
          if (diskPart === 'half') {
            part = `half`;
          }
          shapeParams = { type: 'disk', radius, height, part, orientation: diskOrientation };
          break;
        }
        case 'ring': {
          const radius = validateAndParse(dimensions.ringRadius, t('voxGenerator.dims.radius'));
          const thickness = validateAndParse(dimensions.ringThickness, t('voxGenerator.arch.thickness'));
          const height = validateAndParse(dimensions.ringHeight, t('voxGenerator.dims.height'));
          if (radius === null || thickness === null || height === null) return;
          if (thickness >= radius) {
            toast({ title: t('voxGenerator.errors.invalid', { name: t('voxGenerator.arch.thickness')}), description: t('voxGenerator.errors.thicknessTooLargeRing'), variant: "destructive" });
            return;
          }
          let part: VoxShape['part'] = 'full';
          if (ringPart === 'half') {
            part = `half`;
          }
          shapeParams = { type: 'ring', radius, thickness, height, part, orientation: ringOrientation };
          break;
        }
        default:
           toast({ title: t('voxGenerator.errors.unknownShape'), description: t('voxGenerator.errors.selectValidShape'), variant: "destructive" });
          return;
      }
    } catch (e) {
      console.error(e);
      toast({ title: t('common.errors.generationFailed'), description: (e instanceof Error) ? e.message : String(e), variant: 'destructive' });
      return;
    }

    if (!shapeParams) {
      return;
    }

    setIsPending(true);
    try {
      const result: VoxOutput = await generateVoxFlow(shapeParams);
      const voxDataBytes = Buffer.from(result.voxData, 'base64');
      setSchematicOutput({ ...result, voxData: voxDataBytes });

    } catch (error) {
       console.error(error);
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
  
  const handleGenerate = () => {
    if (mode === 'shape') {
        handleGenerateShape();
    } else if (mode === 'text') {
        handleGenerateText();
    } else {
        handleGenerateQr();
    }
  }

  const renderShapeInputs = () => {
    switch(shape) {
      case 'cuboid':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="width">{t('voxGenerator.dims.width')} (voxels)</Label>
              <Input id="width" type="number" value={dimensions.width} onChange={e => handleDimensionChange('width', e.target.value)} placeholder="e.g. 16" />
            </div>
             <div className="space-y-2">
              <Label htmlFor="height">{t('voxGenerator.dims.height')} (voxels)</Label>
              <Input id="height" type="number" value={dimensions.height} onChange={e => handleDimensionChange('height', e.target.value)} placeholder="e.g. 16" />
            </div>
             <div className="space-y-2">
              <Label htmlFor="depth">{t('voxGenerator.dims.depth')} (voxels)</Label>
              <Input id="depth" type="number" value={dimensions.depth} onChange={e => handleDimensionChange('depth', e.target.value)} placeholder="e.g. 16" />
            </div>
          </div>
        );
      case 'sphere':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="radius">{t('voxGenerator.dims.radius')} (voxels)</Label>
              <Input id="radius" type="number" value={dimensions.radius} onChange={e => handleDimensionChange('radius', e.target.value)} placeholder="e.g. 16" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('voxGenerator.sphere.type')}</Label>
                 <RadioGroup value={spherePart} onValueChange={(v) => setSpherePart(v as any)} className="flex pt-2 space-x-4">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="full" id="sphere-full" />
                        <Label htmlFor="sphere-full">{t('voxGenerator.sphere.types.full')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="hemisphere" id="sphere-hemi" />
                        <Label htmlFor="sphere-hemi">{t('voxGenerator.sphere.types.hemisphere')}</Label>
                    </div>
                </RadioGroup>
              </div>
              {spherePart === 'hemisphere' && (
                <div className="space-y-2">
                    <Label htmlFor="hemisphere-direction">{t('voxGenerator.sphere.orientation')}</Label>
                    <Select value={hemisphereDirection} onValueChange={(v) => setHemisphereDirection(v as any)}>
                        <SelectTrigger id="hemisphere-direction">
                            <SelectValue placeholder={t('voxGenerator.sphere.selectDirection')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="top">{t('voxGenerator.sphere.orientations.top')}</SelectItem>
                            <SelectItem value="bottom">{t('voxGenerator.sphere.orientations.bottom')}</SelectItem>
                            <SelectItem value="vertical">{t('voxGenerator.sphere.orientations.vertical')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
              )}
            </div>
          </div>
        );
      case 'pyramid':
        return (
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pyramidBase">{t('voxGenerator.dims.baseSize')} (voxels)</Label>
              <Input id="pyramidBase" type="number" value={dimensions.pyramidBase} onChange={e => handleDimensionChange('pyramidBase', e.target.value)} placeholder="e.g. 16" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pyramidHeight">{t('voxGenerator.dims.height')} (voxels)</Label>
              <Input id="pyramidHeight" type="number" value={dimensions.pyramidHeight} onChange={e => handleDimensionChange('pyramidHeight', e.target.value)} placeholder="e.g. 16" />
            </div>
          </div>
        );
      case 'column':
        return (
           <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="columnRadius">{t('voxGenerator.dims.radius')} (voxels)</Label>
                <Input id="columnRadius" type="number" value={dimensions.columnRadius} onChange={e => handleDimensionChange('columnRadius', e.target.value)} placeholder="e.g. 8" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="columnHeight">{t('voxGenerator.dims.height')} (voxels)</Label>
                <Input id="columnHeight" type="number" value={dimensions.columnHeight} onChange={e => handleDimensionChange('columnHeight', e.target.value)} placeholder="e.g. 16" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
               <div className="space-y-2">
                    <div className="flex items-center space-x-2 pt-2">
                        <Switch id="with-base" checked={withBase} onCheckedChange={setWithBase} />
                        <Label htmlFor="with-base">{t('voxGenerator.column.withBase')}</Label>
                    </div>
                     <div className="flex items-center space-x-2 pt-2">
                        <Switch id="with-capital" checked={withCapital} onCheckedChange={(checked) => { setWithCapital(checked); if (checked) setBrokenTop(false); }} disabled={brokenTop} />
                        <Label htmlFor="with-capital" className={cn(brokenTop && "text-muted-foreground")}>{t('voxGenerator.column.withCapital')}</Label>
                    </div>
                    {(withBase || withCapital) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 pl-1">
                            <div className="space-y-2">
                                <Label htmlFor="baseRadius">{t('voxGenerator.column.baseRadius')}</Label>
                                <Input id="baseRadius" type="number" value={dimensions.baseRadius} onChange={e => handleDimensionChange('baseRadius', e.target.value)} placeholder="e.g. 10" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="baseHeight">{t('voxGenerator.column.baseHeight')}</Label>
                                <Input id="baseHeight" type="number" value={dimensions.baseHeight} onChange={e => handleDimensionChange('baseHeight', e.target.value)} placeholder="e.g. 4" />
                            </div>
                        </div>
                    )}
               </div>
                <div className="space-y-2">
                    <div className="flex items-center space-x-2 pt-2">
                        <Switch id="broken-top" checked={brokenTop} onCheckedChange={(checked) => { setBrokenTop(checked); if (checked) setWithCapital(false); }} disabled={withCapital}/>
                        <Label htmlFor="broken-top" className={cn(withCapital && "text-muted-foreground")}>{t('voxGenerator.column.brokenTop')}</Label>
                    </div>
                    {brokenTop && (
                         <div className="space-y-2 pt-2 pl-1">
                            <Label htmlFor="break-angle">{t('voxGenerator.column.breakAngle')}: {dimensions.breakAngle}°</Label>
                            <Slider 
                                id="break-angle"
                                min={15}
                                max={60}
                                step={1}
                                value={[parseInt(dimensions.breakAngle, 10)]}
                                onValueChange={(val) => handleSliderChange('breakAngle', val)}
                            />
                        </div>
                    )}
               </div>
            </div>
          </div>
        );
      case 'cone':
        return (
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="coneRadius">{t('voxGenerator.dims.baseRadius')} (voxels)</Label>
              <Input id="coneRadius" type="number" value={dimensions.coneRadius} onChange={e => handleDimensionChange('coneRadius', e.target.value)} placeholder="e.g. 8" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coneHeight">{t('voxGenerator.dims.height')} (voxels)</Label>
              <Input id="coneHeight" type="number" value={dimensions.coneHeight} onChange={e => handleDimensionChange('coneHeight', e.target.value)} placeholder="e.g. 16" />
            </div>
          </div>
        );
      case 'arch': {
        const circularArchHeight = (parseInt(dimensions.circularArchWidth, 10) || 0) / 2;
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('voxGenerator.arch.archType')}</Label>
              <RadioGroup value={archType} onValueChange={(v) => setArchType(v as any)} className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 pt-2">
                  <div className="flex items-center space-x-2">
                      <RadioGroupItem value="rectangular" id="arch-rectangular" />
                      <Label htmlFor="arch-rectangular">{t('voxGenerator.arch.types.rectangular')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <RadioGroupItem value="rounded" id="arch-rounded" />
                      <Label htmlFor="arch-rounded">{t('voxGenerator.arch.types.rounded')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <RadioGroupItem value="circular" id="arch-circular" />
                      <Label htmlFor="arch-circular">{t('voxGenerator.arch.types.circular')}</Label>
                  </div>
              </RadioGroup>
            </div>

            {archType === 'circular' ? (
               <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                    <Label htmlFor="circularArchWidth">{t('voxGenerator.dims.width')} (voxels)</Label>
                    <Input id="circularArchWidth" type="number" value={dimensions.circularArchWidth} onChange={e => handleDimensionChange('circularArchWidth', e.target.value)} placeholder="e.g. 32" />
                     <p className="text-xs text-muted-foreground">{t('voxGenerator.arch.heightInfo', { height: circularArchHeight })}</p>
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="circularArchThickness">{t('voxGenerator.arch.thickness')} (voxels)</Label>
                    <Input id="circularArchThickness" type="number" value={dimensions.circularArchThickness} onChange={e => handleDimensionChange('circularArchThickness', e.target.value)} placeholder="e.g. 4" />
                    </div>
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="archDepth">{t('voxGenerator.dims.depth')} (voxels)</Label>
                        <Input id="archDepth" type="number" value={dimensions.archDepth} onChange={e => handleDimensionChange('archDepth', e.target.value)} placeholder="e.g. 8" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="circular-arch-orientation">{t('voxGenerator.sphere.orientation')}</Label>
                      <Select value={circularArchOrientation} onValueChange={(v) => setCircularArchOrientation(v as any)}>
                          <SelectTrigger id="circular-arch-orientation">
                              <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="top">{t('voxGenerator.arch.orientations.top')}</SelectItem>
                              <SelectItem value="bottom">{t('voxGenerator.arch.orientations.bottom')}</SelectItem>
                          </SelectContent>
                      </Select>
                    </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="archWidth">{t('voxGenerator.dims.width')} (voxels)</Label>
                    <Input id="archWidth" type="number" value={dimensions.archWidth} onChange={e => handleDimensionChange('archWidth', e.target.value)} placeholder="e.g. 16" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="archHeight">{t('voxGenerator.dims.height')} (voxels)</Label>
                    <Input id="archHeight" type="number" value={dimensions.archHeight} onChange={e => handleDimensionChange('archHeight', e.target.value)} placeholder="e.g. 16" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="archDepth">{t('voxGenerator.dims.depth')} (voxels)</Label>
                    <Input id="archDepth" type="number" value={dimensions.archDepth} onChange={e => handleDimensionChange('archDepth', e.target.value)} placeholder="e.g. 8" />
                  </div>
                </div>

                {archType === 'rounded' && (
                    <div className="space-y-2">
                        <Label htmlFor="arch-outer-radius">{t('voxGenerator.arch.outerRadius')}: {dimensions.archOuterRadius}</Label>
                        <Slider 
                            id="arch-outer-radius"
                            min={1}
                            max={Math.max(1, Math.floor(parseInt(dimensions.archWidth, 10) / 2))}
                            step={1}
                            value={[parseInt(dimensions.archOuterRadius, 10)]}
                            onValueChange={(val) => handleSliderChange('archOuterRadius', val)}
                        />
                    </div>
                )}
              </div>
            )}
          </div>
        );
      }
       case 'disk':
        return (
           <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                <Label htmlFor="diskRadius">{t('voxGenerator.dims.radius')} (voxels)</Label>
                <Input id="diskRadius" type="number" value={dimensions.diskRadius} onChange={e => handleDimensionChange('diskRadius', e.target.value)} placeholder="e.g. 16" />
                </div>
                <div className="space-y-2">
                <Label htmlFor="diskHeight">{t('voxGenerator.dims.height')} (voxels)</Label>
                <Input id="diskHeight" type="number" value={dimensions.diskHeight} onChange={e => handleDimensionChange('diskHeight', e.target.value)} placeholder="e.g. 1" />
                </div>
            </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('voxGenerator.disk.type')}</Label>
                 <RadioGroup value={diskPart} onValueChange={(v) => setDiskPart(v as any)} className="flex pt-2 space-x-4">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="full" id="disk-full" />
                        <Label htmlFor="disk-full">{t('voxGenerator.disk.types.full')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="half" id="disk-half" />
                        <Label htmlFor="disk-half">{t('voxGenerator.disk.types.half')}</Label>
                    </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                  <Label htmlFor="disk-direction">{t('voxGenerator.disk.orientation')}</Label>
                  <Select value={diskOrientation} onValueChange={(v) => setDiskOrientation(v as any)}>
                      <SelectTrigger id="disk-direction">
                          <SelectValue placeholder={t('voxGenerator.disk.selectDirection')} />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="horizontal">{t('voxGenerator.disk.orientations.horizontal')}</SelectItem>
                          <SelectItem value="vertical">{t('voxGenerator.disk.orientations.vertical')}</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
            </div>
          </div>
        );
      case 'ring':
        return (
           <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                <Label htmlFor="ringRadius">{t('voxGenerator.dims.radius')} (voxels)</Label>
                <Input id="ringRadius" type="number" value={dimensions.ringRadius} onChange={e => handleDimensionChange('ringRadius', e.target.value)} placeholder="e.g. 16" />
                </div>
                <div className="space-y-2">
                <Label htmlFor="ringThickness">{t('voxGenerator.arch.thickness')} (voxels)</Label>
                <Input id="ringThickness" type="number" value={dimensions.ringThickness} onChange={e => handleDimensionChange('ringThickness', e.target.value)} placeholder="e.g. 4" />
                </div>
                <div className="space-y-2">
                <Label htmlFor="ringHeight">{t('voxGenerator.dims.height')} (voxels)</Label>
                <Input id="ringHeight" type="number" value={dimensions.ringHeight} onChange={e => handleDimensionChange('ringHeight', e.target.value)} placeholder="e.g. 4" />
                </div>
            </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('voxGenerator.disk.type')}</Label>
                 <RadioGroup value={ringPart} onValueChange={(v) => setRingPart(v as any)} className="flex pt-2 space-x-4">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="full" id="ring-full" />
                        <Label htmlFor="ring-full">{t('voxGenerator.disk.types.full')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="half" id="ring-half" />
                        <Label htmlFor="ring-half">{t('voxGenerator.disk.types.half')}</Label>
                    </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                  <Label htmlFor="ring-direction">{t('voxGenerator.disk.orientation')}</Label>
                  <Select value={ringOrientation} onValueChange={(v) => setRingOrientation(v as any)}>
                      <SelectTrigger id="ring-direction">
                          <SelectValue placeholder={t('voxGenerator.disk.selectDirection')} />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="horizontal">{t('voxGenerator.disk.orientations.horizontal')}</SelectItem>
                          <SelectItem value="vertical">{t('voxGenerator.disk.orientations.vertical')}</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  const renderTextInputs = () => {
    return (
        <div className="space-y-6">
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
                    <Label htmlFor="background-depth">{t('voxGenerator.text.backgroundDepth')}: {backgroundDepth[0]}px</Label>
                    <Slider
                        id="background-depth"
                        min={1} max={50} step={1}
                        value={backgroundDepth}
                        onValueChange={setBackgroundDepth}
                    />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="engrave-depth">{t('voxGenerator.text.engraveDepth')}: {engraveDepth[0]}px</Label>
                    <Slider
                        id="engrave-depth"
                        min={1} max={backgroundDepth[0]} step={1}
                        value={engraveDepth}
                        onValueChange={setEngraveDepth}
                    />
                </div>
            </div>
          )}
        </div>
    );
  }
  
  const renderQrInputs = () => {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="qr-url">{t('voxGenerator.qr.urlLabel')}</Label>
                <Input id="qr-url" value={qrUrl} onChange={(e) => setQrUrl(e.target.value)} placeholder={t('voxGenerator.qr.urlPlaceholder')} />
            </div>
            {qrPreview && (
                <div className="flex justify-center items-center bg-white p-4 rounded-lg">
                    <img src={qrPreview} alt="QR Code Preview" className="w-48 h-48" />
                </div>
            )}
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="qr-code-depth">{t('voxGenerator.qr.codeDepth')}: {qrCodeDepth[0]}px</Label>
                    <Slider
                        id="qr-code-depth"
                        min={1} max={14} step={1}
                        value={qrCodeDepth}
                        onValueChange={setQrCodeDepth}
                    />
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <Switch id="with-backdrop" checked={withBackdrop} onCheckedChange={setWithBackdrop} />
                  <Label htmlFor="with-backdrop">{t('voxGenerator.qr.withBackdrop')}</Label>
                </div>
                {withBackdrop && (
                   <div className="space-y-2 pl-2 pt-2 border-l-2 border-primary/20 ml-3">
                       <Label htmlFor="backdrop-depth">{t('voxGenerator.qr.backdropDepth')}: {backdropDepth[0]}px</Label>
                       <Slider
                           id="backdrop-depth"
                           min={1} max={16} step={1}
                           value={backdropDepth}
                           onValueChange={setBackdropDepth}
                       />
                   </div>
                )}
            </div>
        </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
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
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as GeneratorMode)} className="flex pt-2 space-x-4 bg-muted/30 p-1 rounded-lg">
                <RadioGroupItem value="shape" id="mode-shape" className="sr-only" />
                <Label htmlFor="mode-shape" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", mode === 'shape' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                   {t('voxGenerator.modes.shape')}
                </Label>
                <RadioGroupItem value="text" id="mode-text" className="sr-only" />
                <Label htmlFor="mode-text" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", mode === 'text' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                    {t('voxGenerator.modes.text')}
                </Label>
                 <RadioGroupItem value="qr" id="mode-qr" className="sr-only" />
                <Label htmlFor="mode-qr" className={cn("flex-1 text-center py-2 px-4 rounded-md cursor-pointer", mode === 'qr' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50')}>
                    {t('voxGenerator.modes.qr')}
                </Label>
            </RadioGroup>

            {mode === 'shape' ? (
                 <div className="space-y-6">
                    <div className="space-y-2">
                        <Label>{t('voxGenerator.shapeLabel')}</Label>
                        <RadioGroup value={shape} onValueChange={(value) => setShape(value as VoxShape['type'])} className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 pt-2">
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="cuboid" id="r-cuboid" />
                            <Label htmlFor="r-cuboid">{t('voxGenerator.shapes.cuboid')}</Label>
                        </div>
                        {/* <div className="flex items-center space-x-2">
                            <RadioGroupItem value="sphere" id="r-sphere" />
                            <Label htmlFor="r-sphere">{t('voxGenerator.shapes.sphere')}</Label>
                        </div> */}
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="pyramid" id="r-pyramid" />
                            <Label htmlFor="r-pyramid">{t('voxGenerator.shapes.pyramid')}</Label>
                        </div>
                        {/* <div className="flex items-center space-x-2">
                            <RadioGroupItem value="column" id="r-column" />
                            <Label htmlFor="r-column">{t('voxGenerator.shapes.column')}</Label>
                        </div> */}
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="cone" id="r-cone" />
                            <Label htmlFor="r-cone">{t('voxGenerator.shapes.cone')}</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="arch" id="r-arch" />
                            <Label htmlFor="r-arch">{t('voxGenerator.shapes.arch')}</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="disk" id="r-disk" />
                            <Label htmlFor="r-disk">{t('voxGenerator.shapes.disk')}</Label>
                        </div>
                         <div className="flex items-center space-x-2">
                            <RadioGroupItem value="ring" id="r-ring" />
                            <Label htmlFor="r-ring">{t('voxGenerator.shapes.ring')}</Label>
                        </div>
                        </RadioGroup>
                    </div>
                    {renderShapeInputs()}
                </div>
            ) : mode === 'text' ? (
                renderTextInputs()
            ) : (
                renderQrInputs()
            )}
         
          <Button onClick={handleGenerate} disabled={isPending} className="w-full uppercase font-bold tracking-wider">
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
