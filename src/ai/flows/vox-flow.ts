
'use server';
/**
 * @fileOverview A server action for generating .vox models of 3D shapes.
 *
 * - generateVoxFlow - A function that handles the .vox generation process.
 * - VoxOutput - The return type for the generateVoxFlow function.
 */

import { voxToSchematic, type VoxShape } from '@/lib/schematic-utils';
import { z } from 'zod';

// We define the output type here for client-side usage.
export interface VoxOutput {
  schematicData: string;
  width: number;
  height: number;
  depth: number;
  isVox: boolean;
  voxData: string; // Base64 encoded string
  voxSize: {x: number, y: number, z: number};
}

// This is the main exported function that the client will call.
// It's a standard Next.js Server Action.
export async function generateVoxFlow(input: VoxShape): Promise<VoxOutput> {
  // Directly call the utility function to generate the schematic and raw .vox data (Uint8Array)
  const result = voxToSchematic(input);

  if (!result || !result.isVox || !result.voxData) {
      throw new Error('Flow did not return valid vox data.');
  }

  // The utility returns voxData as a raw Uint8Array buffer. We need to convert it 
  // to a Base64 string for JSON serialization to the client.
  const voxDataB64 = Buffer.from(result.voxData).toString('base64');
  
  return {
      schematicData: result.schematicData,
      width: result.width,
      height: result.height,
      depth: result.depth,
      isVox: result.isVox,
      voxData: voxDataB64,
      voxSize: result.voxSize
  };
}
