'use client';

import { useState, useCallback } from 'react';

interface MeshBuilderProps {
  onMeshGenerated: (meshJson: string) => void;
}

export function MeshBuilder({ onMeshGenerated }: MeshBuilderProps) {
  const [shapeType, setShapeType] = useState<'box' | 'sphere' | 'cylinder' | 'plane' | 'pyramid' | 'capsule'>('box');
  const [width, setWidth] = useState(2);
  const [height, setHeight] = useState(3);
  const [depth, setDepth] = useState(1);
  const [radius, setRadius] = useState(1);
  const [segments, setSegments] = useState(16);

  const handleGenerate = useCallback(() => {
    const meshData = {
      type: shapeType,
      params: {
        width,
        height,
        depth,
        radius,
        segments,
      },
      material: {
        id: 'mat_generated',
        name: 'Generated Material',
        diffuse: [0.8, 0.7, 0.6],
        shininess: 32,
      },
    };

    onMeshGenerated(JSON.stringify(meshData, null, 2));
  }, [shapeType, width, height, depth, radius, segments, onMeshGenerated]);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">Procedural Mesh Builder</h3>
      
      <div>
        <label className="block text-xs mb-2">Shape Type</label>
        <select
          value={shapeType}
          onChange={(e) => setShapeType(e.target.value as any)}
          className="w-full px-3 py-2 border border-input rounded bg-background text-foreground text-sm"
        >
          <option value="box">Box</option>
          <option value="sphere">Sphere</option>
          <option value="cylinder">Cylinder</option>
          <option value="plane">Plane</option>
          <option value="pyramid">Pyramid</option>
          <option value="capsule">Capsule</option>
        </select>
      </div>

      {(shapeType === 'box') && (
        <>
          <div>
            <label className="block text-xs mb-1">Width: {width}</label>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={width}
              onChange={(e) => setWidth(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Height: {height}</label>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={height}
              onChange={(e) => setHeight(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Depth: {depth}</label>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={depth}
              onChange={(e) => setDepth(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </>
      )}

      {(shapeType === 'sphere' || shapeType === 'cylinder' || shapeType === 'capsule') && (
        <>
          <div>
            <label className="block text-xs mb-1">Radius: {radius}</label>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={radius}
              onChange={(e) => setRadius(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          {(shapeType === 'cylinder' || shapeType === 'capsule') && (
            <div>
              <label className="block text-xs mb-1">Height: {height}</label>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={height}
                onChange={(e) => setHeight(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          )}
          <div>
            <label className="block text-xs mb-1">Segments: {segments}</label>
            <input
              type="range"
              min="4"
              max="64"
              step="1"
              value={segments}
              onChange={(e) => setSegments(parseInt(e.target.value))}
              className="w-full"
            />
          </div>
        </>
      )}

      <button
        onClick={handleGenerate}
        className="w-full px-3 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 font-medium"
      >
        Generate Mesh
      </button>
    </div>
  );
}
