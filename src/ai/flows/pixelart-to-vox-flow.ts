
'use server';
/**
 * @fileOverview A server action for generating .vox models from pixel art (a boolean pixel array).
 *
 * - generatePixelArtToVoxFlow - A function that handles the pixel art to .vox generation process.
 * - PixelArtToVoxInput - The input type for the flow.
 * - PixelArtToVoxOutput - The return type for the flow.
 */

import { z } from 'zod';
const writeVox = require('vox-saver');
import type { PaletteColor } from '@/lib/schematic-utils';

const PixelArtToVoxInputSchema = z.object({
  pixels: z.array(z.boolean()),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mode: z.enum(['extrude', 'engrave']),
  extrudeDepth: z.number().int().positive(),
  engraveBackgroundDepth: z.number().int().min(0),
  engraveDepth: z.number().int().min(0),
  stickerMode: z.boolean(),
  orientation: z.enum(['horizontal', 'vertical-lr']),
});

export type PixelArtToVoxInput = z.infer<typeof PixelArtToVoxInputSchema>;

export interface PixelArtToVoxOutput {
  schematicData: string;
  width: number;
  height: number;
  depth: number;
  isVox: boolean;
  voxData: string; // Base64 encoded string
  voxSize: {x: number, y: number, z: number};
}

function createSchematicData(name: string, dimensions: {width: number, height: number, depth?: number}): string {
    const { width, height, depth } = dimensions;
    const depthInfo = depth ? `x${depth}`: '';
    return `Schematic: ${name} (${width}x${height}${depthInfo})`;
}


export async function generatePixelArtToVoxFlow(input: PixelArtToVoxInput): Promise<PixelArtToVoxOutput> {
  const { 
    pixels, 
    width: imageWidth, 
    height: imageHeight, 
    mode, 
    extrudeDepth, 
    engraveBackgroundDepth, 
    engraveDepth,
    stickerMode,
    orientation,
  } = PixelArtToVoxInputSchema.parse(input);

  let xyziValues: {x: number, y: number, z: number, i: number}[] = [];
  
  const addVoxel = (px: number, py: number, pz: number, colorIndex = 1) => {
    xyziValues.push({ x: Math.round(px), y: Math.round(py), z: Math.round(pz), i: colorIndex });
  };
  addVoxel(0,0,0,2);
  
  let modelWidth = imageWidth;
  let modelHeight = imageHeight;
  let modelDepth = 0;

  const STICKER_BLOCK_DEPTH = 16;
  
  const mapCoords = (px: number, py: number, pz: number, zOffset: number): [number, number, number] => {
      if (orientation === 'vertical-lr') {
          return [px, pz + zOffset, imageHeight - 1 - py];
      }
      return [px, imageHeight - 1 - py, pz + zOffset];
  };

  if (mode === 'extrude') {
    modelDepth = extrudeDepth;
    const zOffset = stickerMode ? STICKER_BLOCK_DEPTH - extrudeDepth : 0;
    
    for (let py = 0; py < imageHeight; py++) {
      for (let px = 0; px < imageWidth; px++) {
        if (pixels[py * imageWidth + px]) {
          for (let pz = 0; pz < extrudeDepth; pz++) {
             const [x, y, z] = mapCoords(px, py, pz, zOffset);
             addVoxel(x, y, z);
          }
        }
      }
    }
     if (stickerMode) modelDepth = STICKER_BLOCK_DEPTH;

  } else if (mode === 'engrave') {
    modelDepth = engraveBackgroundDepth;
    const zOffset = stickerMode ? STICKER_BLOCK_DEPTH - engraveBackgroundDepth : 0;
    
    for (let py = 0; py < imageHeight; py++) {
      for (let px = 0; px < imageWidth; px++) {
        const isPixelSet = pixels[py * imageWidth + px];
        const endDepth = isPixelSet ? engraveBackgroundDepth - engraveDepth : engraveBackgroundDepth;

        for (let pz = 0; pz < endDepth; pz++) {
            const [x, y, z] = mapCoords(px, py, pz, zOffset);
            addVoxel(x, y, z);
        }
      }
    }
     if (stickerMode) modelDepth = STICKER_BLOCK_DEPTH;
  }

  let finalWidth = modelWidth;
  let finalHeight = modelHeight;
  let finalDepth = modelDepth;
  if (orientation === 'vertical-lr') {
    finalHeight = modelDepth;
    finalDepth = modelHeight;
  }
 
  const palette: PaletteColor[] = Array.from({length: 256}, () => ({r:0,g:0,b:0,a:0}));
  palette[0] = { r: 0, g: 0, b: 0, a: 0 };
  palette[1] = { r: 200, g: 164, b: 100, a: 255 }; // Main color
  palette[2] = { r: 10, g: 10, b: 10, a: 255 }; // Anchor color

  let voxSize;
  if (orientation === 'vertical-lr') {
     voxSize = { x: modelWidth, y: modelHeight, z: modelDepth };
  } else {
     voxSize = { x: modelWidth, y: modelDepth, z: modelHeight };
  }

  const voxObject = {
      size: voxSize,
      xyzi: {
          numVoxels: xyziValues.length,
          values: xyziValues.map(v => ({ x: v.x, y: v.z, z: v.y, i: v.i }))
      },
      rgba: { values: palette }
  };
    
  const buffer: Uint8Array = writeVox(voxObject);
  const voxDataB64 = Buffer.from(buffer).toString('base64');
  
  return {
      schematicData: createSchematicData('VOX PixelArt', {width: finalWidth, height: finalHeight, depth: finalDepth}),
      width: finalWidth,
      height: finalHeight,
      depth: finalDepth,
      isVox: true,
      voxData: voxDataB64,
      voxSize: voxSize
  };
}
