import { Mesh, LODConfig, LODLevel, Face } from './schema';

/**
 * Simplify mesh using Quadric Error Metrics (QEM) - simplified version
 * For production, use a proper mesh simplification library like meshoptimizer
 */
export function simplifyMesh(mesh: Mesh, targetTriangleCount: number): Mesh {
  const currentTriangleCount = mesh.faces.length;

  if (targetTriangleCount >= currentTriangleCount) {
    return mesh;
  }

  const reductionRatio = targetTriangleCount / currentTriangleCount;

  // Simplified approach: randomly remove faces proportionally
  // A real implementation would use QEM or similar
  const facesToKeep = mesh.faces.filter(() => Math.random() < reductionRatio);

  // Collect used vertex indices
  const usedIndices = new Set<number>();
  facesToKeep.forEach((face) => {
    face.indices.forEach((idx) => usedIndices.add(idx));
  });

  // Create vertex index mapping
  const indexMap = new Map<number, number>();
  const newVertices = [];
  let newIndex = 0;

  for (let i = 0; i < mesh.vertices.length; i++) {
    if (usedIndices.has(i)) {
      indexMap.set(i, newIndex);
      newVertices.push(mesh.vertices[i]);
      newIndex++;
    }
  }

  // Remap faces
  const newFaces = facesToKeep.map((face) => ({
    ...face,
    indices: [
      indexMap.get(face.indices[0])!,
      indexMap.get(face.indices[1])!,
      indexMap.get(face.indices[2])!,
    ] as [number, number, number],
  }));

  return {
    ...mesh,
    id: `${mesh.id}_lod${targetTriangleCount}`,
    name: `${mesh.name} LOD${targetTriangleCount}`,
    vertices: newVertices,
    faces: newFaces,
  };
}

/**
 * Generate LOD variants for a mesh
 */
export function generateLODs(mesh: Mesh, levels: LODLevel[]): Mesh[] {
  const lodMeshes: Mesh[] = [mesh]; // LOD0 is always the full detail mesh

  // Sort levels by triangle count for consistent generation
  const sortedLevels = [...levels].sort((a, b) => (a.targetTriangleCount || 0) - (b.targetTriangleCount || 0));

  sortedLevels.forEach((level) => {
    if (level.targetTriangleCount && level.targetTriangleCount < mesh.faces.length) {
      const simplified = simplifyMesh(mesh, level.targetTriangleCount);
      lodMeshes.push(simplified);
    }
  });

  return lodMeshes;
}

/**
 * Create default LOD configuration
 */
export function createDefaultLODConfig(meshId: string, triCount: number): LODConfig {
  return {
    id: `lod_${meshId}`,
    meshId,
    enabled: true,
    levels: [
      {
        id: 'lod_0',
        name: 'High',
        distance: 0,
        targetTriangleCount: Math.floor(triCount * 1.0), // 100% detail
      },
      {
        id: 'lod_1',
        name: 'Medium',
        distance: 100,
        targetTriangleCount: Math.floor(triCount * 0.6), // 60% detail
      },
      {
        id: 'lod_2',
        name: 'Low',
        distance: 300,
        targetTriangleCount: Math.floor(triCount * 0.25), // 25% detail
      },
      {
        id: 'lod_3',
        name: 'Very Low',
        distance: 800,
        targetTriangleCount: Math.floor(triCount * 0.1), // 10% detail
      },
    ],
  };
}

/**
 * Select LOD level based on distance from camera
 */
export function selectLODLevel(
  lodConfig: LODConfig,
  distance: number
): LODLevel | null {
  if (!lodConfig.enabled || lodConfig.levels.length === 0) {
    return null;
  }

  // Find the highest distance threshold that's still <= current distance
  const sortedLevels = [...lodConfig.levels].sort((a, b) => b.distance - a.distance);

  for (const level of sortedLevels) {
    if (level.distance <= distance) {
      return level;
    }
  }

  return lodConfig.levels[0];
}
