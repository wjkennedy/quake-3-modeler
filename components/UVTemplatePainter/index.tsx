'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface TextureAsset {
  name: string;
  url: string;
  type: string;
  sourceName?: string;
  sourceUrl?: string;
  previewUrl?: string;
}

interface UVTemplatePainterProps {
  modelJson: string;
  textures: Record<string, TextureAsset>;
  onModelUpdate: (modelJson: string) => void;
}

interface UvPoint {
  x: number;
  y: number;
}

interface UvTriangle {
  points: [UvPoint, UvPoint, UvPoint];
}

interface UvIsland {
  id: string;
  triangles: UvTriangle[];
  boundaryEdges: Array<[UvPoint, UvPoint]>;
  centroid: UvPoint;
}

interface UvTarget {
  id: string;
  label: string;
  textureName: string;
  materialName: string;
  meshIds: string[];
  meshNames: string[];
  triangles: UvTriangle[];
  islands: UvIsland[];
}

const CANVAS_SIZE_OPTIONS = [256, 512, 1024];
const BRUSH_SIZE_OPTIONS = [2, 4, 8, 16, 24, 32];
const ISLAND_COLORS = ['#2563eb', '#dc2626', '#059669', '#7c3aed', '#d97706', '#db2777', '#0891b2'];

export function UVTemplatePainter({ modelJson, textures, onModelUpdate }: UVTemplatePainterProps) {
  const model = useMemo(() => parseModel(modelJson), [modelJson]);
  const targets = useMemo(() => buildUvTargets(model), [model]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [canvasSize, setCanvasSize] = useState(1024);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(8);
  const [showIslandLabels, setShowIslandLabels] = useState(true);

  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<UvPoint | null>(null);

  const selectedTarget = useMemo(
    () => targets.find(target => target.id === selectedTargetId) || targets[0] || null,
    [targets, selectedTargetId]
  );

  useEffect(() => {
    if (!selectedTarget) {
      setSelectedTargetId('');
      return;
    }

    setSelectedTargetId(previous => (previous && targets.some(target => target.id === previous) ? previous : selectedTarget.id));
  }, [selectedTarget, targets]);

  const renderComposite = useCallback(() => {
    const displayCanvas = displayCanvasRef.current;
    const paintCanvas = paintCanvasRef.current;

    if (!displayCanvas || !paintCanvas || !selectedTarget) {
      return;
    }

    const context = displayCanvas.getContext('2d');
    if (!context) {
      return;
    }

    context.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    context.fillStyle = '#111827';
    context.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    context.drawImage(paintCanvas, 0, 0);

    selectedTarget.islands.forEach((island, index) => {
      context.fillStyle = `${hexToRgba(ISLAND_COLORS[index % ISLAND_COLORS.length], 0.12)}`;
      island.triangles.forEach(triangle => {
        context.beginPath();
        context.moveTo(triangle.points[0].x * displayCanvas.width, triangle.points[0].y * displayCanvas.height);
        context.lineTo(triangle.points[1].x * displayCanvas.width, triangle.points[1].y * displayCanvas.height);
        context.lineTo(triangle.points[2].x * displayCanvas.width, triangle.points[2].y * displayCanvas.height);
        context.closePath();
        context.fill();
      });

      context.strokeStyle = ISLAND_COLORS[index % ISLAND_COLORS.length];
      context.lineWidth = 2;
      context.lineJoin = 'round';
      island.boundaryEdges.forEach(([start, end]) => {
        context.beginPath();
        context.moveTo(start.x * displayCanvas.width, start.y * displayCanvas.height);
        context.lineTo(end.x * displayCanvas.width, end.y * displayCanvas.height);
        context.stroke();
      });

      if (showIslandLabels) {
        context.fillStyle = '#f9fafb';
        context.font = '12px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(
          `Island ${index + 1}`,
          island.centroid.x * displayCanvas.width,
          island.centroid.y * displayCanvas.height
        );
      }
    });
  }, [selectedTarget, showIslandLabels]);

  useEffect(() => {
    const paintCanvas = paintCanvasRef.current;
    const displayCanvas = displayCanvasRef.current;

    if (!paintCanvas || !displayCanvas) {
      return;
    }

    paintCanvas.width = canvasSize;
    paintCanvas.height = canvasSize;
    displayCanvas.width = canvasSize;
    displayCanvas.height = canvasSize;

    const paintContext = paintCanvas.getContext('2d');
    if (!paintContext) {
      return;
    }

    paintContext.clearRect(0, 0, canvasSize, canvasSize);
    void seedFromExistingTexture(selectedTarget, model, textures, paintCanvas, renderComposite);
  }, [canvasSize, model, renderComposite, selectedTarget, textures]);

  useEffect(() => {
    renderComposite();
  }, [renderComposite]);

  if (!model) {
    return null;
  }

  if (!targets.length) {
    return (
      <div className="space-y-2">
        <h3 className="font-semibold">UV Template Painter</h3>
        <p className="text-sm text-muted-foreground">No meshes with UVs were found.</p>
      </div>
    );
  }

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event, event.currentTarget);
    drawingRef.current = true;
    lastPointRef.current = point;
    drawStroke(point, point);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }

    const point = getCanvasPoint(event, event.currentTarget);
    drawStroke(lastPointRef.current || point, point);
    lastPointRef.current = point;
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const drawStroke = (from: UvPoint, to: UvPoint) => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) {
      return;
    }

    const context = paintCanvas.getContext('2d');
    if (!context) {
      return;
    }

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = brushSize;
    context.strokeStyle = brushColor;

    if (tool === 'eraser') {
      context.globalCompositeOperation = 'destination-out';
    } else {
      context.globalCompositeOperation = 'source-over';
    }

    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();

    renderComposite();
  };

  const clearPainting = () => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) {
      return;
    }

    const context = paintCanvas.getContext('2d');
    if (!context) {
      return;
    }

    context.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    renderComposite();
  };

  const fillBackground = (color: string) => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) {
      return;
    }

    const context = paintCanvas.getContext('2d');
    if (!context) {
      return;
    }

    context.save();
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = color;
    context.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
    context.restore();
    renderComposite();
  };

  const downloadPng = () => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas || !selectedTarget) {
      return;
    }

    const link = document.createElement('a');
    link.href = paintCanvas.toDataURL('image/png');
    link.download = `${slugify(selectedTarget.label || selectedTarget.textureName)}.png`;
    link.click();
  };

  const applyTexture = async () => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas || !selectedTarget) {
      return;
    }

    const imageData = paintCanvas.getContext('2d')?.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
    if (!imageData) {
      return;
    }

    const tgaBytes = encodeTga(imageData);
    const sourceUrl = await bytesToDataUrl(tgaBytes, 'image/x-tga');
    const previewUrl = paintCanvas.toDataURL('image/png');
    const nextModel = applyTextureToModel(model, selectedTarget, {
      name: selectedTarget.textureName,
      url: sourceUrl,
      sourceUrl,
      previewUrl,
      sourceName: selectedTarget.textureName,
      type: 'image/x-tga',
    });

    onModelUpdate(JSON.stringify(nextModel, null, 2));
  };

  const autoLayoutUvs = () => {
    if (!selectedTarget) {
      return;
    }

    const nextModel = autoLayoutTargetUvs(model, selectedTarget);
    onModelUpdate(JSON.stringify(nextModel, null, 2));
  };

  const createSeparateTexture = () => {
    if (!selectedTarget) {
      return;
    }

    const nextModel = assignSeparateTexturePath(model, selectedTarget);
    onModelUpdate(JSON.stringify(nextModel, null, 2));
  };

  const clearUvs = () => {
    if (!selectedTarget) {
      return;
    }

    const nextModel = clearTargetUvs(model, selectedTarget);
    onModelUpdate(JSON.stringify(nextModel, null, 2));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">UV Template Painter</h3>
          <p className="text-xs text-muted-foreground">Paint directly over UV islands for the selected material.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">Material Target</div>
          <select
            value={selectedTarget?.id || ''}
            onChange={event => setSelectedTargetId(event.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1"
          >
            {targets.map(target => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">Canvas Size</div>
          <select
            value={canvasSize}
            onChange={event => setCanvasSize(Number(event.target.value))}
            className="w-full rounded border border-border bg-background px-2 py-1"
          >
            {CANVAS_SIZE_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}x{option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">Tool</div>
          <select
            value={tool}
            onChange={event => setTool(event.target.value as 'brush' | 'eraser')}
            className="w-full rounded border border-border bg-background px-2 py-1"
          >
            <option value="brush">Brush</option>
            <option value="eraser">Eraser</option>
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">Brush Size</div>
          <select
            value={brushSize}
            onChange={event => setBrushSize(Number(event.target.value))}
            className="w-full rounded border border-border bg-background px-2 py-1"
          >
            {BRUSH_SIZE_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}px
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Brush Color</span>
          <input type="color" value={brushColor} onChange={event => setBrushColor(event.target.value)} className="h-8 w-10 rounded border border-border bg-background p-1" />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showIslandLabels} onChange={event => setShowIslandLabels(event.target.checked)} />
          <span>Show island labels</span>
        </label>
        <button type="button" onClick={() => fillBackground('#ffffff')} className="rounded border border-border px-2 py-1 text-xs">
          Fill White
        </button>
        <button type="button" onClick={() => fillBackground('#000000')} className="rounded border border-border px-2 py-1 text-xs">
          Fill Black
        </button>
        <button type="button" onClick={clearUvs} className="rounded border border-border px-2 py-1 text-xs">
          Clear UVs
        </button>
        <button type="button" onClick={clearPainting} className="rounded border border-border px-2 py-1 text-xs">
          Clear
        </button>
        <button type="button" onClick={createSeparateTexture} className="rounded border border-border px-2 py-1 text-xs">
          Create Separate Texture
        </button>
        <button type="button" onClick={autoLayoutUvs} className="rounded border border-border px-2 py-1 text-xs">
          Auto Layout UVs
        </button>
        <button type="button" onClick={downloadPng} className="rounded border border-border px-2 py-1 text-xs">
          Download PNG
        </button>
        <button type="button" onClick={applyTexture} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
          Apply Texture
        </button>
      </div>

      {selectedTarget && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Texture path: <span className="font-mono">{selectedTarget.textureName}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Meshes: {selectedTarget.meshNames.join(', ')} | Islands: {selectedTarget.islands.length}
          </p>
          {!selectedTarget.triangles.length && (
            <p className="text-xs text-muted-foreground">This target has no usable UVs yet. Run Auto Layout UVs first.</p>
          )}
        </div>
      )}

      <div className="overflow-auto rounded border border-border bg-background p-2">
        <canvas
          ref={displayCanvasRef}
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          className="h-auto max-w-full cursor-crosshair rounded bg-[#111827]"
          style={{ width: Math.min(canvasSize, 768), height: Math.min(canvasSize, 768) }}
        />
        <canvas ref={paintCanvasRef} className="hidden" />
      </div>
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

function buildUvTargets(model: any): UvTarget[] {
  if (!Array.isArray(model?.meshes)) {
    return [];
  }

  model.meshes.forEach((mesh: any, meshIndex: number) => {
    void meshIndex;
  });

  return model.meshes
    .filter((mesh: any) => Array.isArray(mesh?.vertices) && Array.isArray(mesh?.faces) && mesh.vertices.length && mesh.faces.length)
    .map((mesh: any, meshIndex: number) => {
      const textureName = getTargetTextureName(model, mesh, meshIndex);
      const materialName = mesh.material?.name || mesh.name || `mesh_${meshIndex}`;
      const meshName = mesh.name || `mesh_${meshIndex}`;
      const triangles = mesh.faces.flatMap((face: any) => {
        if (!Array.isArray(face?.indices) || face.indices.length !== 3) {
          return [];
        }

        const points = face.indices.map((index: number) => toUvPoint(mesh.vertices[index]?.uv)).filter(Boolean) as UvPoint[];
        if (points.length !== 3 || triangleArea(points[0], points[1], points[2]) < 1e-8) {
          return [];
        }

        return [{ points: [points[0], points[1], points[2]] as [UvPoint, UvPoint, UvPoint] }];
      });

      return {
        id: String(mesh.id || `${meshName}:${textureName}`),
        label: `${meshName} -> ${materialName}`,
        textureName,
        materialName,
        meshIds: [String(mesh.id || meshName)],
        meshNames: [meshName],
        triangles,
        islands: buildUvIslands(triangles),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildUvIslands(triangles: UvTriangle[]): UvIsland[] {
  const edgeToTriangles = new Map<string, number[]>();

  triangles.forEach((triangle, triangleIndex) => {
    getTriangleEdges(triangle).forEach(edge => {
      const key = edgeKey(edge[0], edge[1]);
      edgeToTriangles.set(key, [...(edgeToTriangles.get(key) || []), triangleIndex]);
    });
  });

  const neighbors = new Map<number, Set<number>>();
  edgeToTriangles.forEach(indexes => {
    if (indexes.length < 2) {
      return;
    }

    indexes.forEach(index => {
      const current = neighbors.get(index) || new Set<number>();
      indexes.forEach(other => {
        if (other !== index) {
          current.add(other);
        }
      });
      neighbors.set(index, current);
    });
  });

  const visited = new Set<number>();
  const islands: UvIsland[] = [];

  triangles.forEach((triangle, startIndex) => {
    if (visited.has(startIndex)) {
      return;
    }

    const stack = [startIndex];
    const islandIndexes: number[] = [];

    while (stack.length) {
      const index = stack.pop()!;
      if (visited.has(index)) {
        continue;
      }

      visited.add(index);
      islandIndexes.push(index);
      (neighbors.get(index) || []).forEach(neighbor => {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      });
    }

    const islandTriangles = islandIndexes.map(index => triangles[index]);
    const localEdgeCounts = new Map<string, { count: number; edge: [UvPoint, UvPoint] }>();

    islandTriangles.forEach(islandTriangle => {
      getTriangleEdges(islandTriangle).forEach(edge => {
        const key = edgeKey(edge[0], edge[1]);
        const current = localEdgeCounts.get(key);
        localEdgeCounts.set(key, { count: (current?.count || 0) + 1, edge });
      });
    });

    const boundaryEdges = Array.from(localEdgeCounts.values())
      .filter(entry => entry.count === 1)
      .map(entry => entry.edge);

    const centroid = computeCentroid(islandTriangles.flatMap(islandTriangle => islandTriangle.points));

    islands.push({
      id: `island_${islands.length}`,
      triangles: islandTriangles,
      boundaryEdges,
      centroid,
    });
  });

  return islands;
}

async function seedFromExistingTexture(
  target: UvTarget | null,
  model: any,
  textures: Record<string, TextureAsset>,
  paintCanvas: HTMLCanvasElement,
  renderComposite: () => void
): Promise<void> {
  const context = paintCanvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, paintCanvas.width, paintCanvas.height);

  if (!target) {
    renderComposite();
    return;
  }

  const texture = findTextureAsset(target.textureName, model, textures);
  const source = texture?.previewUrl || texture?.url;

  if (!source) {
    renderComposite();
    return;
  }

  try {
    const image = await loadImage(source);
    context.drawImage(image, 0, 0, paintCanvas.width, paintCanvas.height);
  } catch {
    context.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  }

  renderComposite();
}

function findTextureAsset(textureName: string, model: any, textures: Record<string, TextureAsset>): TextureAsset | null {
  const combined = { ...(model?.embeddedTextures || {}), ...textures };
  const keys = getTextureKeys(textureName);

  for (const key of keys) {
    if (combined[key]) {
      return combined[key];
    }
  }

  const values = Object.values(combined);
  return values.find(texture => getTextureKeys(texture.sourceName || texture.name).some(key => keys.includes(key))) || null;
}

function applyTextureToModel(model: any, target: UvTarget, texture: TextureAsset): any {
  const embeddedTextures = { ...(model?.embeddedTextures || {}) };

  getTextureKeys(texture.name).forEach(key => {
    embeddedTextures[key] = texture;
  });
  getTextureKeys(texture.sourceName || '').forEach(key => {
    embeddedTextures[key] = texture;
  });

  return {
    ...model,
    embeddedTextures,
    meshes: Array.isArray(model?.meshes)
      ? model.meshes.map((mesh: any) => {
          if (!target.meshIds.includes(String(mesh?.id || mesh?.name || ''))) {
            return mesh;
          }

          return {
            ...mesh,
            material: {
              ...mesh.material,
              texturePath: target.textureName,
            },
          };
        })
      : model?.meshes,
  };
}

function autoLayoutTargetUvs(model: any, target: UvTarget): any {
  return {
    ...model,
    meshes: Array.isArray(model?.meshes)
      ? model.meshes.map((mesh: any) => {
          if (!target.meshIds.includes(String(mesh?.id || mesh?.name || ''))) {
            return mesh;
          }

          return autoUnwrapMesh(mesh);
        })
      : model?.meshes,
  };
}

function clearTargetUvs(model: any, target: UvTarget): any {
  const meshIds = new Set(target.meshIds.map(String));

  return {
    ...model,
    meshes: Array.isArray(model?.meshes)
      ? model.meshes.map((mesh: any) => {
          const meshId = String(mesh?.id || mesh?.name || '');
          if (!meshIds.has(meshId) || !Array.isArray(mesh?.vertices)) {
            return mesh;
          }

          return {
            ...mesh,
            vertices: mesh.vertices.map((vertex: any) => ({
              ...vertex,
              uv: { u: 0, v: 0 },
              boneWeights: Array.isArray(vertex.boneWeights) ? vertex.boneWeights.map((weight: any) => ({ ...weight })) : [],
            })),
          };
        })
      : model?.meshes,
  };
}

function assignSeparateTexturePath(model: any, target: UvTarget): any {
  const meshIds = new Set(target.meshIds.map(String));

  return {
    ...model,
    meshes: Array.isArray(model?.meshes)
      ? model.meshes.map((mesh: any, meshIndex: number) => {
          const meshId = String(mesh?.id || mesh?.name || '');
          if (!meshIds.has(meshId)) {
            return mesh;
          }

          const meshName = mesh?.name || `mesh_${meshIndex}`;
          const materialName = mesh?.material?.name || meshName;
          const texturePath = createTargetTexturePath(model?.name || 'model', meshName, materialName);

          return {
            ...mesh,
            material: {
              ...mesh.material,
              texturePath,
            },
          };
        })
      : model?.meshes,
  };
}

function autoUnwrapMesh(mesh: any): any {
  if (!Array.isArray(mesh?.vertices) || !Array.isArray(mesh?.faces) || !mesh.vertices.length || !mesh.faces.length) {
    return mesh;
  }

  const faceInfos = mesh.faces
    .map((face: any, faceIndex: number) => buildFaceInfo(mesh, face, faceIndex))
    .filter(Boolean) as FaceInfo[];

  if (!faceInfos.length) {
    return mesh;
  }

  const islands = buildGeometryIslands(faceInfos);
  const packedIslands = packProjectionIslands(islands);
  const nextVertices: any[] = [];
  const nextFaces: any[] = [];

  packedIslands.forEach(island => {
    island.faces.forEach(faceInfo => {
      const remapped = faceInfo.indices.map((vertexIndex, cornerIndex) => {
        const sourceVertex = mesh.vertices[vertexIndex];
        const projected = projectPointToPlane(sourceVertex.position, island.plane);
        const uv = projectPackedUv(projected, island.layout);

        nextVertices.push({
          ...sourceVertex,
          uv: {
            u: clamp01(uv.x),
            v: clamp01(1 - uv.y),
          },
          boneWeights: Array.isArray(sourceVertex.boneWeights) ? sourceVertex.boneWeights.map((weight: any) => ({ ...weight })) : [],
        });

        return nextVertices.length - 1;
      }) as [number, number, number];

      nextFaces.push({
        ...mesh.faces[faceInfo.faceIndex],
        indices: remapped,
      });
    });
  });

  return {
    ...mesh,
    vertices: nextVertices,
    faces: nextFaces,
  };
}

interface FaceInfo {
  faceIndex: number;
  indices: [number, number, number];
  positions: [any, any, any];
  plane: ProjectionPlane;
}

type ProjectionPlane = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

interface ProjectionIsland {
  faces: FaceInfo[];
  plane: ProjectionPlane;
}

interface PackedProjectionIsland extends ProjectionIsland {
  layout: {
    minX: number;
    minY: number;
    maxDimension: number;
    offsetX: number;
    offsetY: number;
    scale: number;
  };
}

function buildFaceInfo(mesh: any, face: any, faceIndex: number): FaceInfo | null {
  if (!Array.isArray(face?.indices) || face.indices.length !== 3) {
    return null;
  }

  const indices = face.indices as [number, number, number];
  const vertices = indices.map(index => mesh.vertices[index]);
  if (vertices.some(vertex => !vertex?.position)) {
    return null;
  }

  return {
    faceIndex,
    indices,
    positions: [vertices[0].position, vertices[1].position, vertices[2].position],
    plane: 'pz',
  };
}

function buildGeometryIslands(faceInfos: FaceInfo[]): ProjectionIsland[] {
  const vertexToFaces = new Map<number, number[]>();

  faceInfos.forEach((faceInfo, index) => {
    faceInfo.indices.forEach(vertexIndex => {
      vertexToFaces.set(vertexIndex, [...(vertexToFaces.get(vertexIndex) || []), index]);
    });
  });

  const neighbors = new Map<number, Set<number>>();

  vertexToFaces.forEach(indexes => {
    indexes.forEach(index => {
      const current = neighbors.get(index) || new Set<number>();
      indexes.forEach(other => {
        if (other !== index) {
          current.add(other);
        }
      });
      neighbors.set(index, current);
    });
  });

  const visited = new Set<number>();
  const islands: ProjectionIsland[] = [];

  faceInfos.forEach((faceInfo, startIndex) => {
    if (visited.has(startIndex)) {
      return;
    }

    const stack = [startIndex];
    const islandFaces: FaceInfo[] = [];

    while (stack.length) {
      const index = stack.pop()!;
      if (visited.has(index)) {
        continue;
      }

      visited.add(index);
      islandFaces.push(faceInfos[index]);
      (neighbors.get(index) || []).forEach(neighbor => {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      });
    }

    islands.push({
      faces: islandFaces,
      plane: selectProjectionPlaneForIsland(islandFaces),
    });
  });

  return islands;
}

function packProjectionIslands(islands: ProjectionIsland[]): PackedProjectionIsland[] {
  if (!islands.length) {
    return [];
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(islands.length)));
  const rows = Math.ceil(islands.length / columns);
  const cellWidth = 1 / columns;
  const cellHeight = 1 / rows;
  const padding = Math.min(cellWidth, cellHeight) * 0.08;

  return islands.map((island, index) => {
    const bounds = computeProjectionBounds(island);
    const maxDimension = Math.max(bounds.width, bounds.height, 1e-6);
    const localWidth = bounds.width / maxDimension;
    const localHeight = bounds.height / maxDimension;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const usableWidth = Math.max(cellWidth - padding * 2, 1e-6);
    const usableHeight = Math.max(cellHeight - padding * 2, 1e-6);
    const scale = Math.min(usableWidth / Math.max(localWidth, 1e-6), usableHeight / Math.max(localHeight, 1e-6));
    const contentWidth = localWidth * scale;
    const contentHeight = localHeight * scale;
    const offsetX = column * cellWidth + padding + (usableWidth - contentWidth) / 2;
    const offsetY = row * cellHeight + padding + (usableHeight - contentHeight) / 2;

    return {
      ...island,
      layout: {
        minX: bounds.minX,
        minY: bounds.minY,
        maxDimension,
        offsetX,
        offsetY,
        scale,
      },
    };
  });
}

function computeProjectionBounds(island: ProjectionIsland): { minX: number; minY: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  island.faces.forEach(face => {
    face.indices.forEach((_, cornerIndex) => {
      const point = projectFaceCorner(face, cornerIndex);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });

  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1e-6),
    height: Math.max(maxY - minY, 1e-6),
  };
}

function projectPackedUv(point: UvPoint, layout: PackedProjectionIsland['layout']): UvPoint {
  return {
    x: layout.offsetX + ((point.x - layout.minX) / layout.maxDimension) * layout.scale,
    y: layout.offsetY + ((point.y - layout.minY) / layout.maxDimension) * layout.scale,
  };
}

function projectFaceCorner(faceInfo: FaceInfo, cornerIndex: number): UvPoint {
  const position = faceInfo.positions[cornerIndex];
  return projectPointToPlane(position, faceInfo.plane);
}

function selectProjectionPlane(vertices: any[]): ProjectionPlane {
  const normal = averageFaceNormal(vertices);
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);

  if (absX >= absY && absX >= absZ) {
    return normal.x >= 0 ? 'px' : 'nx';
  }
  if (absY >= absX && absY >= absZ) {
    return normal.y >= 0 ? 'py' : 'ny';
  }
  return normal.z >= 0 ? 'pz' : 'nz';
}

function selectProjectionPlaneForIsland(faceInfos: FaceInfo[]): ProjectionPlane {
  const summedNormal = faceInfos.reduce(
    (sum, faceInfo) => {
      const [a, b, c] = faceInfo.positions;
      const edge1 = {
        x: b.x - a.x,
        y: b.y - a.y,
        z: b.z - a.z,
      };
      const edge2 = {
        x: c.x - a.x,
        y: c.y - a.y,
        z: c.z - a.z,
      };
      const normal = {
        x: edge1.y * edge2.z - edge1.z * edge2.y,
        y: edge1.z * edge2.x - edge1.x * edge2.z,
        z: edge1.x * edge2.y - edge1.y * edge2.x,
      };

      return {
        x: sum.x + normal.x,
        y: sum.y + normal.y,
        z: sum.z + normal.z,
      };
    },
    { x: 0, y: 0, z: 0 }
  );

  const absX = Math.abs(summedNormal.x);
  const absY = Math.abs(summedNormal.y);
  const absZ = Math.abs(summedNormal.z);

  if (absX >= absY && absX >= absZ) {
    return summedNormal.x >= 0 ? 'px' : 'nx';
  }
  if (absY >= absX && absY >= absZ) {
    return summedNormal.y >= 0 ? 'py' : 'ny';
  }
  return summedNormal.z >= 0 ? 'pz' : 'nz';
}

function averageFaceNormal(vertices: any[]): { x: number; y: number; z: number } {
  const [a, b, c] = vertices;
  const edge1 = {
    x: b.position.x - a.position.x,
    y: b.position.y - a.position.y,
    z: b.position.z - a.position.z,
  };
  const edge2 = {
    x: c.position.x - a.position.x,
    y: c.position.y - a.position.y,
    z: c.position.z - a.position.z,
  };
  const faceNormal = normalizeVector({
    x: edge1.y * edge2.z - edge1.z * edge2.y,
    y: edge1.z * edge2.x - edge1.x * edge2.z,
    z: edge1.x * edge2.y - edge1.y * edge2.x,
  });

  if (vectorLength(faceNormal) > 0) {
    return faceNormal;
  }

  return normalizeVector(vertices.reduce(
    (sum, vertex) => ({
      x: sum.x + (vertex.normal?.x || 0),
      y: sum.y + (vertex.normal?.y || 0),
      z: sum.z + (vertex.normal?.z || 1),
    }),
    { x: 0, y: 0, z: 0 }
  ));
}

function projectPointToPlane(position: any, plane: ProjectionPlane): UvPoint {
  if (!position) {
    return { x: 0, y: 0 };
  }

  switch (plane) {
    case 'px':
      return { x: -position.z, y: position.y };
    case 'nx':
      return { x: position.z, y: position.y };
    case 'py':
      return { x: position.x, y: -position.z };
    case 'ny':
      return { x: position.x, y: position.z };
    case 'pz':
      return { x: position.x, y: position.y };
    case 'nz':
    default:
      return { x: -position.x, y: position.y };
  }
}

function normalizeVector(vector: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const length = vectorLength(vector);
  if (!length) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function vectorLength(vector: { x: number; y: number; z: number }): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}

function getTriangleEdges(triangle: UvTriangle): Array<[UvPoint, UvPoint]> {
  return [
    [triangle.points[0], triangle.points[1]],
    [triangle.points[1], triangle.points[2]],
    [triangle.points[2], triangle.points[0]],
  ];
}

function computeCentroid(points: UvPoint[]): UvPoint {
  if (!points.length) {
    return { x: 0.5, y: 0.5 };
  }

  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function triangleArea(a: UvPoint, b: UvPoint, c: UvPoint): number {
  return Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);
}

function toUvPoint(uv: any): UvPoint | null {
  if (!uv || typeof uv.u !== 'number' || typeof uv.v !== 'number') {
    return null;
  }

  return {
    x: clamp01(uv.u),
    y: clamp01(uv.v),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function edgeKey(a: UvPoint, b: UvPoint): string {
  const aKey = pointKey(a);
  const bKey = pointKey(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function pointKey(point: UvPoint): string {
  return `${point.x.toFixed(5)},${point.y.toFixed(5)}`;
}

function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): UvPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
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

function getTextureKeys(value: string): string[] {
  if (!value) return [];

  const normalized = value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
  const withoutExtension = normalized.replace(/\.[^/.]+$/, '');
  const fileName = normalized.split('/').pop() || normalized;
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  return Array.from(new Set([normalized, withoutExtension, fileName, baseName].filter(Boolean)));
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

function bytesToDataUrl(bytes: Uint8Array, type: string): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(new Blob([bytes], { type }));
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image'));
    image.src = url;
  });
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(character => character + character).join('')
    : normalized;

  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
