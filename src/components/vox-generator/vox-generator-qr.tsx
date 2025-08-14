
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SchematicPreview } from '@/components/schematic-preview';
import { useToast } from '@/hooks/use-toast';
import { type VoxShape } from '@/lib/schematic-utils';
import { useI18n } from '@/locales/client';
import { generateVoxFlow, type VoxOutput } from '@/ai/flows/vox-flow';
import { Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '../ui/switch';
import QRCode from 'qrcode';

export function VoxGeneratorQr() {
  const t = useI18n();
  const [qrUrl, setQrUrl] = useState('https://www.vintagestory.at/');
  const [qrCodeDepth, setQrCodeDepth] = useState([1]);
  const [withBackdrop, setWithBackdrop] = useState(false);
  const [backdropDepth, setBackdropDepth] = useState([4]);
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  const [schematicOutput, setSchematicOutput] = useState<any | null>(null);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  
  useEffect(() => {
    if (qrUrl) {
      QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'L', margin: 2 }, (err, url) => {
        if (err) {
          setQrPreview(null);
          return;
        };
        setQrPreview(url);
      });
    }
  }, [qrUrl]);

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
      setSchematicOutput({ ...result, voxData: voxDataBytes, voxSize: (result as any).voxSize });

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

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-card/70 border-primary/20 backdrop-blur-sm">
        <CardContent className="space-y-6 pt-6">
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
          <Button onClick={handleGenerateQr} disabled={isPending} className="w-full uppercase font-bold tracking-wider">
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
