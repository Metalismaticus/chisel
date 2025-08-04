
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
import type { PaletteColor, TextOrientation } from '@/lib/schematic-utils';

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
    pixels, 
    width: textWidth, 
    height: textHeight, 
    mode, 
    letterDepth, 
    backgroundDepth, 
    engraveDepth,
    orientation,
    stickerMode,
  } = TextToVoxInputSchema.parse(input);

  let xyziValues: {x: number, y: number, z: number, i: number}[] = [];
  
  // Helper to add a voxel, consistently handling Y-up to Z-up conversion for vox-saver
  // Our internal logic is X-Right, Y-Up, Z-Forward
  const addVoxel = (px: number, py: number, pz: number, colorIndex = 1) => {
    // The color index is 1, which maps to the first color in our palette.
    xyziValues.push({ x: Math.round(px), y: Math.round(py), z: Math.round(pz), i: colorIndex });
  };
  addVoxel(0,0,0,2); // Add anchor point
  
  let modelWidth = textWidth;
  let modelHeight = textHeight;
  let modelDepth = 0;

  const STICKER_BLOCK_DEPTH = 16;
  const zOffset = stickerMode ? STICKER_BLOCK_DEPTH - letterDepth : 0;

  // Remap 2D pixel coordinates (px, py) from the rasterized text to 3D voxel coordinates (x, y, z)
  const mapCoords = (px: number, py: number, pz: number): [number, number, number] => {
      const finalPz = pz + zOffset;
      if (orientation === 'vertical-lr') { // Text lays flat on the floor, reads left-to-right
          return [px, finalPz, textHeight - 1 - py]; // x=text_x, y=depth, z=text_y
      }
      // Horizontal text stands up on a wall
      return [px, textHeight - 1 - py, finalPz]; // x=text_x, y=text_y, z=depth
  };

  if (mode === 'extrude') {
    modelDepth = stickerMode ? STICKER_BLOCK_DEPTH : letterDepth;
    for (let py = 0; py < textHeight; py++) {
      for (let px = 0; px < textWidth; px++) {
        if (pixels[py * textWidth + px]) {
          for (let pz = 0; pz < letterDepth; pz++) {
            const [x, y, z] = mapCoords(px, py, pz);
            addVoxel(x, y, z);
          }
        }
      }
    }
  } else if (mode === 'engrave') {
    modelDepth = stickerMode ? STICKER_BLOCK_DEPTH : backgroundDepth;
    const engraveZOffset = stickerMode ? STICKER_BLOCK_DEPTH - backgroundDepth : 0;
    
    for (let py = 0; py < textHeight; py++) {
      for (let px = 0; px < textWidth; px++) {
        const isTextPixel = pixels[py * textWidth + px];
        
        // If it's a text pixel, we don't dig as deep
        const endDepth = isTextPixel ? backgroundDepth - engraveDepth : backgroundDepth;

        for (let pz = 0; pz < endDepth; pz++) {
            const finalPz = pz + engraveZOffset;
            if (orientation === 'vertical-lr') {
                 addVoxel(px, finalPz, textHeight - 1 - py);
            } else {
                 addVoxel(px, textHeight - 1 - py, finalPz);
            }
        }
      }
    }
  }

  // Adjust final model dimensions based on orientation for the schematic info
  let finalWidth = modelWidth;
  let finalHeight = modelHeight;
  let finalDepth = modelDepth;
  if (orientation === 'vertical-lr') {
    finalHeight = modelDepth; // New height is the depth
    finalDepth = modelHeight; // New depth is the text height
  }
 
  const palette: PaletteColor[] = Array.from({length: 256}, () => ({r:0,g:0,b:0,a:0}));
  palette[0] = { r: 0, g: 0, b: 0, a: 0 };
  palette[1] = { r: 200, g: 164, b: 100, a: 255 }; // Main color
  palette[2] = { r: 10, g: 10, b: 10, a: 255 }; // Anchor color

  // Determine the final size for the .vox file, swapping Y and Z for Z-up format
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
          // Note: vox-saver expects Z-up, so we swap Y and Z from our internal coord system in the final object.
          values: xyziValues.map(v => ({ x: v.x, y: v.z, z: v.y, i: v.i }))
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
