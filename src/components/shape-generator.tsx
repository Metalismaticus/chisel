'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SchematicPreview } from './schematic-preview';
import { useToast } from '@/hooks/use-toast';
import { shapeToSchematic, type Shape, type SchematicOutput } from '@/lib/schematic-utils';
import { Slider } from '@/components/ui/slider';
import { useI18n } from '@/locales/client';
import { HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"


export function ShapeGenerator() {
  const t = useI18n();
  const [shape, setShape] = useState<Shape>('circle');
  const [dimensions, setDimensions] = useState({
    radius: '16',
    width: '16',
    height: '16',
    triBase: '16',
    triHeight: '16',
    triApexOffset: '0',
    hexRadius: '16'
  });
  const [schematicOutput, setSchematicOutput] = useState<SchematicOutput | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleDimensionChange = (field: keyof typeof dimensions, value: string) => {
    setDimensions(prev => ({...prev, [field]: value}));
  };
  
  const validateAndParse = (value: string, name: string, min = 1, canBeZero = false): number | null => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < (canBeZero ? 0 : min)) {
      toast({ title: t('shapeGenerator.errors.invalid', { name }), description: t('shapeGenerator.errors.enterValidNumber'), variant: "destructive" });
      return null;
    }
    return parsed;
  }
  
  const validateAndParseOffset = (value: string, name: string, min: number, max: number): number | null => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min || parsed > max) {
      toast({ title: t('shapeGenerator.errors.invalid', { name }), description: t('shapeGenerator.errors.offsetRange', { min, max }), variant: "destructive" });
      return null;
    }
    return parsed;
  }

  const handleGenerate = () => {
    setSchematicOutput(null);
    startTransition(() => {
      try {
        let result: SchematicOutput;
        
        switch(shape) {
          case 'circle': {
            const radius = validateAndParse(dimensions.radius, t('shapeGenerator.dims.radius'));
            if (radius === null) return;
            result = shapeToSchematic({ type: 'circle', radius });
            break;
          }
          case 'triangle': {
            const base = validateAndParse(dimensions.triBase, t('shapeGenerator.dims.base'));
            const height = validateAndParse(dimensions.triHeight, t('shapeGenerator.dims.height'));
            if (base === null || height === null) return;
            const maxOffset = Math.floor((base - 1) / 2);
            const apexOffset = validateAndParseOffset(dimensions.triApexOffset, t('shapeGenerator.dims.apexOffset'), -maxOffset, maxOffset);
            if (apexOffset === null) return;
            result = shapeToSchematic({ type: 'triangle', base, height, apexOffset });
            break;
          }
          case 'rhombus': {
            const width = validateAndParse(dimensions.width, t('shapeGenerator.dims.width'));
            const height = validateAndParse(dimensions.height, t('shapeGenerator.dims.height'));
            if (width === null || height === null) return;
            result = shapeToSchematic({ type: 'rhombus', width, height });
            break;
          }
          case 'hexagon': {
            const radius = validateAndParse(dimensions.hexRadius, t('shapeGenerator.dims.radius'));
            if (radius === null) return;
            result = shapeToSchematic({ type: 'hexagon', radius });
            break;
          }
          default:
             toast({ title: t('shapeGenerator.errors.unknownShape'), description: t('shapeGenerator.errors.selectValidShape'), variant: "destructive" });
            return;
        }
        setSchematicOutput(result);
      } catch (error) {
        console.error(error);
        toast({
          title: t('common.errors.generationFailed'),
          description: t('common.errors.genericError'),
          variant: "destructive",
        });
        setSchematicOutput(null);
      }
    });
  };
  
  const renderDimensionInputs = () => {
    switch(shape) {
      case 'circle':
        return (
          <div className="space-y-2">
            <Label htmlFor="radius">{t('shapeGenerator.dims.radius')} (pixels)</Label>
            <Input id="radius" type="number" value={dimensions.radius} onChange={e => handleDimensionChange('radius', e.target.value)} placeholder="e.g. 16" />
          </div>
        );
      case 'triangle':
        const base = parseInt(dimensions.triBase, 10) || 1;
        const maxOffset = Math.floor((base - 1) / 2);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="triBase">{t('shapeGenerator.dims.base')} (pixels)</Label>
                <Input id="triBase" type="number" value={dimensions.triBase} onChange={e => handleDimensionChange('triBase', e.target.value)} placeholder="e.g. 16" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="triHeight">{t('shapeGenerator.dims.height')} (pixels)</Label>
                <Input id="triHeight" type="number" value={dimensions.triHeight} onChange={e => handleDimensionChange('triHeight', e.target.value)} placeholder="e.g. 16" />
              </div>
            </div>
             <div className="space-y-2">
              <Label htmlFor="apexOffset">{t('shapeGenerator.dims.apexOffset')}: {dimensions.triApexOffset}px</Label>
              <Slider
                id="apexOffset"
                min={-maxOffset}
                max={maxOffset}
                step={1}
                value={[parseInt(dimensions.triApexOffset, 10) || 0]}
                onValueChange={(val) => handleDimensionChange('triApexOffset', val[0].toString())}
              />
              <p className="text-xs text-muted-foreground">{t('shapeGenerator.dims.apexOffsetHint')}</p>
            </div>
          </div>
        );
      case 'rhombus':
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="width">{t('shapeGenerator.dims.width')} (pixels)</Label>
                    <Input id="width" type="number" value={dimensions.width} onChange={e => handleDimensionChange('width', e.target.value)} placeholder="e.g. 32" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="height">{t('shapeGenerator.dims.height')} (pixels)</Label>
                    <Input id="height" type="number" value={dimensions.height} onChange={e => handleDimensionChange('height', e.target.value)} placeholder="e.g. 16" />
                </div>
            </div>
        );
      case 'hexagon':
        return (
          <div className="space-y-2">
            <Label htmlFor="hexRadius">{t('shapeGenerator.dims.radius')} (pixels)</Label>
            <Input id="hexRadius" type="number" value={dimensions.hexRadius} onChange={e => handleDimensionChange('hexRadius', e.target.value)} placeholder="e.g. 16" />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('shapeGenerator.title')}</CardTitle>
              <CardDescription>{t('shapeGenerator.description')}</CardDescription>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                 <Button variant="ghost" size="icon"><HelpCircle className="h-6 w-6 text-primary" /></Button>
              </DialogTrigger>
               <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('shapeGenerator.help.title')}</DialogTitle>
                </DialogHeader>
                 <div className="prose prose-invert max-w-none text-foreground text-sm">
                  <p>{t('shapeGenerator.help.p1')}</p>
                  <p className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: t('shapeGenerator.help.p2') }}></p>
                </div>
              </DialogContent>
            </Dialog>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t('shapeGenerator.shapeLabel')}</Label>
            <RadioGroup value={shape} onValueChange={(value) => setShape(value as Shape)} className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 pt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="circle" id="r-circle" />
                <Label htmlFor="r-circle">{t('shapeGenerator.shapes.circle')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="triangle" id="r-triangle" />
                <Label htmlFor="r-triangle">{t('shapeGenerator.shapes.triangle')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="rhombus" id="r-rhombus" />
                <Label htmlFor="r-rhombus">{t('shapeGenerator.shapes.rhombus')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="hexagon" id="r-hexagon" />
                <Label htmlFor="r-hexagon">{t('shapeGenerator.shapes.hexagon')}</Label>
              </div>
            </RadioGroup>
          </div>
          {renderDimensionInputs()}
          <Button onClick={handleGenerate} disabled={isPending} className="w-full uppercase font-bold tracking-wider">
            {isPending ? t('common.generating') : t('shapeGenerator.button')}
          </Button>
        </CardContent>
      </Card>
      <SchematicPreview schematicOutput={schematicOutput} loading={isPending} />
    </div>
  );
}
