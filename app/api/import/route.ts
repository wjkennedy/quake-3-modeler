import { NextRequest, NextResponse } from 'next/server';
import { deflateSync, inflateRawSync } from 'node:zlib';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const buffer = await file.arrayBuffer();

    // JSON files - parse directly
    if (fileName.endsWith('.json')) {
      const text = new TextDecoder().decode(buffer);
      const model = JSON.parse(text);
      return NextResponse.json(model);
    }

    if (fileName.endsWith('.pk3')) {
      const model = parsePK3(buffer, file.name);
      return NextResponse.json(model);
    }

    // MD3 format - parse binary and convert to model JSON
    if (fileName.endsWith('.md3')) {
      const model = parseMD3(buffer);
      return NextResponse.json(model);
    }

    // MD5 format - parse text and convert to model JSON
    if (fileName.endsWith('.md5')) {
      const text = new TextDecoder().decode(buffer);
      const model = parseMD5(text);
      return NextResponse.json(model);
    }

    // glTF format - parse and convert to model JSON
    if (fileName.endsWith('.gltf') || fileName.endsWith('.glb')) {
      const model = parseGLTF(buffer);
      return NextResponse.json(model);
    }

    return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
  } catch (error) {
    console.error('[v0] Import error:', error);
    return NextResponse.json(
      { error: 'Failed to import model: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

interface EmbeddedTexture {
  name: string;
  url: string;
  type: string;
  sourceName?: string;
  sourceUrl?: string;
}

interface Transform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

function parsePK3(buffer: ArrayBuffer, fileName: string): any {
  const entries = readZipEntries(buffer);
  const md3Entries = entries
    .filter(entry => entry.name.toLowerCase().endsWith('.md3'))
    .sort((a, b) => getMD3PartPriority(a.name) - getMD3PartPriority(b.name) || a.name.localeCompare(b.name));

  if (md3Entries.length === 0) {
    throw new Error('PK3 does not contain any MD3 files');
  }

  const partModels = md3Entries.map(entry => ({
    path: entry.name,
    model: parseMD3(toArrayBuffer(entry.data)),
  }));
  const embeddedTextures = buildEmbeddedTextures(entries);
  const skinMaps = buildSkinMaps(entries);
  const botFiles = buildTextFileMap(entries, /\.bot$/i);
  const meshes: any[] = [];
  const tags: any[] = [];
  const worldTagMap = new Map<string, any>();
  let frameCount = 0;

  partModels.forEach(({ path, model }, partIndex) => {
    const partName = getMD3PartName(path, partIndex);
    const textureDirectory = path.split('/').slice(0, -1).join('/');
    const transform = getPartTransform(partName, worldTagMap);
    const partTags = (model.tags || []).map((tag: any, tagIndex: number) => ({
      ...transformTag(tag, transform),
      id: `${partName}_${tag.id || `tag_${tagIndex}`}`,
      name: `${partName}/${tag.name || `Tag ${tagIndex}`}`,
      localName: tag.name,
      partName,
    }));

    partTags.forEach((tag: any) => {
      worldTagMap.set(normalizeTagName(tag.localName || tag.name), tag);
    });

    model.meshes.forEach((mesh: any, meshIndex: number) => {
      const material = mesh.material || {};
      const skinTexturePath = findSkinTexturePath(skinMaps, partName, mesh.name);
      const texturePath = findTexturePath(skinTexturePath || material.texturePath || material.name, textureDirectory, embeddedTextures);
      const materialId = `${partName}_${material.id || `mat_${meshIndex}`}`;

      meshes.push({
        ...mesh,
        id: `${partName}_${mesh.id || `mesh_${meshIndex}`}`,
        name: `${partName}/${mesh.name || `Mesh ${meshIndex}`}`,
        vertices: Array.isArray(mesh.vertices)
          ? mesh.vertices.map((vertex: any) => transformVertex(vertex, transform))
          : [],
        faces: Array.isArray(mesh.faces)
          ? mesh.faces.map((face: any) => ({ ...face, materialId }))
          : [],
        material: {
          ...material,
          id: materialId,
          texturePath: texturePath || material.texturePath || material.name,
        },
      });
    });

    tags.push(...partTags);

    const match = typeof model.description === 'string' ? model.description.match(/\((\d+) frames?\)/) : null;
    frameCount += match ? Number(match[1]) : 0;
  });

  return {
    id: 'imported_pk3_' + Date.now(),
    name: fileName.replace(/\.pk3$/i, ''),
    version: '1.0',
    description: `Model imported from PK3 (${partModels.length} MD3 file${partModels.length === 1 ? '' : 's'}${frameCount ? `, ${frameCount} total frame${frameCount === 1 ? '' : 's'}` : ''})`,
    metadata: {
      source: fileName,
      md3Files: md3Entries.map(entry => entry.name),
      botFiles,
      textureCount: Object.keys(embeddedTextures).length,
    },
    meshes,
    bones: [
      {
        id: 'bone_root',
        name: 'Root',
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    ],
    animations: [],
    tags,
    lodConfigs: [],
    embeddedTextures,
    scale: 1,
  };
}

function readZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const eocdOffset = findEndOfCentralDirectory(view);

  if (eocdOffset < 0) {
    throw new Error('Invalid PK3/ZIP archive: end of central directory not found');
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (!rangeInBounds(offset, 46, buffer.byteLength) || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Invalid PK3/ZIP archive: corrupt central directory');
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = readUtf8(view, offset + 46, nameLength);

    if (name && !name.endsWith('/')) {
      entries.push({
        name: normalizeArchivePath(name),
        data: readZipEntryData(view, localHeaderOffset, compressedSize, uncompressedSize, compressionMethod),
      });
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - 0xffff - 22);

  for (let offset = view.byteLength - 22; offset >= minOffset; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  return -1;
}

function readZipEntryData(
  view: DataView,
  localHeaderOffset: number,
  compressedSize: number,
  uncompressedSize: number,
  compressionMethod: number
): Uint8Array {
  if (!rangeInBounds(localHeaderOffset, 30, view.byteLength) || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
    throw new Error('Invalid PK3/ZIP archive: corrupt local file header');
  }

  const nameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  const dataOffset = localHeaderOffset + 30 + nameLength + extraLength;

  if (!rangeInBounds(dataOffset, compressedSize, view.byteLength)) {
    throw new Error('Invalid PK3/ZIP archive: file data points outside archive');
  }

  const compressed = new Uint8Array(view.buffer, view.byteOffset + dataOffset, compressedSize);

  if (compressionMethod === 0) {
    return new Uint8Array(compressed);
  }

  if (compressionMethod === 8) {
    const inflated = inflateRawSync(compressed);
    if (inflated.byteLength !== uncompressedSize) {
      throw new Error('Invalid PK3/ZIP archive: decompressed file size mismatch');
    }
    return new Uint8Array(inflated);
  }

  throw new Error(`Unsupported PK3 compression method: ${compressionMethod}`);
}

function buildEmbeddedTextures(entries: ZipEntry[]): Record<string, EmbeddedTexture> {
  const textures: Record<string, EmbeddedTexture> = {};

  entries
    .filter(entry => isTexturePath(entry.name))
    .forEach(entry => {
      const converted = convertTextureForBrowser(entry.name, entry.data);
      const texture = {
        name: converted.name,
        sourceName: entry.name,
        url: `data:${converted.type};base64,${Buffer.from(converted.data).toString('base64')}`,
        sourceUrl: `data:${getTextureMimeType(entry.name)};base64,${Buffer.from(entry.data).toString('base64')}`,
        type: converted.type,
      };

      getTextureKeys(entry.name, { includeBasename: true }).forEach(key => {
        textures[key] = texture;
      });
      getTextureKeys(converted.name, { includeBasename: true }).forEach(key => {
        textures[key] = texture;
      });
    });

  return textures;
}

function buildTextFileMap(entries: ZipEntry[], pattern: RegExp): Record<string, string> {
  const textDecoder = new TextDecoder();
  const files: Record<string, string> = {};

  entries
    .filter(entry => pattern.test(entry.name))
    .forEach(entry => {
      files[entry.name] = textDecoder.decode(entry.data);
    });

  return files;
}

function buildSkinMaps(entries: ZipEntry[]): Record<string, Record<string, string>> {
  const skinMaps: Record<string, Record<string, string>> = {};
  const textDecoder = new TextDecoder();

  entries
    .filter(entry => entry.name.toLowerCase().endsWith('.skin'))
    .sort((a, b) => getSkinPriority(a.name) - getSkinPriority(b.name) || a.name.localeCompare(b.name))
    .forEach(entry => {
      const key = getSkinMapKey(entry.name);
      skinMaps[key] = {
        ...(skinMaps[key] || {}),
        ...parseSkinFile(textDecoder.decode(entry.data)),
      };
    });

  return skinMaps;
}

function getSkinPriority(path: string): number {
  const fileName = path.split('/').pop()?.toLowerCase() || '';
  if (fileName.includes('default')) return 2;
  if (!fileName.includes('_')) return 1;
  return 0;
}

function parseSkinFile(text: string): Record<string, string> {
  const mappings: Record<string, string> = {};

  text.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;

    const [surface, texturePath] = trimmed.split(',').map(value => value?.trim());
    if (surface && texturePath) {
      mappings[surface.toLowerCase()] = texturePath;
    }
  });

  return mappings;
}

function getSkinMapKey(path: string): string {
  const fileName = path.split('/').pop()?.replace(/\.skin$/i, '').toLowerCase() || 'default';
  if (fileName.includes('lower')) return 'lower';
  if (fileName.includes('torso') || fileName.includes('upper')) return 'torso';
  if (fileName.includes('head')) return 'head';
  return 'default';
}

function findSkinTexturePath(skinMaps: Record<string, Record<string, string>>, partName: string, surfaceName: string): string | undefined {
  const keys = [partName, getSkinMapKey(partName), 'default'];
  const surfaceKeys = getSurfaceSkinKeys(surfaceName);

  for (const key of keys) {
    for (const surfaceKey of surfaceKeys) {
      const texturePath = skinMaps[key]?.[surfaceKey];
      if (texturePath) return texturePath;
    }
  }

  return undefined;
}

function getSurfaceSkinKeys(surfaceName: string): string[] {
  const normalized = surfaceName.toLowerCase();
  const lastSegment = normalized.split('/').pop() || normalized;
  return Array.from(new Set([normalized, lastSegment]));
}

function getPartTransform(partName: string, worldTagMap: Map<string, any>): Transform {
  const normalizedPart = partName.toLowerCase();

  if (normalizedPart.includes('head')) {
    const headTag = worldTagMap.get('tag_head');
    if (headTag) return tagToTransform(headTag);
  }

  if (normalizedPart.includes('torso') || normalizedPart.includes('upper')) {
    const torsoTag = worldTagMap.get('tag_torso');
    if (torsoTag) return tagToTransform(torsoTag);
  }

  return identityTransform();
}

function identityTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };
}

function tagToTransform(tag: any): Transform {
  return {
    position: tag.position || { x: 0, y: 0, z: 0 },
    rotation: tag.rotation || { x: 0, y: 0, z: 0, w: 1 },
  };
}

function transformVertex(vertex: any, transform: Transform): any {
  return {
    ...vertex,
    position: transformPoint(vertex.position, transform),
    normal: rotateVec(vertex.normal || { x: 0, y: 0, z: 1 }, transform.rotation),
  };
}

function transformTag(tag: any, transform: Transform): any {
  return {
    ...tag,
    position: transformPoint(tag.position || { x: 0, y: 0, z: 0 }, transform),
    rotation: normalizeQuat(quatMultiply(transform.rotation, tag.rotation || { x: 0, y: 0, z: 0, w: 1 })),
  };
}

function transformPoint(point: { x: number; y: number; z: number }, transform: Transform): { x: number; y: number; z: number } {
  const rotated = rotateVec(point, transform.rotation);
  return {
    x: rotated.x + transform.position.x,
    y: rotated.y + transform.position.y,
    z: rotated.z + transform.position.z,
  };
}

function rotateVec(vector: { x: number; y: number; z: number }, quat: { x: number; y: number; z: number; w: number }): { x: number; y: number; z: number } {
  const q = normalizeQuat(quat);
  const x = vector.x;
  const y = vector.y;
  const z = vector.z;
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

function quatMultiply(
  a: { x: number; y: number; z: number; w: number },
  b: { x: number; y: number; z: number; w: number }
): { x: number; y: number; z: number; w: number } {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function normalizeQuat(quat: { x: number; y: number; z: number; w: number }): { x: number; y: number; z: number; w: number } {
  const length = Math.hypot(quat.x, quat.y, quat.z, quat.w);
  if (!length) return { x: 0, y: 0, z: 0, w: 1 };

  return {
    x: quat.x / length,
    y: quat.y / length,
    z: quat.z / length,
    w: quat.w / length,
  };
}

function normalizeTagName(name: string): string {
  return name.split('/').pop()?.toLowerCase() || name.toLowerCase();
}

function findTexturePath(texturePath: string | undefined, fallbackDirectory: string, textures: Record<string, EmbeddedTexture>): string | undefined {
  const candidates = getTextureCandidates(texturePath || '', fallbackDirectory);

  const match = candidates.find(key => textures[key]);
  return match ? (textures[match].sourceName || textures[match].name) : texturePath;
}

function getMD3PartPriority(path: string): number {
  const name = path.toLowerCase();
  if (name.includes('lower')) return 0;
  if (name.includes('torso') || name.includes('upper')) return 1;
  if (name.includes('head')) return 2;
  return 3;
}

function getMD3PartName(path: string, index: number): string {
  const fileName = path.split('/').pop()?.replace(/\.md3$/i, '') || `part_${index}`;
  return fileName.replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
}

function isTexturePath(path: string): boolean {
  return /\.(jpe?g|png|tga|webp)$/i.test(path);
}

function getTextureMimeType(path: string): string {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('.png')) return 'image/png';
  if (lowerPath.endsWith('.tga')) return 'image/x-tga';
  if (lowerPath.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function getTextureCandidates(value: string, fallbackDirectory: string): string[] {
  if (!value) return [];

  const normalized = normalizeArchivePath(value);
  const hasDirectory = normalized.includes('/');
  const candidates: string[] = [];

  candidates.push(...getTextureKeys(normalized, { includeBasename: !hasDirectory }));

  if (!/\.[^/.]+$/.test(normalized)) {
    ['.png', '.jpg', '.jpeg', '.tga', '.webp'].forEach(extension => {
      candidates.push(`${normalized}${extension}`);
    });
  }

  if (fallbackDirectory && !hasDirectory) {
    const scoped = `${fallbackDirectory}/${normalized}`;
    candidates.push(...getTextureKeys(scoped, { includeBasename: false }));

    if (!/\.[^/.]+$/.test(scoped)) {
      ['.png', '.jpg', '.jpeg', '.tga', '.webp'].forEach(extension => {
        candidates.push(`${scoped}${extension}`);
      });
    }
  }

  candidates.push(...getTextureKeys(normalized, { includeBasename: true }));
  return Array.from(new Set(candidates));
}

function getTextureKeys(value: string, options: { includeBasename: boolean }): string[] {
  if (!value) return [];

  const normalized = normalizeArchivePath(value);
  const withoutExtension = normalized.replace(/\.[^/.]+$/, '');
  const fileName = normalized.split('/').pop() || normalized;
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const keys = [normalized, withoutExtension];

  if (options.includeBasename) {
    keys.push(fileName, baseName);
  }

  return Array.from(new Set(keys.filter(Boolean)));
}

function normalizeArchivePath(value: string): string {
  return value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
}

function readUtf8(view: DataView, offset: number, length: number): string {
  if (!rangeInBounds(offset, length, view.byteLength)) return '';
  return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + offset, length));
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer as ArrayBuffer;
}

function convertTextureForBrowser(name: string, data: Uint8Array): { name: string; data: Uint8Array; type: string } {
  if (!name.toLowerCase().endsWith('.tga')) {
    return { name, data, type: getTextureMimeType(name) };
  }

  const tga = decodeTGA(data);
  return {
    name: name.replace(/\.tga$/i, '.png'),
    data: encodePNG(tga.width, tga.height, tga.rgba),
    type: 'image/png',
  };
}

function decodeTGA(data: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  if (data.byteLength < 18) {
    throw new Error('Invalid TGA texture: header is too short');
  }

  const idLength = data[0];
  const colorMapType = data[1];
  const imageType = data[2];
  const width = data[12] | (data[13] << 8);
  const height = data[14] | (data[15] << 8);
  const bitsPerPixel = data[16];
  const descriptor = data[17];

  if (colorMapType !== 0) {
    throw new Error('Unsupported TGA texture: color-mapped images are not supported');
  }
  if (![2, 3, 10, 11].includes(imageType)) {
    throw new Error(`Unsupported TGA texture type: ${imageType}`);
  }
  if (![8, 24, 32].includes(bitsPerPixel)) {
    throw new Error(`Unsupported TGA bit depth: ${bitsPerPixel}`);
  }
  if (width <= 0 || height <= 0) {
    throw new Error('Invalid TGA texture dimensions');
  }

  const bytesPerPixel = bitsPerPixel / 8;
  const pixelCount = width * height;
  const source = data.subarray(18 + idLength);
  const pixels = imageType === 10 || imageType === 11
    ? decodeTGARle(source, pixelCount, bytesPerPixel)
    : source.subarray(0, pixelCount * bytesPerPixel);
  const rgba = new Uint8Array(pixelCount * 4);
  const originTop = (descriptor & 0x20) !== 0;
  const originRight = (descriptor & 0x10) !== 0;

  for (let sourceIndex = 0; sourceIndex < pixelCount; sourceIndex++) {
    const sourceOffset = sourceIndex * bytesPerPixel;
    const x = originRight ? width - 1 - (sourceIndex % width) : sourceIndex % width;
    const y = originTop ? Math.floor(sourceIndex / width) : height - 1 - Math.floor(sourceIndex / width);
    const targetOffset = (y * width + x) * 4;

    if (bitsPerPixel === 8) {
      const value = pixels[sourceOffset];
      rgba[targetOffset] = value;
      rgba[targetOffset + 1] = value;
      rgba[targetOffset + 2] = value;
      rgba[targetOffset + 3] = 255;
    } else {
      rgba[targetOffset] = pixels[sourceOffset + 2];
      rgba[targetOffset + 1] = pixels[sourceOffset + 1];
      rgba[targetOffset + 2] = pixels[sourceOffset];
      rgba[targetOffset + 3] = bitsPerPixel === 32 ? pixels[sourceOffset + 3] : 255;
    }
  }

  return { width, height, rgba };
}

function decodeTGARle(source: Uint8Array, pixelCount: number, bytesPerPixel: number): Uint8Array {
  const output = new Uint8Array(pixelCount * bytesPerPixel);
  let sourceOffset = 0;
  let targetOffset = 0;

  while (targetOffset < output.byteLength && sourceOffset < source.byteLength) {
    const header = source[sourceOffset++];
    const count = (header & 0x7f) + 1;

    if (header & 0x80) {
      const pixel = source.subarray(sourceOffset, sourceOffset + bytesPerPixel);
      sourceOffset += bytesPerPixel;

      for (let i = 0; i < count; i++) {
        output.set(pixel, targetOffset);
        targetOffset += bytesPerPixel;
      }
    } else {
      const byteCount = count * bytesPerPixel;
      output.set(source.subarray(sourceOffset, sourceOffset + byteCount), targetOffset);
      sourceOffset += byteCount;
      targetOffset += byteCount;
    }
  }

  return output;
}

function encodePNG(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const scanlineLength = width * 4 + 1;
  const scanlines = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * scanlineLength;
    scanlines[scanlineOffset] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(scanlines, scanlineOffset + 1);
  }

  const chunks = [
    makePngChunk('IHDR', makePngHeader(width, height)),
    makePngChunk('IDAT', deflateSync(scanlines)),
    makePngChunk('IEND', Buffer.alloc(0)),
  ];

  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function makePngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return header;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.byteLength);
  return chunk;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function parseMD3(buffer: ArrayBuffer): any {
  const view = new DataView(buffer);
  const byteLength = buffer.byteLength;

  if (byteLength < 108 || readAscii(view, 0, 4) !== 'IDP3') {
    throw new Error('Invalid MD3 file signature');
  }

  const version = view.getInt32(4, true);
  if (version !== 15) {
    throw new Error(`Unsupported MD3 version: ${version}`);
  }

  const name = readCString(view, 8, 64) || 'Imported MD3 Model';
  const numFrames = view.getInt32(76, true);
  const numTags = view.getInt32(80, true);
  const numSurfaces = view.getInt32(84, true);
  const framesOffset = view.getInt32(92, true);
  const tagsOffset = view.getInt32(96, true);
  const surfacesOffset = view.getInt32(100, true);
  const endOffset = view.getInt32(104, true);

  if (numFrames < 1) {
    throw new Error('MD3 file does not contain any frames');
  }
  if (
    numTags < 0 ||
    numSurfaces < 0 ||
    !rangeInBounds(framesOffset, numFrames * 56, byteLength) ||
    !rangeInBounds(surfacesOffset, 0, byteLength) ||
    endOffset > byteLength
  ) {
    throw new Error('MD3 header contains invalid offsets');
  }

  const meshes: any[] = [];
  let surfaceOffset = surfacesOffset;

  for (let surfaceIndex = 0; surfaceIndex < numSurfaces; surfaceIndex++) {
    if (!rangeInBounds(surfaceOffset, 108, byteLength) || readAscii(view, surfaceOffset, 4) !== 'IDP3') {
      throw new Error(`Invalid MD3 surface header at index ${surfaceIndex}`);
    }

    const surfaceName = readCString(view, surfaceOffset + 4, 64) || `Surface ${surfaceIndex}`;
    const surfaceFrameCount = view.getInt32(surfaceOffset + 72, true);
    const shaderCount = view.getInt32(surfaceOffset + 76, true);
    const vertexCount = view.getInt32(surfaceOffset + 80, true);
    const triangleCount = view.getInt32(surfaceOffset + 84, true);
    const trianglesOffset = surfaceOffset + view.getInt32(surfaceOffset + 88, true);
    const shadersOffset = surfaceOffset + view.getInt32(surfaceOffset + 92, true);
    const texCoordsOffset = surfaceOffset + view.getInt32(surfaceOffset + 96, true);
    const verticesOffset = surfaceOffset + view.getInt32(surfaceOffset + 100, true);
    const nextSurfaceOffset = surfaceOffset + view.getInt32(surfaceOffset + 104, true);

    if (surfaceFrameCount < 1 || vertexCount < 0 || triangleCount < 0 || nextSurfaceOffset <= surfaceOffset) {
      throw new Error(`MD3 surface "${surfaceName}" has invalid counts or offsets`);
    }
    if (
      !rangeInBounds(trianglesOffset, triangleCount * 12, byteLength) ||
      !rangeInBounds(texCoordsOffset, vertexCount * 8, byteLength) ||
      !rangeInBounds(verticesOffset, vertexCount * 8, byteLength) ||
      !rangeInBounds(nextSurfaceOffset, 0, byteLength)
    ) {
      throw new Error(`MD3 surface "${surfaceName}" points outside the file`);
    }

    const materialName =
      shaderCount > 0 && rangeInBounds(shadersOffset, 68, byteLength)
        ? readCString(view, shadersOffset, 64) || `Material ${surfaceIndex}`
        : `Material ${surfaceIndex}`;

    const vertices = Array.from({ length: vertexCount }, (_, vertexIndex) => {
      const texCoordOffset = texCoordsOffset + vertexIndex * 8;
      const vertexOffset = verticesOffset + vertexIndex * 8;
      const normal = decodeMD3Normal(view.getUint16(vertexOffset + 6, true));

      return {
        position: {
          x: view.getInt16(vertexOffset, true) / 64,
          y: view.getInt16(vertexOffset + 2, true) / 64,
          z: view.getInt16(vertexOffset + 4, true) / 64,
        },
        normal,
        uv: {
          u: view.getFloat32(texCoordOffset, true),
          v: view.getFloat32(texCoordOffset + 4, true),
        },
        boneWeights: [],
      };
    });

    const faces = Array.from({ length: triangleCount }, (_, triangleIndex) => {
      const triangleOffset = trianglesOffset + triangleIndex * 12;
      return {
        indices: [
          view.getInt32(triangleOffset, true),
          view.getInt32(triangleOffset + 4, true),
          view.getInt32(triangleOffset + 8, true),
        ],
        materialId: `mat_${surfaceIndex}`,
      };
    }).filter(face => face.indices.every(index => index >= 0 && index < vertexCount));

    meshes.push({
      id: `mesh_${surfaceIndex}`,
      name: surfaceName,
      vertices,
      faces,
      material: {
        id: `mat_${surfaceIndex}`,
        name: materialName,
        texturePath: materialName,
        diffuse: [0.8, 0.8, 0.8],
        shininess: 32,
      },
    });

    surfaceOffset = nextSurfaceOffset;
  }

  const tags = parseMD3Tags(view, tagsOffset, numTags, byteLength);

  return {
    id: 'imported_md3_' + Date.now(),
    name,
    version: '1.0',
    description: `Model imported from MD3 file (${numFrames} frame${numFrames === 1 ? '' : 's'})`,
    meshes,
    bones: [
      {
        id: 'bone_root',
        name: 'Root',
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    ],
    animations: [],
    tags,
    lodConfigs: [],
    scale: 1,
  };
}

function readAscii(view: DataView, offset: number, length: number): string {
  if (!rangeInBounds(offset, length, view.byteLength)) return '';

  let value = '';
  for (let i = 0; i < length; i++) {
    value += String.fromCharCode(view.getUint8(offset + i));
  }
  return value;
}

function readCString(view: DataView, offset: number, length: number): string {
  if (!rangeInBounds(offset, length, view.byteLength)) return '';

  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    const byte = view.getUint8(offset + i);
    if (byte === 0) break;
    chars.push(String.fromCharCode(byte));
  }
  return chars.join('').trim();
}

function rangeInBounds(offset: number, length: number, byteLength: number): boolean {
  return Number.isInteger(offset) && Number.isInteger(length) && offset >= 0 && length >= 0 && offset + length <= byteLength;
}

function decodeMD3Normal(encoded: number): { x: number; y: number; z: number } {
  const lat = ((encoded >> 8) & 0xff) * (2 * Math.PI / 255);
  const lng = (encoded & 0xff) * (2 * Math.PI / 255);

  return {
    x: Math.cos(lng) * Math.sin(lat),
    y: Math.sin(lng) * Math.sin(lat),
    z: Math.cos(lat),
  };
}

function parseMD3Tags(view: DataView, tagsOffset: number, numTags: number, byteLength: number): any[] {
  const tags: any[] = [];
  const firstFrameTagBytes = numTags * 112;

  if (numTags <= 0 || !rangeInBounds(tagsOffset, firstFrameTagBytes, byteLength)) {
    return tags;
  }

  for (let tagIndex = 0; tagIndex < numTags; tagIndex++) {
    const offset = tagsOffset + tagIndex * 112;
    const basis = new THREECompatibleMatrix3(
      view.getFloat32(offset + 76, true),
      view.getFloat32(offset + 80, true),
      view.getFloat32(offset + 84, true),
      view.getFloat32(offset + 88, true),
      view.getFloat32(offset + 92, true),
      view.getFloat32(offset + 96, true),
      view.getFloat32(offset + 100, true),
      view.getFloat32(offset + 104, true),
      view.getFloat32(offset + 108, true)
    );

    tags.push({
      id: `tag_${tagIndex}`,
      name: readCString(view, offset, 64) || `Tag ${tagIndex}`,
      position: {
        x: view.getFloat32(offset + 64, true),
        y: view.getFloat32(offset + 68, true),
        z: view.getFloat32(offset + 72, true),
      },
      rotation: basis.toQuaternion(),
      description: 'Imported MD3 tag',
    });
  }

  return tags;
}

class THREECompatibleMatrix3 {
  constructor(
    private readonly m00: number,
    private readonly m01: number,
    private readonly m02: number,
    private readonly m10: number,
    private readonly m11: number,
    private readonly m12: number,
    private readonly m20: number,
    private readonly m21: number,
    private readonly m22: number
  ) {}

  toQuaternion(): { x: number; y: number; z: number; w: number } {
    const trace = this.m00 + this.m11 + this.m22;

    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      return {
        x: (this.m21 - this.m12) / s,
        y: (this.m02 - this.m20) / s,
        z: (this.m10 - this.m01) / s,
        w: 0.25 * s,
      };
    }

    if (this.m00 > this.m11 && this.m00 > this.m22) {
      const s = Math.sqrt(1 + this.m00 - this.m11 - this.m22) * 2;
      return {
        x: 0.25 * s,
        y: (this.m01 + this.m10) / s,
        z: (this.m02 + this.m20) / s,
        w: (this.m21 - this.m12) / s,
      };
    }

    if (this.m11 > this.m22) {
      const s = Math.sqrt(1 + this.m11 - this.m00 - this.m22) * 2;
      return {
        x: (this.m01 + this.m10) / s,
        y: 0.25 * s,
        z: (this.m12 + this.m21) / s,
        w: (this.m02 - this.m20) / s,
      };
    }

    const s = Math.sqrt(1 + this.m22 - this.m00 - this.m11) * 2;
    return {
      x: (this.m02 + this.m20) / s,
      y: (this.m12 + this.m21) / s,
      z: 0.25 * s,
      w: (this.m10 - this.m01) / s,
    };
  }
}

function parseMD5(text: string): any {
  // Simplified MD5 parser - extracts joint and mesh data
  const lines = text.split('\n');
  let numJoints = 0;
  let numMeshes = 0;

  for (const line of lines) {
    if (line.startsWith('numJoints')) {
      numJoints = parseInt(line.split(' ')[1]);
    }
    if (line.startsWith('numMeshes')) {
      numMeshes = parseInt(line.split(' ')[1]);
    }
  }

  return {
    id: 'imported_md5_' + Date.now(),
    name: 'Imported MD5 Model',
    version: '1.0',
    description: 'Model imported from MD5 file',
    meshes: Array.from({ length: numMeshes }, (_, i) => ({
      id: `mesh_${i}`,
      name: `Mesh ${i}`,
      vertices: [],
      faces: [],
      material: {
        id: `mat_${i}`,
        name: `Material ${i}`,
        diffuse: [0.8, 0.8, 0.8],
        shininess: 32,
      },
    })),
    bones: Array.from({ length: numJoints }, (_, i) => ({
      id: `bone_${i}`,
      name: `Joint ${i}`,
      parentId: i === 0 ? null : `bone_${i - 1}`,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    })),
    animations: [],
    tags: [],
    lodConfigs: [],
    scale: 1,
  };
}

function parseGLTF(buffer: ArrayBuffer): any {
  // Simplified glTF parser - extracts basic structure
  // For full implementation, would need to parse binary GLB format or JSON glTF
  const text = new TextDecoder().decode(buffer);

  let gltf: any = null;
  try {
    gltf = JSON.parse(text);
  } catch {
    // If not JSON, it's likely binary GLB - would need proper GLB parser
    throw new Error('Binary GLB format requires advanced parsing - please use JSON glTF');
  }

  const meshCount = gltf.meshes?.length || 0;

  return {
    id: 'imported_gltf_' + Date.now(),
    name: 'Imported glTF Model',
    version: '1.0',
    description: 'Model imported from glTF file',
    meshes: Array.from({ length: meshCount }, (_, i) => ({
      id: `mesh_${i}`,
      name: gltf.meshes?.[i]?.name || `Mesh ${i}`,
      vertices: [],
      faces: [],
      material: {
        id: `mat_${i}`,
        name: `Material ${i}`,
        diffuse: [0.8, 0.8, 0.8],
        shininess: 32,
      },
    })),
    bones: gltf.nodes
      ? gltf.nodes.map((node: any, i: number) => ({
          id: `bone_${i}`,
          name: node.name || `Node ${i}`,
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        }))
      : [
          {
            id: 'bone_root',
            name: 'Root',
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        ],
    animations: [],
    tags: [],
    lodConfigs: [],
    scale: 1,
  };
}
