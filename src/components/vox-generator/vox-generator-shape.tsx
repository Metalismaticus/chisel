
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SchematicPreview } from '@/components/schematic-preview';
import { useToast } from '@/hooks/use-toast';
import { type VoxShape } from '@/lib/schematic-utils';
import { useI18n } from '@/locales/client';
import { generateVoxFlow, type VoxOutput } from '@/ai/flows/vox-flow';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '../ui/switch';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from '@/lib/utils';

export function VoxGeneratorShape() {
  const t = useI18n();
  const [shape, setShape] = useState<VoxShape['type']>('column');
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
    columnHeight: '64',
    baseRadius: '10',
    baseHeight: '4',
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
    debrisLength: '16',
    haystackRadius: '8',
    haystackHeight: '12',
    cornerHeight: '16',
    cornerRadius: '16',
  });
  const [spherePart, setSpherePart] = useState<'full' | 'hemisphere'>('full');
  const [hemisphereDirection, setHemisphereDirection] = useState<'top' | 'bottom' | 'vertical'>('top');
  const [carveMode, setCarveMode] = useState(false);
  const [isHollow, setIsHollow] = useState(false);
  const [wallThickness, setWallThickness] = useState(1);
  const [diskPart, setDiskPart] = useState<'full' | 'half'>('full');
  const [diskOrientation, setDiskOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [ringPart, setRingPart] = useState<'full' | 'half'>('full');
  const [ringOrientation, setRingOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [archType, setArchType] = useState<'rectangular' | 'rounded' | 'circular'>('rectangular');
  const [circularArchOrientation, setCircularArchOrientation] = useState<'top' | 'bottom'>('top');
  const [withBase, setWithBase] = useState(false);
  const [withCapital, setWithCapital] = useState(false);
  const [baseStyle, setBaseStyle] = useState<'simple' | 'decorative'>('simple');
  const [brokenTop, setBrokenTop] = useState(false);
  const [showCrashWarning, setShowCrashWarning] = useState(false);
  const [withDebris, setWithDebris] = useState(false);
  const [breakAngleX, setBreakAngleX] = useState(20);
  const [breakAngleZ, setBreakAngleZ] = useState(-15);
  const [cornerExternal, setCornerExternal] = useState(true);
  const [cornerInternal, setCornerInternal] = useState(false);
  
  const [schematicOutput, setSchematicOutput] = useState<any | null>(null);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  const checkForCrashRisk = useCallback(() => {
    let isRisky = false;
    if (shape === 'column') {
        const colR = parseInt(dimensions.columnRadius, 10);
        const baseR = parseInt(dimensions.baseRadius, 10);
        isRisky = (colR > 0 && colR % 8 === 0) || ((withBase || withCapital) && baseR > 0 && baseR % 8 === 0);
    } else if (shape === 'sphere') {
        const sphereR = parseInt(dimensions.radius, 10);
        isRisky = sphereR > 0 && (sphereR * 2) % 8 === 0;
    }
    setShowCrashWarning(isRisky);
  }, [shape, dimensions.columnRadius, dimensions.baseRadius, dimensions.radius, withBase, withCapital]);

  useEffect(() => {
    checkForCrashRisk();
  }, [checkForCrashRisk]);

  const handleDimensionChange = (field: keyof typeof dimensions, value: string) => {
    setDimensions(prev => ({...prev, [field]: value}));
  };
  
  const handleSliderChange = (field: keyof typeof dimensions, value: number[]) => {
    setDimensions(prev => ({...prev, [field]: String(value[0])}));
  };

  const validateAndParse = (value: string, name: string, min = 1): number | null => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min) {
      toast({ title: t('voxGenerator.errors.invalid', { name }), description: t('voxGenerator.errors.enterPositiveNumber', { name }), variant: "destructive" });
      return null;
    }
    return parsed;
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
           if (isHollow && wallThickness >= radius) {
                toast({ title: t('voxGenerator.errors.invalid', { name: t('voxGenerator.sphere.wallThickness')}), description: t('voxGenerator.errors.thicknessTooLargeRing'), variant: "destructive" });
                return;
            }
          let part: VoxShape['part'] = 'full';
          if (spherePart === 'hemisphere') {
            part = `hemisphere-${hemisphereDirection}`;
          }
          shapeParams = { type: 'sphere', radius, part, carveMode: carveMode && spherePart === 'hemisphere', hollow: isHollow && spherePart === 'hemisphere', thickness: wallThickness };
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
            const colRadius = validateAndParse(dimensions.columnRadius, t('voxGenerator.dims.radius')) ?? 0;
            const totalHeight = validateAndParse(dimensions.columnHeight, t('voxGenerator.dims.height')) ?? 0;
            const baseRadius = validateAndParse(dimensions.baseRadius, t('voxGenerator.column.baseRadius')) ?? 0;
            const baseHeight = validateAndParse(dimensions.baseHeight, t('voxGenerator.column.baseHeight')) ?? 0;
            const debrisLength = validateAndParse(dimensions.debrisLength, t('voxGenerator.column.debrisLength')) ?? 0;
            
            shapeParams = { 
                type: 'column', 
                radius: colRadius, 
                height: totalHeight, 
                withBase, 
                withCapital: brokenTop ? false : withCapital, 
                baseRadius, 
                baseHeight,
                baseStyle,
                brokenTop, 
                withDebris, 
                debrisLength, 
                breakAngleX, 
                breakAngleZ 
            };
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
        case 'haystack': {
          const radius = validateAndParse(dimensions.haystackRadius, t('voxGenerator.dims.baseRadius'));
          const height = validateAndParse(dimensions.haystackHeight, t('voxGenerator.dims.height'));
          if (radius === null || height === null) return;
          shapeParams = { type: 'haystack', radius, height };
          break;
        }
        case 'corner': {
          const radius = validateAndParse(dimensions.cornerRadius, t('voxGenerator.dims.radius'));
          const height = validateAndParse(dimensions.cornerHeight, t('voxGenerator.dims.height'));
          if (radius === null || height === null) return;
          if (!cornerExternal && !cornerInternal) {
            toast({ title: t('voxGenerator.errors.noCornerType'), description: t('voxGenerator.errors.noCornerTypeDesc'), variant: 'destructive' });
            return;
          }
          shapeParams = { type: 'corner', radius, height, external: cornerExternal, internal: cornerInternal };
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
      setSchematicOutput({ ...result, voxData: voxDataBytes, voxSize: result.voxSize });

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

  const renderShapeInputs = () => {
    return (
      <div className="space-y-4">
        {showCrashWarning && (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('voxGenerator.errors.crashWarningTitle')}</AlertTitle>
                <AlertDescription>{t('voxGenerator.errors.crashWarningDesc')}</AlertDescription>
            </Alert>
        )}
        {(() => {
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
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
                      <div className="space-y-4">
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
                        <div className="flex items-center space-x-2 pt-2">
                            <Switch id="carve-mode" checked={carveMode} onCheckedChange={(checked) => { setCarveMode(checked); if(checked) setIsHollow(false); }} />
                            <Label htmlFor="carve-mode">{t('voxGenerator.sphere.carveMode')}</Label>
                        </div>
                         <div className="flex items-center space-x-2 pt-2">
                            <Switch id="hollow-mode" checked={isHollow} onCheckedChange={(checked) => { setIsHollow(checked); if(checked) setCarveMode(false); }} />
                            <Label htmlFor="hollow-mode">{t('voxGenerator.sphere.domeMode')}</Label>
                        </div>
                        {isHollow && (
                            <div className="space-y-2 pl-2 border-l-2 border-primary/20 ml-3">
                                <Label htmlFor="wall-thickness">{t('voxGenerator.sphere.wallThickness')}: {wallThickness}</Label>
                                <Slider
                                    id="wall-thickness"
                                    min={1}
                                    max={Math.max(1, parseInt(dimensions.radius, 10) - 1)}
                                    step={1}
                                    value={[wallThickness]}
                                    onValueChange={(val) => setWallThickness(val[0])}
                                />
                            </div>
                        )}
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
                              <Switch id="with-capital" checked={withCapital} onCheckedChange={setWithCapital} disabled={brokenTop}/>
                              <Label htmlFor="with-capital" className={cn(brokenTop && "text-muted-foreground")}>{t('voxGenerator.column.withCapital')}</Label>
                          </div>
                           {(withBase || withCapital) && !brokenTop && (
                              <div className="pt-2 pl-1 space-y-4 border-l-2 border-primary/20 ml-2">
                                  <div className="space-y-2 pl-4">
                                    <Label>{t('voxGenerator.column.baseStyle')}</Label>
                                    <RadioGroup value={baseStyle} onValueChange={(v) => setBaseStyle(v as any)} className="flex pt-2 space-x-4">
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="simple" id="style-simple" />
                                            <Label htmlFor="style-simple">{t('voxGenerator.column.styles.simple')}</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="decorative" id="style-decorative" />
                                            <Label htmlFor="style-decorative">{t('voxGenerator.column.styles.decorative')}</Label>
                                        </div>
                                    </RadioGroup>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4">
                                      <div className="space-y-2">
                                          <Label htmlFor="baseRadius">{t('voxGenerator.column.baseRadius')}</Label>
                                          <Input id="baseRadius" type="number" value={dimensions.baseRadius} onChange={e => handleDimensionChange('baseRadius', e.target.value)} placeholder="e.g. 10" />
                                      </div>
                                      <div className="space-y-2">
                                          <Label htmlFor="baseHeight">{t('voxGenerator.column.baseHeight')}</Label>
                                          <Input id="baseHeight" type="number" value={dimensions.baseHeight} onChange={e => handleDimensionChange('baseHeight', e.target.value)} placeholder="e.g. 4" />
                                      </div>
                                  </div>
                              </div>
                          )}
                     </div>
                      <div className="space-y-2">
                          <div className="flex items-center space-x-2 pt-2">
                              <Switch id="broken-top" checked={brokenTop} onCheckedChange={(checked) => { setBrokenTop(checked); if (checked) setWithCapital(false); }}/>
                              <Label htmlFor="broken-top" >{t('voxGenerator.column.brokenTop')}</Label>
                          </div>
                           {brokenTop && (
                               <div className="pt-2 pl-1 space-y-4 border-l-2 border-primary/20 ml-2">
                                  <div className="space-y-2 pl-4">
                                      <Label htmlFor="breakAngleX">{t('voxGenerator.column.breakAngleX')}: {breakAngleX}°</Label>
                                      <Slider id="breakAngleX" min={-45} max={45} step={1} value={[breakAngleX]} onValueChange={(v) => setBreakAngleX(v[0])} />
                                  </div>
                                   <div className="space-y-2 pl-4">
                                      <Label htmlFor="breakAngleZ">{t('voxGenerator.column.breakAngleZ')}: {breakAngleZ}°</Label>
                                      <Slider id="breakAngleZ" min={-45} max={45} step={1} value={[breakAngleZ]} onValueChange={(v) => setBreakAngleZ(v[0])} />
                                  </div>
                                   <div className="flex items-center space-x-2 pl-4">
                                      <Switch id="with-debris" checked={withDebris} onCheckedChange={setWithDebris} />
                                      <Label htmlFor="with-debris">{t('voxGenerator.column.withDebris')}</Label>
                                  </div>
                                  {withDebris && (
                                      <div className="space-y-4 pl-4">
                                          <div className="space-y-2">
                                              <Label htmlFor="debrisLength">{t('voxGenerator.column.debrisLength')}</Label>
                                              <Input id="debrisLength" type="number" value={dimensions.debrisLength} onChange={e => handleDimensionChange('debrisLength', e.target.value)} placeholder="e.g. 16" />
                                          </div>
                                      </div>
                                  )}
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
              const circularArchHeight = Math.floor((parseInt(dimensions.circularArchWidth, 10) || 0) / 2);
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
            case 'haystack':
              return (
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="haystackRadius">{t('voxGenerator.dims.baseRadius')} (voxels)</Label>
                    <Input id="haystackRadius" type="number" value={dimensions.haystackRadius} onChange={e => handleDimensionChange('haystackRadius', e.target.value)} placeholder="e.g. 8" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="haystackHeight">{t('voxGenerator.dims.height')} (voxels)</Label>
                    <Input id="haystackHeight" type="number" value={dimensions.haystackHeight} onChange={e => handleDimensionChange('haystackHeight', e.target.value)} placeholder="e.g. 12" />
                  </div>
                </div>
              );
            case 'corner':
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cornerRadius">{t('voxGenerator.dims.radius')} (voxels)</Label>
                      <Input id="cornerRadius" type="number" value={dimensions.cornerRadius} onChange={e => handleDimensionChange('cornerRadius', e.target.value)} placeholder="e.g. 16" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cornerHeight">{t('voxGenerator.dims.height')} (voxels)</Label>
                      <Input id="cornerHeight" type="number" value={dimensions.cornerHeight} onChange={e => handleDimensionChange('cornerHeight', e.target.value)} placeholder="e.g. 16" />
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 pt-2">
                      <div className="flex items-center space-x-2">
                          <Switch id="corner-external" checked={cornerExternal} onCheckedChange={(checked) => { setCornerExternal(checked); if (checked) setCornerInternal(false); }} />
                          <Label htmlFor="corner-external">{t('voxGenerator.corner.external')}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                          <Switch id="corner-internal" checked={cornerInternal} onCheckedChange={(checked) => { setCornerInternal(checked); if (checked) setCornerExternal(false); }} />
                          <Label htmlFor="corner-internal">{t('voxGenerator.corner.internal')}</Label>
                      </div>
                  </div>
                </div>
              );
            default:
              return null;
          }
        })()}
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-6">
              <div className="space-y-2">
                  <Label>{t('voxGenerator.shapeLabel')}</Label>
                  <RadioGroup value={shape} onValueChange={(value) => setShape(value as VoxShape['type'])} className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 pt-2">
                  <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cuboid" id="r-cuboid" />
                      <Label htmlFor="r-cuboid">{t('voxGenerator.shapes.cuboid')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sphere" id="r-sphere" />
                      <Label htmlFor="r-sphere">{t('voxGenerator.shapes.sphere')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pyramid" id="r-pyramid" />
                      <Label htmlFor="r-pyramid">{t('voxGenerator.shapes.pyramid')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                      <RadioGroupItem value="column" id="r-column" />
                      <Label htmlFor="r-column">{t('voxGenerator.shapes.column')}</Label>
                  </div>
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
                  <div className="flex items-center space-x-2">
                      <RadioGroupItem value="haystack" id="r-haystack" />
                      <Label htmlFor="r-haystack">{t('voxGenerator.shapes.haystack')}</Label>
                  </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="corner" id="r-corner" />
                      <Label htmlFor="r-corner">{t('voxGenerator.shapes.corner')}</Label>
                  </div>
                  </RadioGroup>
              </div>
              {renderShapeInputs()}
          </div>
         
          <Button onClick={handleGenerateShape} disabled={isPending} className="w-full uppercase font-bold tracking-wider">
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
