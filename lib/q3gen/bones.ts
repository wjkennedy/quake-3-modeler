import { Bone, Vec3, Quat } from './schema';

export function createBone(
  id: string,
  name: string,
  parentId: string | null,
  position: Vec3 = { x: 0, y: 0, z: 0 },
  rotation: Quat = { x: 0, y: 0, z: 0, w: 1 },
  scale: Vec3 = { x: 1, y: 1, z: 1 }
): Bone {
  return {
    id,
    name,
    parentId,
    position,
    rotation,
    scale,
  };
}

export function buildSkeletonHierarchy(bones: Bone[]): Map<string, Bone[]> {
  const hierarchy = new Map<string, Bone[]>();

  bones.forEach((bone) => {
    const parent = bone.parentId || 'root';
    if (!hierarchy.has(parent)) {
      hierarchy.set(parent, []);
    }
    hierarchy.get(parent)!.push(bone);
  });

  return hierarchy;
}

export function getSkeletonPath(bones: Bone[], boneId: string): Bone[] {
  const path: Bone[] = [];
  let current = bones.find((b) => b.id === boneId);

  while (current) {
    path.unshift(current);
    current = current.parentId ? bones.find((b) => b.id === current!.parentId) : undefined;
  }

  return path;
}

export function computeBoneMatrix(bone: Bone): number[] {
  // Compute transformation matrix from bone's position, rotation, and scale
  const q = bone.rotation;
  const s = bone.scale;
  const p = bone.position;

  // Rotation matrix from quaternion
  const rotMatrix = [
    [1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.y - q.z * q.w), 2 * (q.x * q.z + q.y * q.w), 0],
    [2 * (q.x * q.y + q.z * q.w), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z - q.x * q.w), 0],
    [2 * (q.x * q.z - q.y * q.w), 2 * (q.y * q.z + q.x * q.w), 1 - 2 * (q.x * q.x + q.y * q.y), 0],
    [0, 0, 0, 1],
  ];

  // Apply scale
  const scaled = rotMatrix.map((row) => [row[0] * s.x, row[1] * s.y, row[2] * s.z, row[3]]);

  // Apply translation
  scaled[0][3] = p.x;
  scaled[1][3] = p.y;
  scaled[2][3] = p.z;

  return scaled.flat();
}

export function validateSkeletonStructure(bones: Bone[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const boneIds = new Set(bones.map((b) => b.id));

  bones.forEach((bone) => {
    if (bone.parentId && !boneIds.has(bone.parentId)) {
      errors.push(`Bone "${bone.name}" references non-existent parent "${bone.parentId}"`);
    }
  });

  // Check for circular dependencies
  const visited = new Set<string>();
  const rec = (boneId: string | null): boolean => {
    if (boneId === null || boneId === 'root') return false;
    if (visited.has(boneId)) return true;
    visited.add(boneId);

    const bone = bones.find((b) => b.id === boneId);
    return bone ? rec(bone.parentId) : false;
  };

  bones.forEach((bone) => {
    visited.clear();
    if (rec(bone.id)) {
      errors.push(`Circular dependency detected in skeleton hierarchy involving bone "${bone.name}"`);
    }
  });

  return { valid: errors.length === 0, errors };
}
