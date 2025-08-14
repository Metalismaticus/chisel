
'use server';
/**
 * @fileOverview A server action for generating .vox models of signs with icons and text.
 * 
 * - generateSignToVoxFlow - A function that handles the sign generation process.
 * - SignToVoxInput - The input type for the flow.
 * - SignToVoxOutput - The return type for the flow.
 */

import { z } from 'zod';
const writeVox = require('vox-saver');
import type { PaletteColor } from '@/lib/schematic-utils';
import { rasterizePixelText } from '@/lib/schematic-utils';

const PixelDataSchema = z.object({
    pixels: z.array(z.boolean()),
    width: z.number().int(),
    height: z.number().int(),
    offsetY: z.number().int().optional(),
});

const SignToVoxInputSchema = z.object({
    width: z.number().int().min(16),
    height: z.number().int().min(16),
    frameWidth: z.number().int().min(1),
    icon: PixelDataSchema.optional(),
    text: z.string(), // Changed from PixelDataSchema to string
    frame: z.boolean(),
    signIconScale: z.number(),
    signIconOffsetY: z.number(),
    textOffsetY: z.number(),
    signWithIcon: z.boolean(),
});

export type SignToVoxInput = z.infer<typeof SignToVoxInputSchema>;

export interface SignToVoxOutput {
    schematicData: string;
    width: number;
    height: number;
    depth: number;
    isVox: boolean;
    voxData: string; // Base64 encoded string
    voxSize: {x: number, y: number, z: number};
    totalVoxels: number;
}

function createSchematicData(name: string, dimensions: {width: number, height: number, depth?: number}): string {
    const { width, height, depth } = dimensions;
    const depthInfo = depth ? `x${depth}`: '';
    return `Schematic: ${name} (${width}x${height}${depthInfo})`;
}


export async function generateSignToVoxFlow(input: SignToVoxInput): Promise<SignToVoxOutput> {
  const { 
    width: signWidth,
    height: signHeight,
    frameWidth,
    icon,
    text,
    frame,
    signIconOffsetY,
    textOffsetY,
    signWithIcon
  } = SignToVoxInputSchema.parse(input);

  let xyziValues: {x: number, y: number, z: number, i: number}[] = [];
  const Z_OFFSET = 15;
  const Y_OFFSET = 4;
  
  const addVoxel = (px: number, py: number, pz: number, colorIndex = 1) => {
    xyziValues.push({ x: Math.round(px), y: Math.round(py + Y_OFFSET), z: Math.round(pz), i: colorIndex });
  };
  addVoxel(0,-Y_OFFSET,0,2); // Anchor point at 0,0,0

  // 1. Generate Frame
  if (frame) {
    const cornerRadius = frameWidth * 2;
    for(let y = 0; y < signHeight; y++) {
      for (let x = 0; x < signWidth; x++) {
          let isFrame = false;
          // Top/Bottom border
          if (y < frameWidth || y >= signHeight - frameWidth) isFrame = true;
          // Left/Right border
          if (x < frameWidth || x >= signWidth - frameWidth) isFrame = true;

          // Carve out rounded corners
          const checkCorner = (cx: number, cy: number, radius: number) => {
              const dx = Math.abs(x - cx);
              const dy = Math.abs(y - cy);
              if (dx > radius || dy > radius) return false;
              return (dx - radius) * (dx - radius) + (dy - radius) * (dy - radius) > radius * radius;
          }
          
          // Top-left
          if (checkCorner(cornerRadius, cornerRadius, cornerRadius)) isFrame = false;
          // Top-right
          if (checkCorner(signWidth - 1 - cornerRadius, cornerRadius, cornerRadius)) isFrame = false;
          // Bottom-left
          if (checkCorner(cornerRadius, signHeight - 1 - cornerRadius, cornerRadius)) isFrame = false;
          // Bottom-right
          if (checkCorner(signWidth - 1 - cornerRadius, signHeight - 1 - cornerRadius, cornerRadius)) isFrame = false;


          if(isFrame) addVoxel(x, signHeight - 1 - y, Z_OFFSET);
      }
    }
  }
  
  // Calculate content area as if the frame always exists to ensure consistent centering.
  const contentWidth = signWidth - (frameWidth * 2);
  const contentXStart = frameWidth;
  const contentHeight = signHeight - (frameWidth * 2);
  const contentCenterY = Math.floor(signHeight / 2);
  const hasIcon = icon && icon.pixels.length > 0 && signWithIcon;
  
  // 2. Place Icon
  if (hasIcon) {
      const iconXOffset = contentXStart + Math.floor((contentWidth - icon.width) / 2);
      const iconBaseY = contentCenterY + Math.floor(contentHeight * 0.25) - Math.floor(icon.height / 2);
      const finalIconYOffset = iconBaseY + (signIconOffsetY || 0);

      for (let y = 0; y < icon.height; y++) {
          for (let x = 0; x < icon.width; x++) {
              if (icon.pixels[y * icon.width + x]) {
                  addVoxel(x + iconXOffset, signHeight - 1 - (y + finalIconYOffset), Z_OFFSET);
              }
          }
      }
  }

  // 3. Place Text
  if (text && text.trim().length > 0) {
      const { lines, totalHeight: textBlockHeight } = await rasterizePixelText({
          text: text.toUpperCase(),
      });
      
      let textBaseY;
       if(hasIcon) {
        textBaseY = contentCenterY - Math.floor(contentHeight * 0.25) - Math.floor(textBlockHeight / 2);
      } else {
        // If no icon, center text vertically
        textBaseY = Math.floor((signHeight - textBlockHeight) / 2);
      }

      const finaltextYOffset = textBaseY + (textOffsetY || 0);

      let currentY = finaltextYOffset;

      for (const line of lines) {
        const textXOffset = contentXStart + Math.floor((contentWidth - line.width) / 2);
        for(let y = 0; y < line.height; y++) {
            for (let x = 0; x < line.width; x++) {
                if (line.pixels[y * line.width + x]) {
                    addVoxel(x + textXOffset, signHeight - 1 - (currentY + y), Z_OFFSET);
                }
            }
        }
        currentY += line.height + 1; // +1 for line spacing
      }
  }


  const modelWidth = signWidth;
  const modelHeight = signHeight + Y_OFFSET;
  const modelDepth = 16;
 
  const palette: PaletteColor[] = Array.from({length: 256}, () => ({r:0,g:0,b:0,a:0}));
  palette[0] = { r: 0, g: 0, b: 0, a: 0 }; // Main color
  palette[1] = { r: 10, g: 10, b: 10, a: 255 }; // Main color
  palette[2] = { r: 200, g: 164, b: 100, a: 255 }; // Anchor color

  const voxSize = { x: modelWidth, y: modelDepth, z: modelHeight };

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
      schematicData: createSchematicData('VOX Sign', {width: modelWidth, height: modelHeight, depth: modelDepth}),
      width: modelWidth,
      height: modelHeight,
      depth: modelDepth,
      isVox: true,
      voxData: voxDataB64,
      voxSize: voxSize,
      totalVoxels: xyziValues.length - 1,
  };
}
    
