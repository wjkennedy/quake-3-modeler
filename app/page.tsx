'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ModelEditor } from '@/components/ModelEditor';
import { AnimationTimeline } from '@/components/AnimationTimeline';
import { ExportPanel } from '@/components/ExportPanel';
import { AnimationEditor } from '@/components/AnimationEditor';
import { BoneInspector } from '@/components/BoneInspector';
import { LODSettings } from '@/components/LODSettings';
import { FileUpload } from '@/components/FileUpload';
import { BotEditor } from '@/components/BotEditor';
import { TextureBrowser } from '@/components/TextureBrowser';

interface TextureAsset {
  name: string;
  url: string;
  type: string;
  sourceName?: string;
  sourceUrl?: string;
  previewUrl?: string;
}

// Dynamically import Previewer3D to avoid SSR issues with Three.js
const Previewer3D = dynamic(() => import('@/components/Previewer3D').then(mod => ({ default: mod.Previewer3D })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Loading 3D viewer...
    </div>
  ),
});

export default function Page() {
  const [modelJson, setModelJson] = useState<string>('');
  const [selectedAnimation, setSelectedAnimation] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'md3' | 'md5' | 'gltf' | 'pk3'>('md3');
  const [showTools, setShowTools] = useState(false);
  const [textures, setTextures] = useState<Record<string, TextureAsset>>({});
  const texturesRef = useRef<Record<string, TextureAsset>>({});

  useEffect(() => {
    return () => {
      Array.from(new Set(Object.values(texturesRef.current).flatMap(texture => [texture.url, texture.previewUrl].filter(Boolean)))).forEach(url => {
        if (url?.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, []);

  const handleTextureLoad = useCallback((name: string, url: string, type: string, sourceName?: string, previewUrl?: string) => {
    setTextures(previous => {
      const next = { ...previous };
      const keys = Array.from(new Set([...getTextureKeys(name), ...getTextureKeys(sourceName || '')]));
      const texture = { name, url, type, sourceName, previewUrl };
      const replacedUrls = new Set<string>();

      keys.forEach(key => {
        if (next[key] && next[key].url !== url) {
          replacedUrls.add(next[key].url);
        }
        if (next[key]?.previewUrl && next[key].previewUrl !== previewUrl) {
          replacedUrls.add(next[key].previewUrl);
        }
        next[key] = texture;
      });

      replacedUrls.forEach(replacedUrl => {
        if (replacedUrl.startsWith('blob:')) {
          URL.revokeObjectURL(replacedUrl);
        }
      });
      texturesRef.current = next;
      return next;
    });
  }, []);

  const handleBotLoad = useCallback((name: string, text: string) => {
    setModelJson(previous => {
      const model = parseModel(previous) || createEmptyModel();
      const next = {
        ...model,
        metadata: {
          ...(model.metadata || {}),
          botFiles: {
            ...(model.metadata?.botFiles || {}),
            [name]: text,
          },
        },
      };

      return JSON.stringify(next, null, 2);
    });
  }, []);

  const handleLoadSample = useCallback(async () => {
    try {
      const response = await fetch('/api/sample');
      const data = await response.json();
      setModelJson(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to load sample:', error);
      alert('Failed to load sample model');
    }
  }, []);

  const handleValidate = useCallback(async () => {
    try {
      const model = JSON.parse(modelJson);
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(model),
      });

      const result = await response.json();
      if (result.valid) {
        alert('Model validation passed!');
      } else {
        alert('Validation errors:\n' + result.errors.map((e: any) => `${e.path}: ${e.message}`).join('\n'));
      }
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }, [modelJson]);

  const handleExport = useCallback(async () => {
    try {
      const model = await prepareModelForExport(JSON.parse(modelJson), texturesRef.current);
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, format: exportFormat }),
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `model.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }, [modelJson, exportFormat]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Left Panel - Editor & Tools */}
      <div className="flex-1 overflow-hidden flex flex-col border-r border-border">
        <div className="p-4 border-b border-border bg-card space-y-3">
          <h1 className="text-2xl font-bold">Quake 3 Model Generator</h1>
          <div className="flex gap-2 flex-wrap">
            <FileUpload onModelLoad={setModelJson} onTextureLoad={handleTextureLoad} onBotLoad={handleBotLoad} />
            <button
              onClick={handleLoadSample}
              className="px-3 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm font-medium"
            >
              Load Sample
            </button>
            <button
              onClick={handleValidate}
              className="px-3 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 text-sm font-medium"
            >
              Validate
            </button>
            <button
              onClick={() => setShowTools(!showTools)}
              className="px-3 py-2 bg-accent text-accent-foreground rounded hover:bg-accent/90 text-sm font-medium"
            >
              {showTools ? 'Hide' : 'Show'} Tools
            </button>
          </div>
        </div>

        {/* Tools Panel */}
        {showTools && (
          <div className="flex-1 overflow-auto border-b border-border bg-muted p-4 space-y-4">
            <AnimationEditor modelJson={modelJson} onModelUpdate={setModelJson} />
            <LODSettings modelJson={modelJson} onModelUpdate={setModelJson} />
            <BoneInspector modelJson={modelJson} onModelUpdate={setModelJson} />
            <BotEditor modelJson={modelJson} onModelUpdate={setModelJson} />
            <TextureBrowser modelJson={modelJson} textures={textures} onTextureLoad={handleTextureLoad} onModelUpdate={setModelJson} />
          </div>
        )}

        {/* Model Editor */}
        <div className="flex-1 overflow-auto">
          <ModelEditor value={modelJson} onChange={setModelJson} />
        </div>
      </div>

      {/* Right Panel - Preview & Timeline */}
      <div className="flex-1 overflow-hidden flex flex-col border-l border-border">
        {/* 3D Preview */}
        <div className="flex-1 overflow-hidden flex flex-col bg-muted">
          <div className="p-3 border-b border-border bg-card">
            <h2 className="text-lg font-semibold">3D Preview</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            {modelJson ? (
              <Previewer3D modelJson={modelJson} selectedAnimation={selectedAnimation} textures={textures} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <p className="font-semibold mb-2">No model loaded</p>
                  <p className="text-sm">Click &apos;Load Sample&apos; to get started</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="border-t border-border bg-card p-4 max-h-48">
          <AnimationTimeline modelJson={modelJson} onAnimationSelect={setSelectedAnimation} />
        </div>

        {/* Export Panel */}
        <div className="border-t border-border bg-card p-4">
          <ExportPanel format={exportFormat} onFormatChange={setExportFormat} onExport={handleExport} />
        </div>
      </div>
    </div>
  );
}

function getTextureKeys(name: string): string[] {
  if (!name) return [];

  const normalized = normalizeTextureKey(name);
  const withoutExtension = normalized.replace(/\.[^/.]+$/, '');
  const fileName = normalized.split('/').pop() || normalized;
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  return Array.from(new Set([normalized, withoutExtension, fileName, baseName].filter(Boolean)));
}

function normalizeTextureKey(value: string): string {
  return value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
}

function parseModel(modelJson: string): any | null {
  try {
    return modelJson ? JSON.parse(modelJson) : null;
  } catch {
    return null;
  }
}

function createEmptyModel(): any {
  return {
    id: 'model_' + Date.now(),
    name: 'Imported Bot Config',
    version: '1.0',
    meshes: [],
    bones: [],
    animations: [],
    tags: [],
    lodConfigs: [],
    scale: 1,
  };
}

async function prepareModelForExport(model: any, textures: Record<string, TextureAsset>): Promise<any> {
  const embeddedTextures = {
    ...(model.embeddedTextures || {}),
  };

  for (const [key, texture] of Object.entries(textures)) {
    const serializable = await serializeTextureAsset(texture);
    if (serializable) {
      embeddedTextures[key] = serializable;
    }
  }

  return {
    ...model,
    embeddedTextures,
  };
}

async function serializeTextureAsset(texture: TextureAsset): Promise<TextureAsset | null> {
  const url = await toSerializableUrl(texture.url);
  const sourceUrl = texture.sourceUrl ? await toSerializableUrl(texture.sourceUrl) : url;
  const previewUrl = texture.previewUrl ? await toSerializableUrl(texture.previewUrl) : undefined;

  if (!url && !sourceUrl) {
    return null;
  }

  return {
    ...texture,
    url: url || sourceUrl,
    sourceUrl,
    previewUrl,
  };
}

async function toSerializableUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) {
    return url;
  }

  const response = await fetch(url);
  const blob = await response.blob();

  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
