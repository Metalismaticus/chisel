
'use server';
/**
 * @fileOverview A server action for generating .vox models of signs with icons and text.
 *  * - generateSignToVoxFlow - A function that handles the sign generation process.
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
    signType: z.enum(['standard', 'hanging']),
    // Standard Sign
    width: z.number().int().min(16),
    height: z.number().int().min(16),
    frame: z.boolean(),
    frameWidth: z.number().int().min(1),
    // Hanging Sign
    hangingWidth: z.number(), // 48, 64, 80
    hangingIconPosition: z.enum(['left', 'right']),
    hangingSignThickness: z.number().int().min(1),
    hangingSignIconOffsetX: z.number().int(),
    hangingSignTextOffsetX: z.number().int(),
    // Common
    icon: PixelDataSchema.optional(),
    text: z.string(),
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
  const params = SignToVoxInputSchema.parse(input);
  
  const signWidth = params.signType === 'hanging' ? params.hangingWidth : params.width;
  const signHeight = params.signType === 'hanging' ? 16 : params.height;
  const modelDepth = 32;

  const voxelMap = new Map<string, number>();

  const addVoxel = (px: number, py: number, pz: number, colorIndex = 1) => {
    // Overwrite if a voxel already exists at this position
    voxelMap.set(`${px|0},${py|0},${pz|0}`, colorIndex);
  };
  
  // --- Background/Frame Generation ---
  if (params.signType === 'standard' && params.frame) {
    const cornerRadius = params.frameWidth * 2;
    for(let y = 0; y < signHeight; y++) {
      for (let x = 0; x < signWidth; x++) {
          let isFrame = false;
          // Top/bottom and left/right edges
          if (y < params.frameWidth || y >= signHeight - params.frameWidth) isFrame = true;
          if (x < params.frameWidth || x >= signWidth - params.frameWidth) isFrame = true;
          
          // Carve out corners
          const checkCorner = (cx: number, cy: number, radius: number) => (Math.abs(x - cx) < radius && Math.abs(y - cy) < radius) && ((x-cx+0.5)**2 + (y-cy+0.5)**2 > radius**2);
          if (checkCorner(cornerRadius, cornerRadius, cornerRadius)) isFrame = false;
          if (checkCorner(signWidth - 1 - cornerRadius, cornerRadius, cornerRadius)) isFrame = false;
          if (checkCorner(cornerRadius, signHeight - 1 - cornerRadius, cornerRadius)) isFrame = false;
          if (checkCorner(signWidth - 1 - cornerRadius, signHeight - 1 - cornerRadius, cornerRadius)) isFrame = false;
          
          if(isFrame) addVoxel(x, y, 15, 2); // Frame is on the same plane as content
      }
    }
  } else if (params.signType === 'hanging') {
    const thickness = params.hangingSignThickness;
    const cornerRadius = 4;
    
    // The backplate starts from z=16 and goes deeper
    const zStart = 16; 
    
    for (let z = 0; z < thickness; z++) {
        for (let y = 0; y < signHeight; y++) {
            for (let x = 0; x < signWidth; x++) {
                // Check if inside rounded rectangle
                const isInside = (x >= cornerRadius && x < signWidth - cornerRadius) || // Main body
                       (y >= cornerRadius && y < signHeight - cornerRadius) || // Main body
                       // Check each corner circle
                       (Math.pow(x + 0.5 - cornerRadius, 2) + Math.pow(y + 0.5 - cornerRadius, 2) <= Math.pow(cornerRadius, 2)) ||
                       (Math.pow(x + 0.5 - (signWidth - cornerRadius), 2) + Math.pow(y + 0.5 - cornerRadius, 2) <= Math.pow(cornerRadius, 2)) ||
                       (Math.pow(x + 0.5 - cornerRadius, 2) + Math.pow(y + 0.5 - (signHeight - cornerRadius), 2) <= Math.pow(cornerRadius, 2)) ||
                       (Math.pow(x + 0.5 - (signWidth - cornerRadius), 2) + Math.pow(y + 0.5 - (signHeight - cornerRadius), 2) <= Math.pow(cornerRadius, 2));
                
                if (isInside) {
                     addVoxel(x, y, zStart + z, 1); // Backplate color
                }
            }
        }
    }
  }
  
  const hasIcon = params.icon && params.icon.pixels.length > 0 && params.signWithIcon;

  // --- Content Layout & Placement ---
  const pad = params.signType === 'standard' && params.frame ? params.frameWidth : (params.signType === 'hanging' ? 2 : 0);
  const availableWidth = signWidth - pad * 2;
  const availableHeight = signHeight - pad * 2;
  
  const contentItems: { type: 'icon' | 'text', width: number, height: number, pixels: boolean[], offsetX: number, offsetY: number }[] = [];

  if (hasIcon) {
    const offsetX = params.signType === 'hanging' ? params.hangingSignIconOffsetX : 0;
    const offsetY = params.signType === 'standard' ? params.signIconOffsetY : 0;
    contentItems.push({type: 'icon', ...params.icon!, offsetX, offsetY});
  }

  if (params.text && params.text.trim().length > 0) {
      const { lines, totalHeight } = await rasterizePixelText({ text: params.text.toUpperCase(), maxWidth: availableWidth });
      const combinedPixels = Array(availableWidth * totalHeight).fill(false);
      let currentY = 0;
      for (const line of lines) {
        const xOffset = Math.floor((availableWidth - line.width) / 2);
        for (let y = 0; y < line.height; y++) {
            for (let x = 0; x < line.width; x++) {
                if (line.pixels[y * line.width + x]) {
                    combinedPixels[(currentY + y) * availableWidth + (xOffset + x)] = true;
                }
            }
        }
        currentY += line.height + 1; // line spacing
      }
       const offsetX = params.signType === 'hanging' ? params.hangingSignTextOffsetX : 0;
       const offsetY = params.signType === 'standard' ? params.textOffsetY : 0;
      contentItems.push({type: 'text', width: availableWidth, height: totalHeight, pixels: combinedPixels, offsetX, offsetY });
  }
  
  if (params.signType === 'hanging' && params.hangingIconPosition === 'right') {
      contentItems.reverse();
  }
  
  const spacing = 4; // Spacing between icon and text for hanging sign
  
  // Calculate total width needed for all content items
  const totalContentWidth = contentItems.reduce((sum, item) => {
      // For text, use the actual width of rasterized text, not availableWidth
      const itemWidth = item.type === 'text'
          ? (hasIcon && params.signType === 'hanging' ? item.width - params.icon!.width - spacing : item.width)
          : item.width;
      return sum + itemWidth;
  }, 0) + (contentItems.length > 1 ? spacing : 0);

  let currentX = pad + Math.floor((availableWidth - totalContentWidth) / 2);
  
  // Content is always placed on z=15 plane
  const voxelDepth = 15;

  for (const item of contentItems) {
    const itemBaseY = pad + Math.floor((availableHeight - item.height) / 2);
    const finalItemY = itemBaseY + item.offsetY;
    
    // For standard sign, content is "carved" (same color as anchor)
    // For hanging sign, content is "sticker" (different color)
    const colorIndex = params.signType === 'standard' ? 2 : 3; 

    const finalItemX = currentX + item.offsetX;

    for (let y = 0; y < item.height; y++) {
        for (let x = 0; x < item.width; x++) {
            if (item.pixels[y * item.width + x]) {
                 addVoxel(x + finalItemX, signHeight - 1 - (y + finalItemY), voxelDepth, colorIndex);
            }
        }
    }
    const itemWidth = item.type === 'text'
        ? (hasIcon && params.signType === 'hanging' ? item.width - params.icon!.width - spacing : item.width)
        : item.width;
    currentX += itemWidth + spacing;
  }
  
  // Add anchor point at the end, will not be overwritten.
  addVoxel(0, 0, 0, 2);

  const xyziValues: {x: number, y: number, z: number, i: number}[] = [];
  for (const [key, value] of voxelMap.entries()) {
      const [x, y, z] = key.split(',').map(Number);
      xyziValues.push({ x, y, z, i: value });
  }
  
  const modelWidth = signWidth;
  const modelHeight = signHeight;
 
  const palette: PaletteColor[] = Array.from({length: 256}, () => ({r:0,g:0,b:0,a:0}));
  palette[0] = { r: 0, g: 0, b: 0, a: 0 }; 
  palette[1] = { r: 10, g: 10, b: 10, a: 255 }; // Hanging Sign Background
  palette[2] = { r: 200, g: 164, b: 100, a: 255 }; // Anchor & Standard Sign Frame/Content
  palette[3] = { r: 220, g: 220, b: 220, a: 255 }; // Hanging Sign Content (Text/Icon)

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
