import { Mesh, Vertex, Face, Material, Vec3, Vec2 } from './schema';

/**
 * Parse OBJ file format and convert to internal Mesh format
 */
export function parseOBJ(objContent: string, material: Material): Mesh {
  const lines = objContent.split('\n');
  const vertices: Vertex[] = [];
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const faces: Face[] = [];

  lines.forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;

    const parts = line.split(/\s+/);
    const command = parts[0];

    switch (command) {
      case 'v':
        positions.push({
          x: parseFloat(parts[1]),
          y: parseFloat(parts[2]),
          z: parseFloat(parts[3]),
        });
        break;
      case 'vn':
        normals.push({
          x: parseFloat(parts[1]),
          y: parseFloat(parts[2]),
          z: parseFloat(parts[3]),
        });
        break;
      case 'vt':
        uvs.push({
          u: parseFloat(parts[1]),
          v: parseFloat(parts[2]),
        });
        break;
      case 'f':
        // Parse face (support both triangles and quads)
        const faceIndices = parts.slice(1).map((part) => {
          const indices = part.split('/');
          return {
            v: parseInt(indices[0]) - 1,
            vt: indices[1] ? parseInt(indices[1]) - 1 : -1,
            vn: indices[2] ? parseInt(indices[2]) - 1 : -1,
          };
        });

        // Triangulate if needed
        for (let i = 1; i < faceIndices.length - 1; i++) {
          const idx0 = faceIndices[0];
          const idx1 = faceIndices[i];
          const idx2 = faceIndices[i + 1];

          // Add vertices
          [idx0, idx1, idx2].forEach((idx) => {
            const v = positions[idx.v] || { x: 0, y: 0, z: 0 };
            const n = idx.vn >= 0 ? normals[idx.vn] : { x: 0, y: 0, z: 0 };
            const uv = idx.vt >= 0 ? uvs[idx.vt] : { u: 0, v: 0 };

            vertices.push({
              position: v,
              normal: n,
              uv,
            });
          });

          faces.push({
            indices: [
              vertices.length - 3,
              vertices.length - 2,
              vertices.length - 1,
            ] as [number, number, number],
            materialId: material.id,
          });
        }
        break;
    }
  });

  return {
    id: `mesh_obj_${Date.now()}`,
    name: 'Imported OBJ',
    vertices,
    faces,
    material,
  };
}

/**
 * Parse GLB/GLTF file (simplified - basic structure)
 * Full GLB parsing would require a proper glTF library
 */
export function parseGLB(glbBuffer: ArrayBuffer, material: Material): Mesh {
  // This is a stub for GLB parsing. Full implementation would:
  // 1. Parse GLB header and chunks
  // 2. Extract mesh data from JSON and binary buffers
  // 3. Handle animations, skins, materials from the file
  
  throw new Error('GLB parsing requires a full glTF parser implementation. Use gltf-transform or three-gltf-loader.');
}

/**
 * Procedural geometry generator for common shapes
 */
export class ProceduralGeometry {
  /**
   * Create a cylinder mesh
   */
  static createCylinder(
    material: Material,
    radius: number = 1,
    height: number = 2,
    segments: number = 32,
    position: Vec3 = { x: 0, y: 0, z: 0 }
  ): Mesh {
    const vertices: Vertex[] = [];
    const faces: Face[] = [];

    // Top and bottom circles
    const topY = position.y + height / 2;
    const bottomY = position.y - height / 2;

    // Create cylinder sides
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = position.x + Math.cos(angle) * radius;
      const z = position.z + Math.sin(angle) * radius;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);

      // Top vertex
      vertices.push({
        position: { x, y: topY, z },
        normal: { x: nx, y: 0, z: nz },
        uv: { u: i / segments, v: 1 },
      });

      // Bottom vertex
      vertices.push({
        position: { x, y: bottomY, z },
        normal: { x: nx, y: 0, z: nz },
        uv: { u: i / segments, v: 0 },
      });
    }

    // Create side faces
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = ((i + 1) * 2) % (segments * 2);
      const d = (c + 1) % (segments * 2 + 2);

      faces.push({ indices: [a, b, c], materialId: material.id });
      faces.push({ indices: [b, d, c], materialId: material.id });
    }

    // Create top cap
    const topCenterIdx = vertices.length;
    vertices.push({
      position: { x: position.x, y: topY, z: position.z },
      normal: { x: 0, y: 1, z: 0 },
      uv: { u: 0.5, v: 0.5 },
    });

    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = ((i + 1) * 2) % (segments * 2);
      faces.push({ indices: [topCenterIdx, b, a], materialId: material.id });
    }

    // Create bottom cap
    const bottomCenterIdx = vertices.length;
    vertices.push({
      position: { x: position.x, y: bottomY, z: position.z },
      normal: { x: 0, y: -1, z: 0 },
      uv: { u: 0.5, v: 0.5 },
    });

    for (let i = 0; i < segments; i++) {
      const a = i * 2 + 1;
      const b = ((i + 1) * 2 + 1) % (segments * 2 + 2);
      faces.push({ indices: [bottomCenterIdx, a, b], materialId: material.id });
    }

    return {
      id: `mesh_cylinder_${Date.now()}`,
      name: 'Cylinder',
      vertices,
      faces,
      material,
    };
  }

  /**
   * Create a plane mesh
   */
  static createPlane(
    material: Material,
    width: number = 1,
    height: number = 1,
    widthSegments: number = 1,
    heightSegments: number = 1,
    position: Vec3 = { x: 0, y: 0, z: 0 }
  ): Mesh {
    const vertices: Vertex[] = [];
    const faces: Face[] = [];

    const halfWidth = width / 2;
    const halfHeight = height / 2;

    for (let y = 0; y <= heightSegments; y++) {
      for (let x = 0; x <= widthSegments; x++) {
        vertices.push({
          position: {
            x: position.x + (x / widthSegments) * width - halfWidth,
            y: position.y,
            z: position.z + (y / heightSegments) * height - halfHeight,
          },
          normal: { x: 0, y: 1, z: 0 },
          uv: { u: x / widthSegments, v: y / heightSegments },
        });
      }
    }

    for (let y = 0; y < heightSegments; y++) {
      for (let x = 0; x < widthSegments; x++) {
        const a = y * (widthSegments + 1) + x;
        const b = a + widthSegments + 1;
        const c = a + 1;
        const d = b + 1;

        faces.push({ indices: [a, b, c], materialId: material.id });
        faces.push({ indices: [b, d, c], materialId: material.id });
      }
    }

    return {
      id: `mesh_plane_${Date.now()}`,
      name: 'Plane',
      vertices,
      faces,
      material,
    };
  }

  /**
   * Create a pyramid mesh
   */
  static createPyramid(
    material: Material,
    baseSize: number = 2,
    height: number = 2,
    position: Vec3 = { x: 0, y: 0, z: 0 }
  ): Mesh {
    const vertices: Vertex[] = [
      // Apex
      {
        position: { x: position.x, y: position.y + height / 2, z: position.z },
        normal: { x: 0, y: 1, z: 0 },
        uv: { u: 0.5, v: 0.5 },
      },
      // Base corners
      {
        position: {
          x: position.x + baseSize / 2,
          y: position.y - height / 2,
          z: position.z + baseSize / 2,
        },
        normal: { x: 1, y: 0, z: 1 },
        uv: { u: 1, v: 0 },
      },
      {
        position: {
          x: position.x - baseSize / 2,
          y: position.y - height / 2,
          z: position.z + baseSize / 2,
        },
        normal: { x: -1, y: 0, z: 1 },
        uv: { u: 0, v: 0 },
      },
      {
        position: {
          x: position.x - baseSize / 2,
          y: position.y - height / 2,
          z: position.z - baseSize / 2,
        },
        normal: { x: -1, y: 0, z: -1 },
        uv: { u: 0, v: 1 },
      },
      {
        position: {
          x: position.x + baseSize / 2,
          y: position.y - height / 2,
          z: position.z - baseSize / 2,
        },
        normal: { x: 1, y: 0, z: -1 },
        uv: { u: 1, v: 1 },
      },
    ];

    const faces: Face[] = [
      // Sides
      { indices: [0, 1, 2], materialId: material.id },
      { indices: [0, 2, 3], materialId: material.id },
      { indices: [0, 3, 4], materialId: material.id },
      { indices: [0, 4, 1], materialId: material.id },
      // Base
      { indices: [1, 4, 3], materialId: material.id },
      { indices: [1, 3, 2], materialId: material.id },
    ];

    return {
      id: `mesh_pyramid_${Date.now()}`,
      name: 'Pyramid',
      vertices,
      faces,
      material,
    };
  }

  /**
   * Create a capsule (rounded cylinder) mesh
   */
  static createCapsule(
    material: Material,
    radius: number = 0.5,
    height: number = 2,
    segments: number = 16,
    position: Vec3 = { x: 0, y: 0, z: 0 }
  ): Mesh {
    const vertices: Vertex[] = [];
    const faces: Face[] = [];

    const cylinderHeight = height - radius * 2;
    const halfCylinderHeight = cylinderHeight / 2;

    // Top hemisphere
    for (let v = 0; v <= segments / 2; v++) {
      const theta = (v / (segments / 2)) * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let u = 0; u <= segments; u++) {
        const phi = (u / segments) * Math.PI * 2;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const vx = cosPhi * sinTheta * radius;
        const vy = cosTheta * radius + halfCylinderHeight;
        const vz = sinPhi * sinTheta * radius;

        vertices.push({
          position: {
            x: position.x + vx,
            y: position.y + vy,
            z: position.z + vz,
          },
          normal: {
            x: cosPhi * sinTheta,
            y: cosTheta,
            z: sinPhi * sinTheta,
          },
          uv: { u: u / segments, v: v / (segments / 2) },
        });
      }
    }

    // Bottom hemisphere
    const hemisphereVertices = (segments / 2 + 1) * (segments + 1);
    for (let v = segments / 2; v <= segments; v++) {
      const theta = ((v - segments / 2) / (segments / 2)) * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let u = 0; u <= segments; u++) {
        const phi = (u / segments) * Math.PI * 2;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const vx = cosPhi * sinTheta * radius;
        const vy = -cosTheta * radius - halfCylinderHeight;
        const vz = sinPhi * sinTheta * radius;

        vertices.push({
          position: {
            x: position.x + vx,
            y: position.y + vy,
            z: position.z + vz,
          },
          normal: {
            x: cosPhi * sinTheta,
            y: -cosTheta,
            z: sinPhi * sinTheta,
          },
          uv: { u: u / segments, v: (v - segments / 2) / (segments / 2) + 0.5 },
        });
      }
    }

    // Generate faces
    const verticesPerRow = segments + 1;
    for (let v = 0; v < segments; v++) {
      for (let u = 0; u < segments; u++) {
        const a = v * verticesPerRow + u;
        const b = a + verticesPerRow;
        const c = a + 1;
        const d = b + 1;

        faces.push({ indices: [a, b, c], materialId: material.id });
        faces.push({ indices: [b, d, c], materialId: material.id });
      }
    }

    return {
      id: `mesh_capsule_${Date.now()}`,
      name: 'Capsule',
      vertices,
      faces,
      material,
    };
  }
}
