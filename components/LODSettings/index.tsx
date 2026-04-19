'use client';

import { useState, useCallback, useMemo } from 'react';

interface LODSettingsProps {
  modelJson: string;
  onModelUpdate: (modelJson: string) => void;
}

export function LODSettings({ modelJson, onModelUpdate }: LODSettingsProps) {
  const [showSettings, setShowSettings] = useState(false);

  const model = useMemo(() => {
    try {
      return JSON.parse(modelJson);
    } catch {
      return null;
    }
  }, [modelJson]);

  const handleEnableLOD = useCallback(() => {
    if (!model) return;

    const updatedModel = {
      ...model,
      lodConfigs: model.lodConfigs || [],
    };

    if (updatedModel.lodConfigs.length === 0) {
      updatedModel.lodConfigs.push({
        id: 'lod_default',
        meshId: model.meshes?.[0]?.id || '',
        enabled: true,
        levels: [
          { id: 'lod_0', name: 'High', distance: 0, targetTriangleCount: 5000 },
          { id: 'lod_1', name: 'Medium', distance: 100, targetTriangleCount: 3000 },
          { id: 'lod_2', name: 'Low', distance: 300, targetTriangleCount: 1000 },
          { id: 'lod_3', name: 'Very Low', distance: 800, targetTriangleCount: 300 },
        ],
      });
    }

    onModelUpdate(JSON.stringify(updatedModel, null, 2));
  }, [model, onModelUpdate]);

  if (!model) {
    return <div className="text-destructive text-sm">Invalid model</div>;
  }

  const lodConfigs = model.lodConfigs || [];

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="w-full px-3 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/90 text-left"
      >
        {showSettings ? 'Hide' : 'Show'} LOD Settings
      </button>

      {showSettings && (
        <div className="space-y-3 p-3 border border-border rounded bg-muted">
          {lodConfigs.length === 0 ? (
            <button
              onClick={handleEnableLOD}
              className="w-full px-3 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
            >
              Enable LOD System
            </button>
          ) : (
            lodConfigs.map((lod: any) => (
              <div key={lod.id} className="space-y-2 p-2 border border-input rounded">
                <h4 className="font-semibold text-xs">LOD Configuration: {lod.id}</h4>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>
                    <span className="font-semibold">Mesh:</span> {lod.meshId}
                  </div>
                  <div>
                    <span className="font-semibold">Levels:</span> {lod.levels?.length || 0}
                  </div>
                  <div>
                    <span className="font-semibold">Enabled:</span> {lod.enabled ? 'Yes' : 'No'}
                  </div>
                </div>

                {lod.levels && (
                  <div className="space-y-1">
                    {lod.levels.map((level: any) => (
                      <div key={level.id} className="text-xs bg-background p-1 rounded">
                        <span className="font-semibold">{level.name}</span>
                        {' - '}
                        <span>Distance: {level.distance}u</span>
                        {level.targetTriangleCount && (
                          <>
                            {' - '}
                            <span>Triangles: {level.targetTriangleCount}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
