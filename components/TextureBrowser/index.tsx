'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';

interface TextureAsset {
  name: string;
  url: string;
  type: string;
  sourceName?: string;
  sourceUrl?: string;
  previewUrl?: string;
}

interface TextureBrowserProps {
  modelJson: string;
  textures: Record<string, TextureAsset>;
  onTextureLoad: (name: string, url: string, type: string, sourceName?: string, previewUrl?: string) => void;
  onModelUpdate: (modelJson: string) => void;
}

export function TextureBrowser({ modelJson, textures, onTextureLoad, onModelUpdate }: TextureBrowserProps) {
  const model = useMemo(() => parseModel(modelJson), [modelJson]);
  const embeddedTextures = (model?.embeddedTextures || {}) as Record<string, TextureAsset>;
  const textureList = useMemo(() => uniqueTextures({ ...embeddedTextures, ...textures }), [embeddedTextures, textures]);

  if (!model) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Textures</h3>
        <p className="text-xs text-muted-foreground">Replace textures directly from a tile.</p>
      </div>

      {textureList.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {textureList.map(texture => (
            <TextureTile
              key={`${texture.name}:${texture.url}`}
              texture={texture}
              model={model}
              onTextureLoad={onTextureLoad}
              onModelUpdate={onModelUpdate}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No textures loaded yet.</p>
      )}
    </div>
  );
}

function TextureTile({
  texture,
  model,
  onTextureLoad,
  onModelUpdate,
}: {
  texture: TextureAsset;
  model: any;
  onTextureLoad: (name: string, url: string, type: string, sourceName?: string, previewUrl?: string) => void;
  onModelUpdate: (modelJson: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState(texture.previewUrl || texture.url);
  const [convertedUrl, setConvertedUrl] = useState('');
  const sourceName = texture.sourceName || texture.name;
  const sourceIsTga = sourceName.toLowerCase().endsWith('.tga');
  const needsTgaDecode = texture.type === 'image/x-tga' || texture.name.toLowerCase().endsWith('.tga');

  useEffect(() => {
    setPreviewUrl(texture.previewUrl || texture.url);
    setConvertedUrl(sourceIsTga && texture.type === 'image/png' ? texture.url : '');

    if (needsTgaDecode && !texture.previewUrl) {
      convertTga();
    }
  }, [texture.url, texture.previewUrl, sourceIsTga, needsTgaDecode]);

  const convertTga = async () => {
    const pngUrl = await tgaToPng(texture);
    setPreviewUrl(pngUrl);
    setConvertedUrl(pngUrl);
  };

  const replaceTexture = async (file: File | undefined) => {
    if (!file) return;

    const replacement = await imageFileToTgaAsset(file, sourceName);
    onTextureLoad(replacement.name, replacement.url, replacement.type, replacement.sourceName, replacement.previewUrl);
    onModelUpdate(JSON.stringify(updateModelTexture(model, texture, replacement), null, 2));

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="border border-border rounded p-2 bg-background space-y-2">
      <div className="aspect-square bg-muted overflow-hidden rounded">
        <img src={previewUrl} alt={texture.name} className="w-full h-full object-contain" />
      </div>
      <div className="text-xs truncate" title={sourceName}>{sourceName}</div>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        onChange={event => replaceTexture(event.target.files?.[0])}
        className="hidden"
      />
      <button type="button" onClick={() => inputRef.current?.click()} className="w-full px-2 py-1 bg-primary text-primary-foreground rounded text-xs">
        Replace
      </button>
      {sourceIsTga && (
        <div className="flex gap-2">
          {needsTgaDecode && (
            <button type="button" onClick={convertTga} className="px-2 py-1 border border-border rounded text-xs">
              TGA to PNG
            </button>
          )}
          {convertedUrl && (
            <a href={convertedUrl} download={`${texture.name.replace(/\.tga$/i, '')}.png`} className="px-2 py-1 border border-border rounded text-xs">
              Download
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function parseModel(modelJson: string): any | null {
  try {
    return modelJson ? JSON.parse(modelJson) : null;
  } catch {
    return null;
  }
}

function uniqueTextures(textures: Record<string, TextureAsset>): TextureAsset[] {
  const seen = new Set<string>();
  return Object.values(textures).filter(texture => {
    const key = `${texture.name}:${texture.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function tgaToPng(texture: TextureAsset): Promise<string> {
  const loader = new TGALoader();
  const loaded = await loader.loadAsync(texture.url);
  const image = loaded.image as unknown as { data: Uint8Array; width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');

  if (!context) {
    return texture.url;
  }

  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

async function imageFileToTgaAsset(file: File, targetName: string): Promise<TextureAsset> {
  const previewUrl = URL.createObjectURL(file);
  const image = await loadImage(previewUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not read replacement texture');
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const name = targetName.replace(/\.(jpe?g|png|webp|tga)$/i, '.tga');
  const tgaBytes = encodeTga(imageData);
  const url = URL.createObjectURL(new Blob([tgaBytes], { type: 'image/x-tga' }));

  return {
    name,
    sourceName: name,
    type: 'image/x-tga',
    url,
    sourceUrl: await bytesToDataUrl(tgaBytes, 'image/x-tga'),
    previewUrl,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load replacement texture'));
    image.src = url;
  });
}

function encodeTga(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;
  const output = new Uint8Array(18 + width * height * 4);

  output[2] = 2;
  output[12] = width & 0xff;
  output[13] = (width >> 8) & 0xff;
  output[14] = height & 0xff;
  output[15] = (height >> 8) & 0xff;
  output[16] = 32;
  output[17] = 0x28;

  let targetOffset = 18;
  for (let sourceOffset = 0; sourceOffset < data.length; sourceOffset += 4) {
    output[targetOffset++] = data[sourceOffset + 2];
    output[targetOffset++] = data[sourceOffset + 1];
    output[targetOffset++] = data[sourceOffset];
    output[targetOffset++] = data[sourceOffset + 3];
  }

  return output;
}

function updateModelTexture(model: any, oldTexture: TextureAsset, newTexture: TextureAsset): any {
  const oldKeys = new Set(getTextureKeys(oldTexture.sourceName || oldTexture.name));
  const embeddedTexture = {
    name: newTexture.name,
    sourceName: newTexture.sourceName || newTexture.name,
    sourceUrl: newTexture.sourceUrl || newTexture.url,
    url: newTexture.sourceUrl || newTexture.url,
    type: newTexture.type,
    previewUrl: newTexture.previewUrl,
  };
  const embeddedTextures = {
    ...(model.embeddedTextures || {}),
  };

  getTextureKeys(newTexture.name).forEach(key => {
    embeddedTextures[key] = embeddedTexture;
  });
  getTextureKeys(newTexture.sourceName || '').forEach(key => {
    embeddedTextures[key] = embeddedTexture;
  });

  return {
    ...model,
    embeddedTextures,
    meshes: Array.isArray(model.meshes)
      ? model.meshes.map((mesh: any) => {
          const texturePath = mesh.material?.texturePath || mesh.material?.name;
          if (!texturePath || !getTextureKeys(texturePath).some(key => oldKeys.has(key))) {
            return mesh;
          }

          return {
            ...mesh,
            material: {
              ...mesh.material,
              texturePath: newTexture.name,
            },
          };
        })
      : model.meshes,
  };
}

function bytesToDataUrl(bytes: Uint8Array, type: string): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(new Blob([bytes], { type }));
  });
}

function getTextureKeys(value: string): string[] {
  if (!value) return [];

  const normalized = value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
  const withoutExtension = normalized.replace(/\.[^/.]+$/, '');
  const fileName = normalized.split('/').pop() || normalized;
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  return Array.from(new Set([normalized, withoutExtension, fileName, baseName].filter(Boolean)));
}
