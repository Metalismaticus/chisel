















import type { ConversionMode } from './schematic-utils';
const writeVox = require('vox-saver');


export interface PaletteColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface SchematicOutput {
  schematicData: string;
  width: number;
  height: number;
  depth: number;
  pixels: (boolean | number)[];
  isVox?: boolean;
  voxData?: Uint8Array;
  palette?: PaletteColor[];
  originalWidth?: number;
  originalHeight?: number;
  voxSize?: {x: number, y: number, z: number};
  totalVoxels?: number;
}

export type FontStyle = 'monospace' | 'serif' | 'sans-serif' | 'custom';
export type Shape = 'circle' | 'triangle' | 'rhombus' | 'hexagon';
export type TextOrientation = 'horizontal' | 'vertical-lr';

type HemispherePart = `hemisphere-${'top' | 'bottom' | 'vertical'}`;
type DiskOrientation = 'horizontal' | 'vertical';
type ArchType = 'rectangular' | 'rounded' | 'circular';
type CircularArchOrientation = 'top' | 'bottom';
export type ColumnStyle = 'simple' | 'decorative' | 'ionic';


type ArchRectangular = { archType: 'rectangular', width: number, height: number, depth: number, outerCornerRadius?: 0 };
type ArchRounded = { archType: 'rounded', width: number, height: number, depth: number, outerCornerRadius: number };
type ArchCircular = { archType: 'circular', width: number, thickness: number, depth: number, orientation: CircularArchOrientation };


export type VoxShape = 
    | { type: 'cuboid', width: number, height: number, depth: number }
    | { type: 'sphere', radius: number, part?: 'full' | HemispherePart }
    | { type: 'pyramid', base: number, height: number }
    | { type: 'cone', radius: number, height: number }
    | { 
        type: 'column', 
        radius: number, 
        height: number,
        withBase?: boolean,
        withCapital?: boolean,
        baseRadius?: number,
        baseHeight?: number,
        baseStyle?: ColumnStyle,
        capitalStyle?: ColumnStyle,
        brokenTop?: boolean,
        withDebris?: boolean,
        debrisLength?: number,
        breakAngleX?: number,
        breakAngleZ?: number,
      }
    | ({ type: 'arch' } & (ArchRectangular | ArchRounded | ArchCircular))
    | { type: 'disk', radius: number, height: number, part?: 'full' | 'half', orientation: DiskOrientation }
    | { type: 'ring', radius: number, thickness: number, height: number, part?: 'full' | 'half', orientation: DiskOrientation }
    | { type: 'qrcode', pixels: boolean[], size: number, depth: number, withBackdrop?: boolean, backdropDepth?: number, stickerMode?: boolean }
    | { type: 'checkerboard', width: number, length: number, height: number };


// A simple helper to generate schematic data string
function createSchematicData(name: string, dimensions: {width: number, height: number, depth?: number}): string {
    const { width, height, depth } = dimensions;
    const depthInfo = depth ? `x${depth}`: '';

    const xChunks = Math.ceil(width / 16);
    const yChunks = Math.ceil(height / 16);
    const zChunks = depth ? Math.ceil(depth / 16) : 1;
    const totalChunks = xChunks * yChunks * zChunks;

    return `Schematic: ${name} (${width}x${height}${depthInfo})`;
}

interface RasterizeTextParams {
  text: string;
  font?: FontStyle;
  fontSize?: number;
  fontUrl?: string;
  outline?: boolean;
  outlineGap?: number;
  outlineWidth?: number;
  orientation?: TextOrientation;
  maxWidth?: number;
}

export async function rasterizeText({
  text,
  font,
  fontSize,
  fontUrl,
  outline = false,
  outlineGap = 1,
  outlineWidth = 1,
  orientation = 'horizontal',
  maxWidth,
}: RasterizeTextParams): Promise<{ pixels: boolean[], width: number, height: number }> {
    if (typeof document === 'undefined' || !text || !text.trim()) {
        return { width: 0, height: 0, pixels: [] };
    }

    const fontName = fontUrl?.split('/').pop()?.split('.')[0] || 'custom-font';
    let loadedFontFamily = font;

    let fontFace: FontFace | undefined;
    if (fontUrl && font === 'custom') {
      fontFace = new FontFace(fontName, `url(${fontUrl})`);
      try {
        await fontFace.load();
        document.fonts.add(fontFace);
        loadedFontFamily = fontName;
      } catch (e) {
        console.error('Font loading failed:', e);
        // Fallback or re-throw
        throw new Error(`Failed to load font: ${fontUrl}`);
      }
    }
    
    // Create a temporary canvas to measure text
    const tempCtx = document.createElement('canvas').getContext('2d')!;
    tempCtx.font = `${fontSize}px ${loadedFontFamily}`;
    
    // Word wrapping logic
    const words = text.split(' ');
    let lines: string[] = [];
    let currentLine = words[0] || '';

    if (maxWidth) {
        for (let i = 1; i < words.length; i++) {
            let testLine = currentLine + ' ' + words[i];
            let metrics = tempCtx.measureText(testLine);
            let testWidth = metrics.width;
            if (testWidth > maxWidth && i > 0) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
    } else {
        currentLine = text;
    }
    lines.push(currentLine);

    const lineMetrics = lines.map(line => tempCtx.measureText(line));
    const totalWidth = Math.ceil(Math.max(...lineMetrics.map(m => m.width)));
    const ascent = Math.max(...lineMetrics.map(m => m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? fontSize));
    const descent = Math.max(...lineMetrics.map(m => m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? 0));
    const lineHeight = Math.ceil(ascent + descent);
    const totalHeight = lineHeight * lines.length;

    
    if (totalWidth <= 0 || totalHeight <= 0) {
        if (fontFace && document.fonts.has(fontFace)) {
            document.fonts.delete(fontFace);
        }
        return { width: 0, height: 0, pixels: [] };
    }
    
    // Create a working canvas with enough padding for the outline and measurement inaccuracies
    const PADDING = (outline ? (outlineGap ?? 1) + (outlineWidth ?? 1) : 0) + 5; 
    const contentWidth = totalWidth + PADDING * 2;
    const contentHeight = totalHeight + PADDING * 2;
    
    const workCanvas = document.createElement('canvas');
    workCanvas.width = contentWidth;
    workCanvas.height = contentHeight;
    const ctx = workCanvas.getContext('2d', { willReadFrequently: true })!;
    
    // Draw the text onto the working canvas
    ctx.font = `${fontSize}px ${loadedFontFamily}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top'; 
    
    if(outline) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = outlineWidth * 2; // Create stroke from center
      ctx.lineJoin = 'round';
      lines.forEach((line, i) => {
          ctx.strokeText(line, PADDING + (outlineGap ?? 1), PADDING + i * lineHeight + (outlineGap ?? 1));
      });
    }

    lines.forEach((line, i) => {
        ctx.fillText(line, PADDING, PADDING + i * lineHeight);
    });
    
    // Cleanup custom font
    if (fontFace && document.fonts.has(fontFace)) {
        document.fonts.delete(fontFace);
    }
    
    // Get pixel data from the working canvas
    const imageData = ctx.getImageData(0, 0, contentWidth, contentHeight);
    const data = imageData.data;

    // Create a boolean array for the text pixels
    const textPixels = Array(contentWidth * contentHeight).fill(false);
    for (let i = 0; i < data.length; i += 4) {
        if (data[i+3] > 128) { // Check alpha channel
            textPixels[i / 4] = true;
        }
    }
    
    let combinedPixels = textPixels;

    // Crop the combined pixels to their actual bounding box
    let minX = contentWidth, minY = contentHeight, maxX = -1, maxY = -1;
    for(let y = 0; y < contentHeight; y++) {
        for (let x = 0; x < contentWidth; x++) {
            if (combinedPixels[y * contentWidth + x]) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    
    if (maxX === -1) { // Empty schematic
       return { width: 0, height: 0, pixels: [] };
    }
    
    const croppedWidth = maxX - minX + 1;
    const croppedHeight = maxY - minY + 1;
    const croppedPixels = Array(croppedWidth * croppedHeight).fill(false);
    
    for(let y = 0; y < croppedHeight; y++) {
        for(let x = 0; x < croppedWidth; x++) {
            croppedPixels[y * croppedWidth + x] = combinedPixels[(y + minY) * contentWidth + (x + minX)];
        }
    }

    if (orientation === 'vertical-lr') {
        const rotatedPixels = Array(croppedWidth * croppedHeight).fill(false);
        const rotatedWidth = croppedHeight;
        const rotatedHeight = croppedWidth;
        for (let y = 0; y < croppedHeight; y++) {
            for (let x = 0; x < croppedWidth; x++) {
                if (croppedPixels[y * croppedWidth + x]) {
                    rotatedPixels[x * rotatedWidth + (rotatedWidth - 1 - y)] = true;
                }
            }
        }
        return { pixels: rotatedPixels, width: rotatedWidth, height: rotatedHeight };
    }

    return { pixels: croppedPixels, width: croppedWidth, height: croppedHeight };
}

// Map for a 5px height pixel font. 1 represents a pixel.
const TINY_FONT_DATA: Record<string, number[][]> = {
    'A': [[0,1,1,0],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
    'B': [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,1],[1,1,1,0]],
    'C': [[0,1,1,1],[1,0,0,0],[1,0,0,0],[1,0,0,0],[0,1,1,1]],
    'D': [[1,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,0]],
    'E': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,1]],
    'F': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
    'G': [[0,1,1,1],[1,0,0,0],[1,0,1,1],[1,0,0,1],[0,1,1,1]],
    'H': [[1,0,0,1],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
    'I': [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
    'J': [[0,0,1,1],[0,0,0,1],[0,0,0,1],[1,0,0,1],[0,1,1,0]],
    'K': [[1,0,0,1],[1,0,1,0],[1,1,0,0],[1,0,1,0],[1,0,0,1]],
    'L': [[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]],
    'M': [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]],
    'N': [[1,0,0,1],[1,1,0,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]],
    'O': [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
    'P': [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
    'Q': [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,1,1],[0,1,1,1]],
    'R': [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,1]],
    'S': [[0,1,1,1],[1,0,0,0],[0,1,1,0],[0,0,0,1],[1,1,1,0]],
    'T': [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
    'U': [[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
    'V': [[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,0,1],[0,0,1,0]],
    'W': [[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]],
    'X': [[1,0,0,1],[0,1,1,0],[0,0,1,0],[0,1,1,0],[1,0,0,1]],
    'Y': [[1,0,0,1],[1,0,0,1],[0,1,1,0],[0,1,0,0],[0,1,0,0]],
    'Z': [[1,1,1,1],[0,0,1,0],[0,1,0,0],[1,0,0,0],[1,1,1,1]],
    '0': [[0,1,1,0],[1,0,1,1],[1,1,0,1],[1,0,0,1],[0,1,1,0]],
    '1': [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
    '2': [[0,1,1,0],[1,0,0,1],[0,0,1,0],[0,1,0,0],[1,1,1,1]],
    '3': [[1,1,1,0],[0,0,0,1],[0,1,1,0],[0,0,0,1],[1,1,1,0]],
    '4': [[1,0,1,0],[1,0,1,0],[1,1,1,1],[0,0,1,0],[0,0,1,0]],
    '5': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[0,0,0,1],[1,1,1,0]],
    '6': [[0,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,1],[0,1,1,0]],
    '7': [[1,1,1,1],[0,0,0,1],[0,0,1,0],[0,1,0,0],[0,1,0,0]],
    '8': [[0,1,1,0],[1,0,0,1],[0,1,1,0],[1,0,0,1],[0,1,1,0]],
    '9': [[0,1,1,0],[1,0,0,1],[0,1,1,1],[0,0,0,1],[1,1,1,0]],
    ' ': [[0,0],[0,0],[0,0],[0,0],[0,0]],
    '.': [[0],[0],[0],[0],[1]],
    ',': [[0,0],[0,0],[0,0],[1,0],[0,1]],
    '!': [[1],[1],[1],[0],[1]],
    '?': [[0,1,1,0],[1,0,0,1],[0,0,1,0],[0,0,0,0],[0,0,1,0]],
    '(': [[0,1],[1,0],[1,0],[1,0],[0,1]],
    ')': [[1,0],[0,1],[0,1],[0,1],[1,0]],
    '/': [[0,0,1],[0,1,0],[0,1,0],[1,0,0],[1,0,0]],
    '\\':[[1,0,0],[1,0,0],[0,1,0],[0,1,0],[0,0,1]],
    '+': [[0,0,0],[0,1,0],[1,1,1],[0,1,0],[0,0,0]],
    '-': [[0,0,0],[0,0,0],[1,1,1],[0,0,0],[0,0,0]],
    '=': [[0,0,0],[1,1,1],[0,0,0],[1,1,1],[0,0,0]],
    '_': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[1,1,1,1,1]],
};

export async function rasterizePixelText({ text, maxWidth }: { text: string, maxWidth?: number }): Promise<{ pixels: boolean[], width: number, height: number }> {
    const charHeight = 5;
    const charKerning = 1;
    const maxCharsPerLine = 8; // New rule

    const getCharWidth = (char: string): number => {
        const data = TINY_FONT_DATA[char] || TINY_FONT_DATA['?'];
        return data[0].length;
    };
    
    const getWordWidth = (word: string): number => {
        let width = 0;
        for (const char of word) {
            width += getCharWidth(char) + charKerning;
        }
        return width > 0 ? width - charKerning : 0;
    };

    // Word wrapping logic based on character count
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        // If adding the next word (with a space) exceeds the line limit
        if (currentLine.length + (currentLine.length > 0 ? 1 : 0) + word.length > maxCharsPerLine) {
            // Push the current line and start a new one if the current line is not empty
            if(currentLine.length > 0) lines.push(currentLine);
            
            // Handle words longer than the max line length
            let longWord = word;
            while (longWord.length > maxCharsPerLine) {
                lines.push(longWord.substring(0, maxCharsPerLine));
                longWord = longWord.substring(maxCharsPerLine);
            }
            currentLine = longWord;

        } else {
            // Add the word to the current line
            if (currentLine.length > 0) {
                currentLine += ' ';
            }
            currentLine += word;
        }
    }
    // Add the last line if it's not empty
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }


    const lineMetrics = lines.map(line => ({
        text: line,
        width: getWordWidth(line),
    }));

    const finalWidth = Math.max(...lineMetrics.map(m => m.width));
    const finalHeight = lines.length * (charHeight + charKerning) - charKerning;

    if (finalWidth <= 0 || finalHeight <= 0) {
        return { pixels: [], width: 0, height: 0 };
    }

    const pixels: boolean[] = Array(finalWidth * finalHeight).fill(false);
    
    let currentY = 0;
    for (const line of lineMetrics) {
        let currentX = Math.floor((finalWidth - line.width) / 2); // Center align
        for (const char of line.text) {
            const data = TINY_FONT_DATA[char] || TINY_FONT_DATA['?'];
            const charWidth = data[0].length;
            for (let y = 0; y < charHeight; y++) {
                for (let x = 0; x < charWidth; x++) {
                    if (data[y] && data[y][x] === 1) {
                        const px = currentX + x;
                        const py = currentY + y;
                        if (px < finalWidth && py < finalHeight) {
                           pixels[py * finalWidth + px] = true;
                        }
                    }
                }
            }
            currentX += charWidth + charKerning;
        }
        currentY += charHeight + charKerning;
    }

    return { pixels, width: finalWidth, height: finalHeight };
}


interface TextToSchematicParams {
  text: string;
  font: FontStyle;
  fontSize: number;
  fontUrl?: string;
  outline?: boolean;
  outlineGap?: number;
}

/**
 * Converts text to a pixel-based schematic.
 * This function uses the browser's Canvas API to rasterize text.
 */
export async function textToSchematic({
  text,
  font,
  fontSize,
  fontUrl,
  outline = false,
  outlineGap = 1,
}: TextToSchematicParams): Promise<Omit<SchematicOutput, 'depth'>> {
   
    const { pixels: croppedPixels, width: croppedWidth, height: croppedHeight } = await rasterizeText({ text, font, fontSize, fontUrl, outline, outlineGap});
    
     if (croppedWidth === 0) { // Empty schematic
        return {
            schematicData: createSchematicData(`Empty Text`, {width: 0, height: 0}),
            width: 0,
            height: 0,
            pixels: [],
        };
    }

    // Align to chunk grid
    const finalWidth = Math.ceil(croppedWidth / 16) * 16;
    const finalHeight = Math.ceil(croppedHeight / 16) * 16;
    const finalPixels = Array(finalWidth * finalHeight).fill(false);
    
    const xOffset = Math.floor((finalWidth - croppedWidth) / 2);
    const yOffset = Math.floor((finalHeight - croppedHeight) / 2);
    
    for(let y = 0; y < croppedHeight; y++) {
        for(let x = 0; x < croppedWidth; x++) {
            if (croppedPixels[y * croppedWidth + x]) {
                finalPixels[(y + yOffset) * finalWidth + (x + xOffset)] = true;
            }
        }
    }

    return {
        schematicData: createSchematicData(`Text: "${text}"`, {width: finalWidth, height: finalHeight}),
        width: finalWidth,
        height: finalHeight,
        pixels: finalPixels,
        originalWidth: croppedWidth,
        originalHeight: croppedHeight
    };
}


/**
 * Generates a pixel-based schematic for a given shape.
 */
export function shapeToSchematic(shape: 
    { type: 'circle', radius: number } | 
    { type: 'triangle', base: number, height: number, apexOffset: number } |
    { type: 'rhombus', width: number, height: number } |
    { type: 'hexagon', radius: number }
): Omit<SchematicOutput, 'depth'> {
    let rawPixels: boolean[] = [];
    let contentWidth: number, contentHeight: number;

    switch (shape.type) {
        case 'circle': {
            contentWidth = contentHeight = shape.radius * 2;
            if (shape.radius <= 0) {
                rawPixels = [];
                break;
            };

            const centerX = contentWidth / 2.0;
            const centerY = contentHeight / 2.0;
            const r = shape.radius;

            for (let y = 0; y < contentHeight; y++) {
                for (let x = 0; x < contentWidth; x++) {
                    const px = x + 0.5;
                    const py = y + 0.5;
                    const dx = px - centerX;
                    const dy = py - centerY;
                    rawPixels.push(dx * dx + dy * dy < r * r);
                }
            }
            break;
        }

        case 'triangle': {
            contentWidth = shape.base;
            contentHeight = shape.height;
            rawPixels = Array(contentWidth * contentHeight).fill(false);
            
            if (contentHeight > 0 && contentWidth > 0) {
                const geometricCenterX = (contentWidth / 2.0) + shape.apexOffset;

                for (let y = 0; y < contentHeight; y++) {
                    const progress = contentHeight > 1 ? y / (contentHeight - 1) : 1;
                    const currentWidth = progress * contentWidth;
                    
                    const startX = geometricCenterX - currentWidth / 2.0;
                    const endX = geometricCenterX + currentWidth / 2.0;

                    for (let x = 0; x < contentWidth; x++) {
                        const px = x + 0.5;
                        if (px >= startX && px <= endX) {
                            rawPixels[y * contentWidth + x] = true;
                        }
                    }
                }
            }
            break;
        }
            
        case 'rhombus': {
            contentWidth = shape.width;
            contentHeight = shape.height;
            if (contentWidth <= 0 || contentHeight <= 0) {
                rawPixels = [];
                break;
            };

            const centerX = contentWidth / 2.0;
            const centerY = contentHeight / 2.0;

            for (let y = 0; y < contentHeight; y++) {
                for (let x = 0; x < contentWidth; x++) {
                    const px = x + 0.5;
                    const py = y + 0.5;
                    const dx = Math.abs(px - centerX);
                    const dy = Math.abs(py - centerY);
                    rawPixels.push((dx / (contentWidth / 2.0)) + (dy / (contentHeight / 2.0)) <= 1);
                }
            }
            break;
        }

        case 'hexagon': {
            const r = shape.radius;
            if (r <= 0) {
                contentWidth = 0;
                contentHeight = 0;
                rawPixels = [];
                break;
            }
            // Pointy-topped hexagon
            contentWidth = Math.round(Math.sqrt(3) * r);
            contentHeight = r * 2;
            rawPixels = Array(contentWidth * contentHeight).fill(false);
            const centerX = contentWidth / 2.0;
            const centerY = contentHeight / 2.0;
            
            for (let y = 0; y < contentHeight; y++) {
                for (let x = 0; x < contentWidth; x++) {
                    const px = x + 0.5 - centerX; // Coords relative to center
                    const py = y + 0.5 - centerY;
                    const q2x = Math.abs(px);
                    const q2y = Math.abs(py);
                    if (q2x <= (Math.sqrt(3) * r) / 2 && q2y <= r) {
                        if ((Math.sqrt(3) * q2y) + q2x <= Math.sqrt(3) * r) {
                            rawPixels[y * contentWidth + x] = true;
                        }
                    }
                }
            }
            break;
        }
    }
    
    if (contentWidth === 0 || contentHeight === 0) {
         return {
            schematicData: createSchematicData(`Shape: ${shape.type}`, {width: 0, height: 0}),
            width: 0,
            height: 0,
            pixels: [],
        };
    }

    const finalWidth = Math.ceil(contentWidth / 16) * 16;
    const finalHeight = Math.ceil(contentHeight / 16) * 16;
    const finalPixels = Array(finalWidth * finalHeight).fill(false);
    
    const xOffset = Math.floor((finalWidth - contentWidth) / 2);
    const yOffset = Math.floor((finalHeight - contentHeight) / 2);
    
    for(let y = 0; y < contentHeight; y++) {
        for(let x = 0; x < contentWidth; x++) {
            if (rawPixels[y * contentWidth + x]) {
                finalPixels[(y + yOffset) * finalWidth + (x + xOffset)] = true;
            }
        }
    }

    return {
        schematicData: createSchematicData(`Shape: ${shape.type}`, {width: finalWidth, height: finalHeight}),
        width: finalWidth,
        height: finalHeight,
        pixels: finalPixels,
        originalWidth: contentWidth,
        originalHeight: contentHeight
    };
}


/**
 * Converts an image from a canvas context to a pixel-based schematic.
 * This is designed to work with OffscreenCanvas in a Web Worker.
 */
export async function imageToSchematic(ctx: OffscreenCanvasRenderingContext2D, threshold: number, mode: ConversionMode): Promise<Omit<SchematicOutput, 'depth'>> {
    const { canvas } = ctx;
    const { width: contentWidth, height: contentHeight } = canvas;
    
    const finalWidth = Math.ceil(contentWidth / 16) * 16;
    const finalHeight = Math.ceil(contentHeight / 16) * 16;

    const xOffset = Math.floor((finalWidth - contentWidth) / 2);
    const yOffset = Math.floor((finalHeight - contentHeight) / 2);
    
    // Create a new canvas with chunk-aligned dimensions
    const finalCanvas = new OffscreenCanvas(finalWidth, finalHeight);
    const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
    
    if (!finalCtx) {
        throw new Error('Failed to get final OffscreenCanvas context.');
    }
    
    // Draw the original scaled image onto the center of the new canvas
    finalCtx.drawImage(canvas, xOffset, yOffset);

    const schematicData = createSchematicData('Imported Image', {width: finalWidth, height: finalHeight});

    try {
        const imageData = finalCtx.getImageData(0, 0, finalWidth, finalHeight);
        const data = imageData.data;
        const pixels: (boolean | number)[] = [];
        
        if (mode === 'bw') {
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                pixels.push(grayscale(r, g, b) < threshold);
            }
            return { schematicData, width: finalWidth, height: finalHeight, pixels, originalWidth: contentWidth, originalHeight: contentHeight };

        } else { // mode === 'color'
            const palette: PaletteColor[] = [];
            const colorMap = new Map<string, number>();
            let colorIndex = 1; // Start with 1, 0 is for transparent

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                if (a < 128) {
                    pixels.push(0); // Transparent
                    continue;
                }
                
                const colorKey = `${r},${g},${b},${a}`;

                if (colorMap.has(colorKey)) {
                    pixels.push(colorMap.get(colorKey)!);
                } else {
                    const newIndex = colorIndex++;
                    colorMap.set(colorKey, newIndex);
                    palette.push({ r, g, b, a });
                    pixels.push(newIndex);
                }
            }
             return { schematicData, width: finalWidth, height: finalHeight, pixels, palette, originalWidth: contentWidth, originalHeight: contentHeight };
        }

    } catch(err) {
        throw new Error(`Failed to process image data: ${err}`);
    }
}


/**
 * Generates a .vox file for a given 3D shape using the vox-saver library.
 */
export function voxToSchematic(shape: VoxShape): SchematicOutput {
    let xyziValues: {x: number, y: number, z: number, i: number}[] = [];
    let width: number, height: number, depth: number;
    let name = `VOX Shape: ${shape.type}`;
    let totalVoxels = 0;
    
    const addVoxel = (x: number, y: number, z: number, i = 1) => {
        xyziValues.push({ x: Math.round(x), y: Math.round(y), z: Math.round(z), i });
    };
    addVoxel(0,0,0,2); 

    switch (shape.type) {
        case 'cuboid':
            width = shape.width;
            height = shape.height;
            depth = shape.depth;
            for (let y = 0; y < height; y++) {
                for (let z = 0; z < depth; z++) {
                    for (let x = 0; x < width; x++) {
                        addVoxel(x, y, z);
                    }
                }
            }
            break;

        case 'sphere':
            width = height = depth = shape.radius * 2;
            const { radius, part = 'full' } = shape;
            const center = (width - 1) / 2.0;

            for (let y = 0; y < height; y++) {
              for (let z = 0; z < depth; z++) {
                for (let x = 0; x < width; x++) {
                  const dx = x - center;
                  const dy = y - center;
                  const dz = z - center;
                  if (dx * dx + dy * dy + dz * dz <= radius * radius) {
                    if (part === 'full') {
                        addVoxel(x, y, z);
                    } else if (part === 'hemisphere-top' && y >= center) {
                        addVoxel(x, y, z);
                    } else if (part === 'hemisphere-bottom' && y < center) {
                        addVoxel(x, y, z);
                    } else if (part === 'hemisphere-vertical' && x < center) {
                        addVoxel(x, y, z);
                    }
                  }
                }
              }
            }
            break;
            
        case 'pyramid':
            width = depth = shape.base;
            height = shape.height;
            for (let y = 0; y < height; y++) {
                const ratio = (height > 1) ? (height - 1 - y) / (height - 1) : 1;
                const levelWidth = Math.max(1, Math.round(width * ratio));
                const offset = Math.floor((width - levelWidth) / 2);
                for (let z = offset; z < offset + levelWidth; z++) {
                    for (let x = offset; x < offset + levelWidth; x++) {
                        addVoxel(x, y, z);
                    }
                }
            }
            break;
        
        case 'column': { 
            const { 
                radius: colRadius, 
                height: totalHeight,
                withBase = false,
                withCapital = false,
                baseStyle = 'simple',
                capitalStyle = 'simple',
                brokenTop = false,
                withDebris = false,
            } = shape;
            
            const breakAngleX = brokenTop ? (shape.breakAngleX ?? 0) : 0;
            const breakAngleZ = brokenTop ? (shape.breakAngleZ ?? 0) : 0;

            const baseRadius = shape.baseRadius || Math.round(colRadius * 1.5);
            let baseHeight = shape.baseHeight || Math.max(1, Math.round(colRadius * 0.5));
            let capitalHeight = baseHeight;
            const debrisLength = shape.debrisLength || 0;
            
            let finalBaseH = withBase ? baseHeight : 0;
            let finalCapitalH = withCapital ? capitalHeight : 0;
            
            if (finalBaseH + finalCapitalH > totalHeight) {
                const partsH = finalBaseH + finalCapitalH;
                finalBaseH = Math.floor(finalBaseH * (totalHeight / partsH));
                finalCapitalH = totalHeight - finalBaseH;
            }
            const finalShaftH = totalHeight - finalBaseH - finalCapitalH;
            
            const maxRadius = Math.max(colRadius, withBase ? baseRadius : 0, withCapital ? baseRadius : 0);
            const mainColWidth = maxRadius * 2;
            const debrisWidth = (withDebris && brokenTop) ? Math.max(colRadius, withCapital ? baseRadius : 0) * 2 : 0;
            
            const debrisOffsetX = withDebris ? mainColWidth + 4 : 0;

            width = mainColWidth + (withDebris ? Math.max(debrisWidth, debrisLength) + 4 : 0);
            depth = Math.max(mainColWidth, (withDebris ? debrisWidth : 0));
            height = totalHeight;

            if (totalHeight <= 0) {
                 xyziValues = [];
                 width = height = depth = 0;
                 break;
            }
            
             const generateCylinder = (radius: number, cylinderHeight: number, style: ColumnStyle) => {
                const voxels: {x: number, y: number, z: number}[] = [];
                const center = radius - 0.5; 
                
                 for (let y = 0; y < cylinderHeight; y++) {
                    let currentRadius = radius;
                    if (style === 'decorative' && radius > 1) {
                        const patternStep = y % 4;
                        if (patternStep === 1 || patternStep === 2) { 
                             currentRadius = radius - 1;
                        }
                    }
                    const currentR2 = currentRadius * currentRadius;

                    for (let z = 0; z < radius * 2; z++) {
                        for (let x = 0; x < radius * 2; x++) {
                            const dx = x - center;
                            const dz = z - center;
                            if (dx * dx + dz * dz <= currentR2) {
                                voxels.push({ x, y, z });
                            }
                        }
                    }
                }
                return voxels;
            };

            const generateIonicCapital = (capitalHeight: number, shaftRadius: number, capitalRadius: number): {x: number, y: number, z: number}[] => {
                const voxels: {x: number, y: number, z: number}[] = [];
                
                // 1. Абака (верхняя плита)
                const abacusHeight = Math.max(1, Math.floor(capitalHeight * 0.25));
                const abacusSize = capitalRadius * 2 + 1; // Делаем нечетным для четкого центра
                const abacusYStart = capitalHeight - abacusHeight;
                for (let y = 0; y < abacusHeight; y++) {
                    for (let z = 0; z < abacusSize; z++) {
                        for (let x = 0; x < abacusSize; x++) {
                            voxels.push({x, y: y + abacusYStart, z});
                        }
                    }
                }
            
                // 2. Эхин (подушка) - упрощенный вариант
                const echinusHeight = Math.max(1, Math.floor(capitalHeight * 0.2));
                const echinusYStart = capitalHeight - abacusHeight - echinusHeight;
                for (let y = 0; y < echinusHeight; y++) {
                    const progress = echinusHeight > 1 ? y / (echinusHeight - 1) : 1; // от 0 до 1
                    const currentRadius = shaftRadius + (capitalRadius - shaftRadius) * progress;
                    const centerX = capitalRadius;
                    const centerZ = capitalRadius;
                    
                    for (let z = 0; z < abacusSize; z++) {
                        for (let x = 0; x < abacusSize; x++) {
                            const dx = x - centerX;
                            const dz = z - centerZ;
                            if (dx * dx + dz * dz <= currentRadius * currentRadius) {
                                voxels.push({x, y: y + echinusYStart, z});
                            }
                        }
                    }
                }
            
                // 3. Волюты (спирали) - самая сложная часть
                const voluteHeight = capitalHeight - abacusHeight;
                const voluteThickness = Math.max(2, Math.floor(shaftRadius * 0.5));
                const voluteCenterY = voluteHeight / 2;
                
                const generateVolute = (centerZ: number, flip: boolean) => {
                    const spiralVoxels = new Set<string>();
                    const a = 1.5; // Начальный радиус спирали
                    const b = 0.5; // Коэффициент раскручивания
                    const maxRadius = capitalRadius - shaftRadius - 1;
            
                    for (let angle = 0; angle < Math.PI * 4; angle += 0.1) {
                        const r = a + b * angle;
                        if (r > maxRadius) break;
                        
                        const relY = r * Math.sin(angle);
                        const relX = r * Math.cos(angle);
            
                        const vx = Math.round(shaftRadius + (flip ? -relX : relX));
                        const vy = Math.round(voluteCenterY + relY);
            
                        if (vy >= 0 && vy < voluteHeight) {
                            for (let z = 0; z < voluteThickness; z++) {
                                const vz = Math.round(centerZ - voluteThickness / 2 + z);
                                spiralVoxels.add(`${vx},${vy},${vz}`);
                            }
                        }
                    }
                    return Array.from(spiralVoxels).map(s => {
                        const [x, y, z] = s.split(',').map(Number);
                        return {x, y, z};
                    });
                };
            
                const voluteOffsetX = Math.floor((abacusSize - shaftRadius * 2) / 2);
                
                // Передняя левая волюта
                const volute1 = generateVolute(voluteThickness / 2, false);
                volute1.forEach(v => voxels.push({x: v.x + voluteOffsetX, y: v.y, z: v.z}));
                
                // Передняя правая волюта
                const volute2 = generateVolute(voluteThickness / 2, true);
                volute2.forEach(v => voxels.push({x: v.x + voluteOffsetX, y: v.y, z: v.z}));
            
                // Задняя левая волюта
                const volute3 = generateVolute(abacusSize - voluteThickness / 2, false);
                volute3.forEach(v => voxels.push({x: v.x + voluteOffsetX, y: v.y, z: v.z}));
                
                // Задняя правая волюта
                const volute4 = generateVolute(abacusSize - voluteThickness / 2, true);
                volute4.forEach(v => voxels.push({x: v.x + voluteOffsetX, y: v.y, z: v.z}));
            
                return voxels;
            };

            const tanX = brokenTop ? Math.tan(breakAngleX * Math.PI / 180) : 0;
            const tanZ = brokenTop ? Math.tan(breakAngleZ * Math.PI / 180) : 0;
            
            // Standing Column Part
            if (withBase && finalBaseH > 0) {
                const baseVoxels = generateCylinder(baseRadius, finalBaseH, baseStyle);
                const offsetX = Math.floor((mainColWidth / 2) - baseRadius);
                const offsetZ = Math.floor((depth / 2) - baseRadius);
                baseVoxels.forEach(v => addVoxel(v.x + offsetX, v.y, v.z + offsetZ));
            }
            
            if (finalShaftH > 0) {
                 const shaftVoxels = generateCylinder(colRadius, finalShaftH, 'simple');
                 const offsetX = Math.floor((mainColWidth / 2) - colRadius);
                 const offsetZ = Math.floor((depth / 2) - colRadius);
                 const shaftStartY = finalBaseH;

                 shaftVoxels.forEach(v => {
                    if (brokenTop) {
                         const xFromCenter = v.x - colRadius + 0.5;
                         const zFromCenter = v.z - colRadius + 0.5;
                         const breakPlaneY = (finalShaftH - 1) - (xFromCenter * tanX + zFromCenter * tanZ);
                         if (v.y < breakPlaneY) {
                            addVoxel(v.x + offsetX, v.y + shaftStartY, v.z + offsetZ);
                         }
                    } else {
                        addVoxel(v.x + offsetX, v.y + shaftStartY, v.z + offsetZ);
                    }
                 });
            }
            
            if (withCapital && !brokenTop) {
                 const capitalStartY = finalBaseH + finalShaftH;
                 const offsetX = Math.floor((mainColWidth / 2) - baseRadius);
                 const offsetZ = Math.floor((depth / 2) - baseRadius);

                 if (capitalStyle === 'ionic') {
                    const capitalVoxels = generateIonicCapital(finalCapitalH, colRadius, baseRadius); 
                    capitalVoxels.forEach(v => addVoxel(v.x + offsetX, v.y + capitalStartY, v.z + offsetZ));
                 } else {
                    const capitalVoxels = generateCylinder(baseRadius, finalCapitalH, capitalStyle);
                    capitalVoxels.forEach(v => addVoxel(v.x + offsetX, v.y + capitalStartY, v.z + offsetZ));
                 }
            }

            // Debris Part
             if (brokenTop && withDebris && debrisLength > 0) {
                let debrisCapitalH = (withCapital) ? capitalHeight : 0;
                let debrisShaftH = debrisLength - debrisCapitalH;
                if (debrisShaftH < 0) {
                    debrisCapitalH = debrisLength;
                    debrisShaftH = 0;
                }
                
                const debrisVoxels: {x: number, y: number, z: number}[] = [];
                
                 if (debrisShaftH > 0) {
                    const shaftVoxels = generateCylinder(colRadius, finalShaftH, 'simple');
                    shaftVoxels.forEach(v => {
                        const xFromCenter = v.x - colRadius + 0.5;
                        const zFromCenter = v.z - colRadius + 0.5;
                        const breakPlaneY = (finalShaftH - 1) - (xFromCenter * tanX + zFromCenter * tanZ);
                        // We want the part of the shaft that is *above* the break plane
                        if (v.y >= breakPlaneY) {
                           const newY = v.y - breakPlaneY;
                           debrisVoxels.push({x: v.x, y: newY, z: v.z });
                        }
                    });
                }

                if (withCapital && debrisCapitalH > 0) {
                    const capitalVoxels = (capitalStyle === 'ionic') 
                        ? generateIonicCapital(debrisCapitalH, colRadius, baseRadius)
                        : generateCylinder(baseRadius, debrisCapitalH, capitalStyle);
                    
                    capitalVoxels.forEach(v => {
                        debrisVoxels.push({x: v.x, y: v.y + debrisShaftH, z: v.z});
                    });
                }
                
                // Rotate and place debris
                debrisVoxels.forEach(v => {
                    const rotatedX = v.y; // Laying on its side
                    const rotatedY = v.x;
                    const rotatedZ = v.z;
                    
                    addVoxel(
                        rotatedX + debrisOffsetX,
                        rotatedY,
                        rotatedZ + Math.floor((depth - colRadius * 2) / 2)
                    );
                });
            }
            break;
        }
        
        case 'cone':
            width = depth = shape.radius * 2;
            height = shape.height;
            const coneCenter = (width - 1) / 2.0;
            for (let y = 0; y < height; y++) {
                const ratio = (height > 1) ? (height - 1 - y) / (height - 1) : 0;
                const currentRadius = shape.radius * ratio;
                for (let z = 0; z < depth; z++) {
                    for (let x = 0; x < width; x++) {
                        const dx = x - coneCenter;
                        const dz = z - coneCenter;
                        if (dx * dx + dz * dz <= currentRadius * currentRadius) {
                            addVoxel(x, y, z);
                        }
                    }
                }
            }
            break;
        
        case 'arch': {
             depth = shape.depth;
             if (shape.archType === 'circular') {
                width = shape.width;
                const outerRadius = width / 2;
                height = Math.floor(outerRadius);
                const innerRadius = outerRadius - shape.thickness;
                const centerX = (width - 1) / 2.0;
                
                for (let z = 0; z < depth; z++) {
                    for (let y = 0; y < height; y++) {
                        for (let x = 0; x < width; x++) {
                             const dx = x - centerX;
                             const dy = shape.orientation === 'top' ? y - (height -1) : -y;
                             const distSq = dx * dx + dy * dy;

                             if (distSq <= outerRadius * outerRadius && distSq > innerRadius * innerRadius) {
                                addVoxel(x, y, z);
                             }
                        }
                    }
                }
            } else { // Rectangular or Rounded
                width = shape.width;
                height = shape.height;
                const innerOpeningRadius = shape.width / 2.0;
                const centerX = (shape.width - 1) / 2.0;

                for (let y = 0; y < height; y++) {
                    for (let z = 0; z < depth; z++) {
                        for (let x = 0; x < width; x++) {
                            let shouldPlace = true;

                            // Carve out the inner arch
                            if (y >= height - innerOpeningRadius) {
                                // This part is above the start of the arch curve
                                const innerDx = x - centerX;
                                const innerDy = y - (height - innerOpeningRadius);
                                if (innerDx * innerDx + innerDy * innerDy < innerOpeningRadius * innerOpeningRadius) {
                                    shouldPlace = false;
                                }
                            }
                            
                            const outerCornerRadius = shape.outerCornerRadius ?? 0;
                            if (shouldPlace && shape.archType === 'rounded' && outerCornerRadius > 0) {
                               // Check top-left corner
                                if (x < outerCornerRadius && y >= height - outerCornerRadius) {
                                    const cornerDx = x - outerCornerRadius;
                                    const cornerDy = y - (height - outerCornerRadius);
                                    if (cornerDx * cornerDx + cornerDy * cornerDy >= (outerCornerRadius) * (outerCornerRadius)) {
                                         shouldPlace = false;
                                    }
                                }
                                // Check top-right corner
                                if (x >= width - outerCornerRadius && y >= height - outerCornerRadius) {
                                    const cornerDx = x - (width - outerCornerRadius);
                                    const cornerDy = y - (height - outerCornerRadius);
                                     if (cornerDx * cornerDx + cornerDy * cornerDy >= (outerCornerRadius) * (outerCornerRadius)) {
                                         shouldPlace = false;
                                    }
                                }
                            }

                            if (shouldPlace) {
                                addVoxel(x, y, z);
                            }
                        }
                    }
                }
            }
            break;
        }

        case 'disk': {
            const { radius, height: diskHeight, part: diskPart = 'full', orientation: diskOrientation = 'horizontal' } = shape;
            
            if (diskOrientation === 'vertical') {
                width = diskHeight;
                height = radius * 2;
                depth = radius * 2;
            } else { // horizontal
                width = radius * 2;
                height = diskHeight;
                depth = radius * 2;
            }
            
            const centerX = (width -1) / 2.0;
            const centerY = (height -1) / 2.0;
            const centerZ = (depth -1) / 2.0;

            for (let y = 0; y < height; y++) {
              for (let z = 0; z < depth; z++) {
                  for (let x = 0; x < width; x++) {
                      let withinRadius: boolean;
                      
                      if (diskOrientation === 'vertical') {
                          const dy = y - centerY;
                          const dz = z - centerZ;
                          withinRadius = dy * dy + dz * dz <= radius * radius;
                      } else {
                          const dx = x - centerX;
                          const dz = z - centerZ;
                          withinRadius = dx * dx + dz * dz <= radius * radius;
                      }

                      if (withinRadius) {
                           if (diskPart === 'full') {
                              addVoxel(x, y, z);
                          } else if (diskPart === 'half') {
                              if (diskOrientation === 'horizontal' && z < centerZ) {
                                  addVoxel(x, y, z);
                              } else if (diskOrientation === 'vertical' && y < centerY) {
                                  addVoxel(x, y, z);
                              }
                          }
                      }
                  }
              }
            }
            break;
        }
        case 'ring': {
            const { radius: outerR, thickness, height: ringHeight, part: ringPart = 'full', orientation: ringOrientation = 'horizontal' } = shape;
            const innerR = outerR - thickness;

            if (ringOrientation === 'vertical') {
                width = ringHeight;
                height = outerR * 2;
                depth = outerR * 2;
            } else { // horizontal
                width = outerR * 2;
                height = ringHeight;
                depth = outerR * 2;
            }

            const centerX = (width -1) / 2.0;
            const centerY = (height -1) / 2.0;
            const centerZ = (depth -1) / 2.0;
            
            for (let y = 0; y < height; y++) {
              for (let z = 0; z < depth; z++) {
                  for (let x = 0; x < width; x++) {
                      let distSq: number;
                      
                      if (ringOrientation === 'vertical') {
                          const dy = y - centerY;
                          const dz = z - centerZ;
                          distSq = dy * dy + dz * dz;
                      } else {
                          const dx = x - centerX;
                          const dz = z - centerZ;
                          distSq = dx * dx + dz * dz;
                      }

                      if (distSq <= outerR * outerR && distSq > innerR * innerR) {
                           if (ringPart === 'full') {
                              addVoxel(x, y, z);
                          } else if (ringPart === 'half') {
                              if (ringOrientation === 'horizontal' && z < centerZ) {
                                  addVoxel(x, y, z);
                              } else if (ringOrientation === 'vertical' && y < centerY) {
                                  addVoxel(x, y, z);
                              }
                          }
                      }
                  }
              }
            }
            break;
        }
        
        case 'qrcode': {
            const { pixels, size, withBackdrop, backdropDepth } = shape;
            const qrDepth = shape.depth ?? 1;
            width = size;
            height = size;
            depth = withBackdrop ? 32 : 16;
            
            // Block 1: QR Sticker (z: 0 to 15)
            const qrZOffset = 16 - qrDepth;
            for (let py = 0; py < height; py++) {
               for (let px = 0; px < width; px++) {
                   if (pixels[py * width + px]) {
                       for (let pz = 0; pz < qrDepth; pz++) {
                           addVoxel(px, height - 1 - py, qrZOffset + pz, 1);
                       }
                    }
               }
            }
            
            // Block 2: Mounting Plate (z: 16 to 31)
            if (withBackdrop && backdropDepth && backdropDepth > 0) {
                addVoxel(0, 0, 31, 3); // Anchor for the plate block in the far corner
                const backdropZStart = 16;
                for (let py = 0; py < height; py++) {
                    for (let px = 0; px < width; px++) {
                         for (let pz = 0; pz < backdropDepth; pz++) {
                            addVoxel(px, height - 1 - py, backdropZStart + pz, 1);
                        }
                    }
                }
            }
            break;
        }

        case 'checkerboard': {
            const { width: blockWidth, length: blockLength, height: blockHeight } = shape;
            const VOXEL_SIZE = 16;
            width = blockWidth * VOXEL_SIZE;
            height = blockHeight * VOXEL_SIZE;
            depth = blockLength * VOXEL_SIZE;

            for (let by = 0; by < blockHeight; by++) {
                for (let bz = 0; bz < blockLength; bz++) {
                    for (let bx = 0; bx < blockWidth; bx++) {
                        if ((bx + by + bz) % 2 === 0) {
                            const startX = bx * VOXEL_SIZE;
                            const startY = by * VOXEL_SIZE;
                            const startZ = bz * VOXEL_SIZE;
                            for (let y = startY; y < startY + VOXEL_SIZE; y++) {
                                for (let z = startZ; z < startZ + VOXEL_SIZE; z++) {
                                    for (let x = startX; x < startX + VOXEL_SIZE; x++) {
                                        addVoxel(x, y, z);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            break;
        }
    }
    
    totalVoxels = xyziValues.length > 1 ? xyziValues.length -1 : 0;
    
    const palette: PaletteColor[] = Array.from({length: 256}, () => ({r:0,g:0,b:0,a:0}));
    palette[0] = { r: 0, g: 0, b: 0, a: 0 }; // MagicaVoxel palette is 1-indexed, so 0 is empty
    palette[1] = { r: 220, g: 220, b: 220, a: 255 }; 
    palette[2] = { r: 10, g: 10, b: 10, a: 255 };
    palette[3] = { r: 100, g: 100, b: 100, a: 255 };
    
    const voxSize = { x: width, y: depth, z: height };
    
    const voxObject = {
        size: voxSize,
        xyzi: {
            values: xyziValues.map(v => ({ x: v.x, y: v.z, z: v.y, i: v.i }))
        },
        rgba: {
            values: palette
        }
    };
    
    const buffer = writeVox(voxObject);

    return {
        schematicData: createSchematicData(name, {width, height, depth}),
        width,
        height,
        depth,
        pixels: [], // No 2D pixel preview for voxels
        isVox: true,
        voxData: buffer,
        voxSize: voxSize,
        totalVoxels,
    };
}

function grayscale(r: number, g: number, b: number): number {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}


    







