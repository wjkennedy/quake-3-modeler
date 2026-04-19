import { Tag, Vec3, Quat } from './schema';

export function createTag(
  id: string,
  name: string,
  position: Vec3 = { x: 0, y: 0, z: 0 },
  rotation: Quat = { x: 0, y: 0, z: 0, w: 1 },
  description?: string
): Tag {
  return {
    id,
    name,
    position,
    rotation,
    description,
  };
}

export function validateTagPlacement(
  tags: Tag[],
  meshBounds: { min: Vec3; max: Vec3 }
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  tags.forEach((tag) => {
    const { x, y, z } = tag.position;

    if (
      x < meshBounds.min.x ||
      x > meshBounds.max.x ||
      y < meshBounds.min.y ||
      y > meshBounds.max.y ||
      z < meshBounds.min.z ||
      z > meshBounds.max.z
    ) {
      warnings.push(`Tag "${tag.name}" is outside mesh bounds`);
    }
  });

  return { valid: warnings.length === 0, warnings };
}

export function computeMeshBounds(vertices: Array<{ position: Vec3 }>): { min: Vec3; max: Vec3 } {
  if (vertices.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    };
  }

  let minX = vertices[0].position.x;
  let minY = vertices[0].position.y;
  let minZ = vertices[0].position.z;
  let maxX = minX;
  let maxY = minY;
  let maxZ = minZ;

  for (let i = 1; i < vertices.length; i++) {
    const p = vertices[i].position;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}
