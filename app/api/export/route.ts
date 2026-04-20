import { NextRequest, NextResponse } from 'next/server';
import { validateModel, MD3Exporter, MD5Exporter, glTFExporter } from '@/lib/q3gen';

export async function POST(request: NextRequest) {
  try {
    const { model, format } = await request.json();

    // Validate model
    const validatedModel = validateModel(model);

    let exportData: ArrayBuffer | string;
    let mimeType = 'application/octet-stream';
    let extension = 'bin';

    // Export based on format
    switch (format) {
      case 'md3':
        exportData = MD3Exporter.export(validatedModel);
        mimeType = 'application/octet-stream';
        extension = 'md3';
        break;
      case 'md5':
        exportData = MD5Exporter.export(validatedModel);
        mimeType = 'text/plain';
        extension = 'md5';
        break;
      case 'gltf':
        exportData = glTFExporter.export(validatedModel);
        mimeType = 'application/json';
        extension = 'gltf';
        break;
      case 'pk3':
        exportData = createPK3(validatedModel);
        mimeType = 'application/zip';
        extension = 'pk3';
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported format: ${format}` },
          { status: 400 }
        );
    }

    // Convert to buffer if needed
    let buffer: BodyInit;
    if (typeof exportData === 'string') {
      buffer = new TextEncoder().encode(exportData);
    } else {
      buffer = exportData;
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="model.${extension}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Export failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 400 }
    );
  }
}

interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

interface TextureAsset {
  name: string;
  url: string;
  type: string;
  sourceName?: string;
  sourceUrl?: string;
}

function createPK3(model: any): ArrayBuffer {
  const modelPath = `models/players/${sanitizePathSegment(model.name || model.id || 'model')}/model.md3`;
  const entries: ArchiveEntry[] = [
    {
      name: modelPath,
      data: new Uint8Array(MD3Exporter.export(model)),
    },
  ];

  getExportTextures(model).forEach(texture => {
    const dataUrl = texture.sourceUrl || texture.url;
    const data = dataUrlToBytes(dataUrl);

    if (data) {
      entries.push({
        name: normalizeArchivePath(texture.sourceName || texture.name),
        data,
      });
    }
  });

  return writeZip(entries);
}

function getExportTextures(model: any): TextureAsset[] {
  const textures = (model.embeddedTextures || {}) as Record<string, TextureAsset>;
  const materialPaths = new Set<string>();
  const seen = new Set<string>();
  const result: TextureAsset[] = [];

  if (Array.isArray(model.meshes)) {
    model.meshes.forEach((mesh: any) => {
      const texturePath = mesh.material?.texturePath || mesh.material?.name;
      if (texturePath) {
        getTextureKeys(texturePath).forEach(key => materialPaths.add(key));
      }
    });
  }

  Object.values(textures).forEach(texture => {
    const textureName = texture.sourceName || texture.name;
    const keys = getTextureKeys(textureName);
    const matchesMaterial = keys.some(key => materialPaths.has(key));

    if (!matchesMaterial) {
      return;
    }

    const archiveName = normalizeArchivePath(textureName);
    if (!archiveName || seen.has(archiveName)) {
      return;
    }

    seen.add(archiveName);
    result.push(texture);
  });

  return result;
}

function dataUrlToBytes(url: string | undefined): Uint8Array | null {
  if (!url) return null;

  const match = url.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return null;

  return new Uint8Array(Buffer.from(match[1], 'base64'));
}

function writeZip(entries: ArchiveEntry[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach(entry => {
    const nameBytes = encoder.encode(normalizeArchivePath(entry.name));
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + nameBytes.byteLength + entry.data.byteLength);
    const localView = new DataView(local.buffer);

    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, entry.data.byteLength);
    writeUint32(localView, 22, entry.data.byteLength);
    writeUint16(localView, 26, nameBytes.byteLength);
    writeUint16(localView, 28, 0);
    local.set(nameBytes, 30);
    local.set(entry.data, 30 + nameBytes.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(central.buffer);

    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, entry.data.byteLength);
    writeUint32(centralView, 24, entry.data.byteLength);
    writeUint16(centralView, 28, nameBytes.byteLength);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.byteLength;
  });

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);

  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, centralOffset);
  writeUint16(endView, 20, 0);

  const output = new Uint8Array(centralOffset + centralSize + end.byteLength);
  let targetOffset = 0;

  [...localParts, ...centralParts, end].forEach(part => {
    output.set(part, targetOffset);
    targetOffset += part.byteLength;
  });

  return output.buffer;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let index = 0; index < data.byteLength; index++) {
    crc = CRC32_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function getTextureKeys(value: string): string[] {
  if (!value) return [];

  const normalized = normalizeArchivePath(value);
  const withoutExtension = normalized.replace(/\.[^/.]+$/, '');
  const fileName = normalized.split('/').pop() || normalized;
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  return Array.from(new Set([normalized, withoutExtension, fileName, baseName].filter(Boolean)));
}

function normalizeArchivePath(value: string): string {
  return value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\.+/g, '.');
}

function sanitizePathSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'model';
}
