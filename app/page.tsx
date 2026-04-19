'use client';

import { useState, useCallback } from 'react';
import { ModelEditor } from '@/components/ModelEditor';
import { Previewer3D } from '@/components/Previewer3D';
import { AnimationTimeline } from '@/components/AnimationTimeline';
import { ExportPanel } from '@/components/ExportPanel';
import { AnimationEditor } from '@/components/AnimationEditor';
import { BoneInspector } from '@/components/BoneInspector';
import { LODSettings } from '@/components/LODSettings';

export default function Page() {
  const [modelJson, setModelJson] = useState<string>('');
  const [selectedAnimation, setSelectedAnimation] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'md3' | 'md5' | 'gltf'>('md3');
  const [showTools, setShowTools] = useState(false);

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
      const model = JSON.parse(modelJson);
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, format: exportFormat }),
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `model.${exportFormat === 'md3' ? 'md3' : exportFormat === 'md5' ? 'md5' : 'gltf'}`;
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
              <Previewer3D modelJson={modelJson} selectedAnimation={selectedAnimation} />
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
