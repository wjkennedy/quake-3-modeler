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
  isPlaceholder?: boolean;
}

interface MaterialTarget {
  id: string;
  meshId: string;
  meshName: string;
  materialName: string;
  textureName: string;
  texture: TextureAsset;
  isSharedTexture: boolean;
}

interface TextureBrowserProps {
  modelJson: string;
  textures: Record<string, TextureAsset>;
  onModelUpdate: (modelJson: string) => void;
}

const tgaPreviewCache = new Map<string, Promise<string>>();

export function TextureBrowser({ modelJson, textures, onModelUpdate }: TextureBrowserProps) {
  const model = useMemo(() => parseModel(modelJson), [modelJson]);
  const embeddedTextures = (model?.embeddedTextures || {}) as Record<string, TextureAsset>;
  const materialTargets = useMemo(() => buildMaterialTargets(model, embeddedTextures, textures), [model, embeddedTextures, textures]);

  if (!model) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Material Textures</h3>
        <p className="text-xs text-muted-foreground">Each material target has a direct texture slot.</p>
      </div>

      {materialTargets.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {materialTargets.map(target => (
            <MaterialTargetTile
              key={target.id}
              target={target}
              model={model}
              onModelUpdate={onModelUpdate}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No material targets found yet.</p>
      )}
    </div>
  );
}

function MaterialTargetTile({
  target,
  model,
  onModelUpdate,
}: {
  target: MaterialTarget;
  model: any;
  onModelUpdate: (modelJson: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const texture = target.texture;
  const [previewUrl, setPreviewUrl] = useState(texture.previewUrl || texture.url);
  const [convertedUrl, setConvertedUrl] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);
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

    setIsReplacing(true);
    try {
      const replacementName = target.isSharedTexture
        ? createTargetTexturePath(model?.name || 'model', target.meshName, target.materialName)
        : target.textureName;
      const replacement = await imageFileToTgaAsset(file, replacementName);
      onModelUpdate(JSON.stringify(updateMaterialTargetTexture(model, target, replacement), null, 2));
    } finally {
      setIsReplacing(false);
    }

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="border border-border rounded p-2 bg-background space-y-2">
      <button type="button" onClick={() => inputRef.current?.click()} className="block w-full aspect-square bg-muted overflow-hidden rounded text-left">
        <img src={previewUrl} alt={texture.name} className="w-full h-full object-contain" />
      </button>
      <div className="space-y-1">
        <div className="text-xs font-medium truncate" title={target.meshName}>{target.meshName}</div>
        <div className="text-[10px] text-muted-foreground truncate" title={target.materialName}>{target.materialName}</div>
        <div className="text-[10px] truncate" title={target.textureName}>{target.textureName}</div>
        {texture.isPlaceholder && (
          <div className="text-[10px] text-muted-foreground">No image loaded</div>
        )}
        {target.isSharedTexture && (
          <div className="text-[10px] text-muted-foreground">Shared texture. Replacing creates a separate slot.</div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.tga,image/png,image/jpeg,image/webp,image/x-tga"
        onChange={event => replaceTexture(event.target.files?.[0])}
        className="hidden"
      />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={isReplacing} className="w-full px-2 py-1 bg-primary text-primary-foreground rounded text-xs disabled:opacity-50">
        {isReplacing ? 'Applying...' : 'Choose Texture'}
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

function buildMaterialTargets(model: any, embeddedTextures: Record<string, TextureAsset>, textures: Record<string, TextureAsset>): MaterialTarget[] {
  const combined = { ...textures, ...embeddedTextures };

  if (!Array.isArray(model?.meshes)) {
    return [];
  }

  const textureCounts = new Map<string, number>();
  model.meshes.forEach((mesh: any, meshIndex: number) => {
    const textureName = getTargetTextureName(model, mesh, meshIndex);
    const key = normalizeTextureKey(textureName);
    textureCounts.set(key, (textureCounts.get(key) || 0) + 1);
  });

  return model.meshes
    .filter((mesh: any) => mesh?.material)
    .map((mesh: any, meshIndex: number) => {
      const textureName = getTargetTextureName(model, mesh, meshIndex);
      const texture = findTextureForName(textureName, combined) || createPlaceholderTexture(textureName);
      const meshName = mesh.name || `mesh_${meshIndex}`;
      const materialName = mesh.material?.name || mesh.material?.id || meshName;
      const meshId = String(mesh.id || meshName);

      return {
        id: `${meshId}:${textureName}`,
        meshId,
        meshName,
        materialName,
        textureName,
        texture,
        isSharedTexture: (textureCounts.get(normalizeTextureKey(textureName)) || 0) > 1,
      };
    })
    .sort((a, b) => a.meshName.localeCompare(b.meshName) || a.materialName.localeCompare(b.materialName));
}

function createPlaceholderTexture(textureName: string): TextureAsset {
  const sourceName = textureName;
  const label = (textureName.split('/').pop() || textureName).replace(/\.[^/.]+$/, '');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
      <rect width="256" height="256" fill="#1f2937"/>
      <rect x="12" y="12" width="232" height="232" fill="none" stroke="#6b7280" stroke-width="4" stroke-dasharray="10 8"/>
      <path d="M24 200 L96 128 L144 168 L192 112 L232 152" fill="none" stroke="#9ca3af" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="88" cy="80" r="18" fill="#9ca3af"/>
      <text x="128" y="224" fill="#e5e7eb" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">${escapeXml(label)}</text>
    </svg>
  `.trim();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return {
    name: textureName,
    sourceName,
    type: 'image/svg+xml',
    url,
    previewUrl: url,
    isPlaceholder: true,
  };
}

async function tgaToPng(texture: TextureAsset): Promise<string> {
  const cacheKey = texture.sourceUrl || texture.url;
  const cached = tgaPreviewCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const conversion = decodeTgaToPng(texture);
  tgaPreviewCache.set(cacheKey, conversion);
  return conversion;
}

async function decodeTgaToPng(texture: TextureAsset): Promise<string> {
  const loader = new TGALoader();
  const loaded = await loader.loadAsync(texture.sourceUrl || texture.url);
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
  const isTga = file.name.toLowerCase().endsWith('.tga') || file.type === 'image/x-tga';
  if (isTga) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decodeUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/x-tga' }));
    const name = targetName.replace(/\.(jpe?g|png|webp|tga)$/i, '.tga');
    const sourceUrl = await bytesToDataUrl(bytes, 'image/x-tga');
    const previewUrl = await tgaToPng({ name, url: decodeUrl, type: 'image/x-tga' });
    URL.revokeObjectURL(decodeUrl);

    return {
      name,
      sourceName: name,
      type: 'image/x-tga',
      url: sourceUrl,
      sourceUrl,
      previewUrl,
    };
  }

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
  const sourceUrl = await bytesToDataUrl(tgaBytes, 'image/x-tga');
  URL.revokeObjectURL(previewUrl);

  return {
    name,
    sourceName: name,
    type: 'image/x-tga',
    url: sourceUrl,
    sourceUrl,
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

function updateMaterialTargetTexture(model: any, target: MaterialTarget, newTexture: TextureAsset): any {
  const embeddedTexture = {
    name: newTexture.name,
    sourceName: newTexture.sourceName || newTexture.name,
    sourceUrl: newTexture.sourceUrl || newTexture.url,
    url: newTexture.sourceUrl || newTexture.url,
    type: newTexture.type,
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
      ? model.meshes.map((mesh: any, meshIndex: number) => {
          const meshId = String(mesh.id || mesh.name || `mesh_${meshIndex}`);
          if (meshId !== target.meshId) {
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

function findTextureForName(textureName: string, textures: Record<string, TextureAsset>): TextureAsset | null {
  const keys = getTextureKeys(textureName);

  for (const key of keys) {
    if (textures[key]) {
      return textures[key];
    }
  }

  return Object.values(textures).find(texture =>
    getTextureKeys(texture.sourceName || texture.name).some(key => keys.includes(key))
  ) || null;
}

function getTargetTextureName(model: any, mesh: any, meshIndex: number): string {
  return mesh?.material?.texturePath
    || mesh?.material?.name
    || createTargetTexturePath(model?.name || 'model', mesh?.name || `mesh_${meshIndex}`, mesh?.material?.id || 'material');
}

function createTargetTexturePath(modelName: string, meshName: string, materialName: string): string {
  return `models/generated/${slugify(modelName)}/${slugify(meshName)}_${slugify(materialName)}.tga`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/\\/g, '/').replace(/[^a-z0-9/_-]+/g, '_').replace(/^_+|_+$/g, '') || 'texture';
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

  const normalized = normalizeTextureKey(value);
  const withoutExtension = normalized.replace(/\.[^/.]+$/, '');
  const fileName = normalized.split('/').pop() || normalized;
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  return Array.from(new Set([normalized, withoutExtension, fileName, baseName].filter(Boolean)));
}

function normalizeTextureKey(value: string): string {
  return value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
