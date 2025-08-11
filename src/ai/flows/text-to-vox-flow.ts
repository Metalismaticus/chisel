
'use server';
/**
 * @fileOverview A server action for generating .vox models from text.
 *
 * - generateTextToVoxFlow - A function that handles the text-to-vox generation process.
 * - TextToVoxInput - The input type for the flow.
 * - TextToVoxOutput - The return type for the flow.
 */

import { z } from 'zod';
const writeVox = require('vox-saver');
import type { PaletteColor } from '@/lib/schematic-utils';

const TextToVoxInputSchema = z.object({
  pixels: z.array(z.boolean()),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mode: z.enum(['extrude', 'engrave']),
  letterDepth: z.number().int().positive(),
  backgroundDepth: z.number().int().min(0),
  engraveDepth: z.number().int().min(0),
  orientation: z.enum(['horizontal', 'vertical-lr']),
  stickerMode: z.boolean(),
});

export type TextToVoxInput = z.infer<typeof TextToVoxInputSchema>;

export interface TextToVoxOutput {
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


export async function generateTextToVoxFlow(input: TextToVoxInput): Promise<TextToVoxOutput> {
  const { 
    pixels: originalPixels, 
    width: textWidth, 
    height: textHeight, 
    mode, 
    letterDepth, 
    // backgroundDepth is now fixed for engrave mode
    engraveDepth,
    orientation,
    stickerMode,
  } = TextToVoxInputSchema.parse(input);

  const backgroundDepth = 16; // Locked value

  let xyziValues: {x: number, y: number, z: number, i: number}[] = [];
  
  const addVoxel = (px: number, py: number, pz: number, colorIndex = 1) => {
    xyziValues.push({ x: Math.round(px), y: Math.round(py), z: Math.round(pz), i: colorIndex });
  };
  
  // Add anchor point conditionally
  if (mode === 'extrude') {
      const zAnchor = (orientation === 'vertical-lr' && stickerMode) ? 15 : 0;
      addVoxel(0, 0, zAnchor, 2);
  }

  let pixels = originalPixels;
  let modelWidth = textWidth;
  let modelHeight = textHeight;

  if (mode === 'engrave') {
      const finalWidth = Math.ceil(textWidth / 16) * 16;
      const finalHeight = Math.ceil(textHeight / 16) * 16;
      
      const paddedPixels = Array(finalWidth * finalHeight).fill(false);
      const xOffset = Math.floor((finalWidth - textWidth) / 2);
      const yOffset = Math.floor((finalHeight - textHeight) / 2);
      
      for(let y = 0; y < textHeight; y++) {
          for(let x = 0; x < textWidth; x++) {
              if (originalPixels[y * textWidth + x]) {
                  paddedPixels[(y + yOffset) * finalWidth + (x + xOffset)] = true;
              }
          }
      }
      pixels = paddedPixels;
      modelWidth = finalWidth;
      modelHeight = finalHeight;
  }

  let modelDepth = 0;
  const STICKER_BLOCK_DEPTH = 16;
  
  const placeVoxel = (px: number, py: number, pz: number, zOffset: number) => {
    addVoxel(px, modelHeight - 1 - py, pz + zOffset);
  };

  if (mode === 'extrude') {
    // For vertical sticker mode, text should be at z=0, so zOffset is 0.
    const zOffset = (stickerMode && orientation === 'horizontal') ? STICKER_BLOCK_DEPTH - letterDepth : 0;
    modelDepth = stickerMode ? STICKER_BLOCK_DEPTH : letterDepth;

    for (let py = 0; py < modelHeight; py++) {
      for (let px = 0; px < modelWidth; px++) {
        if (pixels[py * modelWidth + px]) {
          for (let pz = 0; pz < letterDepth; pz++) {
             if (orientation === 'vertical-lr' && stickerMode) {
                placeVoxel(px, py, pz, 0);
             } else {
                placeVoxel(px, py, pz, zOffset);
             }
          }
        }
      }
    }
  } else if (mode === 'engrave') {
    modelDepth = stickerMode ? STICKER_BLOCK_DEPTH : backgroundDepth;
    const zStart = stickerMode ? STICKER_BLOCK_DEPTH - backgroundDepth : 0;
    
    for (let py = 0; py < modelHeight; py++) {
      for (let px = 0; px < modelWidth; px++) {
        const isTextPixel = pixels[py * modelWidth + px];
        
        const startDepthForPixel = isTextPixel ? engraveDepth : 0;

        for (let pz = startDepthForPixel; pz < backgroundDepth; pz++) {
             placeVoxel(px, py, pz, zStart);
        }
      }
    }
  }

  let finalWidth: number, finalHeight: number, finalDepth: number;
  let finalXyzi: {x: number, y: number, z: number, i: number}[];

  if (orientation === 'vertical-lr') {
    finalWidth = modelWidth;
    finalHeight = modelDepth;
    finalDepth = modelHeight;
    
    // Correct transformation for vertical orientation
    if (mode === 'engrave') {
        const zStartEngrave = stickerMode ? STICKER_BLOCK_DEPTH - backgroundDepth : 0;
        xyziValues = []; // Recalculate for correct rotation
        
        for (let py = 0; py < modelHeight; py++) {
          for (let px = 0; px < modelWidth; px++) {
            const isTextPixel = pixels[py * modelWidth + px];
            const startDepthForPixel = isTextPixel ? engraveDepth : 0;

            for (let pz = startDepthForPixel; pz < backgroundDepth; pz++) {
                // Correctly place voxels for vertical engraving
                addVoxel(px, backgroundDepth - 1 - pz + zStartEngrave, modelHeight - 1 - py);
            }
          }
        }
         finalXyzi = xyziValues;
    } else {
         finalXyzi = xyziValues.map(v => ({ x: v.x, y: v.z, z: v.y, i: v.i }));
    }

  } else { // Horizontal
    finalWidth = modelWidth;
    finalHeight = modelHeight;
    finalDepth = modelDepth;
    
    finalXyzi = xyziValues;
  }
 
  const palette: PaletteColor[] = [
    { r: 0, g: 0, b: 0, a: 0 },
    { r: 200, g: 164, b: 100, a: 255 }, // Main color
    { r: 10, g: 10, b: 10, a: 255 },    // Anchor color
  ];
  while (palette.length < 256) {
    palette.push({ r: 0, g: 0, b: 0, a: 0 });
  }

  const voxSize = { x: finalWidth, y: finalDepth, z: finalHeight };

  const voxObject = {
      size: voxSize,
      xyzi: {
          numVoxels: finalXyzi.length,
          values: finalXyzi.map(v => ({ x: v.x, y: v.z, z: v.y, i: v.i })),
      },
      rgba: { values: palette }
  };
    
  const buffer: Uint8Array = writeVox(voxObject);
  const voxDataB64 = Buffer.from(buffer).toString('base64');
  
  return {
      schematicData: createSchematicData('VOX Text', {width: finalWidth, height: finalHeight, depth: finalDepth}),
      width: finalWidth,
      height: finalHeight,
      depth: finalDepth,
      isVox: true,
      voxData: voxDataB64,
      voxSize: voxSize,
  };
}
