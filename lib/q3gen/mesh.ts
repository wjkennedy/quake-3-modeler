import { Mesh, Vertex, Face, Material, Vec3 } from './schema';

export class MeshBuilder {
  private vertices: Vertex[] = [];
  private faces: Face[] = [];
  private materialId: string;

  constructor(meshId: string, material: Material) {
    this.materialId = material.id;
  }

  addVertex(vertex: Vertex): number {
    const index = this.vertices.length;
    this.vertices.push(vertex);
    return index;
  }

  addFace(face: Face): void {
    this.faces.push(face);
  }

  createBox(
    material: Material,
    width: number = 1,
    height: number = 1,
    depth: number = 1,
    position: Vec3 = { x: 0, y: 0, z: 0 }
  ): Mesh {
    const vertices: Vertex[] = [
      // Front face
      {
        position: { x: position.x - width / 2, y: position.y - height / 2, z: position.z + depth / 2 },
        normal: { x: 0, y: 0, z: 1 },
        uv: { u: 0, v: 0 },
      },
      {
        position: { x: position.x + width / 2, y: position.y - height / 2, z: position.z + depth / 2 },
        normal: { x: 0, y: 0, z: 1 },
        uv: { u: 1, v: 0 },
      },
      {
        position: { x: position.x + width / 2, y: position.y + height / 2, z: position.z + depth / 2 },
        normal: { x: 0, y: 0, z: 1 },
        uv: { u: 1, v: 1 },
      },
      {
        position: { x: position.x - width / 2, y: position.y + height / 2, z: position.z + depth / 2 },
        normal: { x: 0, y: 0, z: 1 },
        uv: { u: 0, v: 1 },
      },
      // Back face
      {
        position: { x: position.x - width / 2, y: position.y - height / 2, z: position.z - depth / 2 },
        normal: { x: 0, y: 0, z: -1 },
        uv: { u: 1, v: 0 },
      },
      {
        position: { x: position.x - width / 2, y: position.y + height / 2, z: position.z - depth / 2 },
        normal: { x: 0, y: 0, z: -1 },
        uv: { u: 1, v: 1 },
      },
      {
        position: { x: position.x + width / 2, y: position.y + height / 2, z: position.z - depth / 2 },
        normal: { x: 0, y: 0, z: -1 },
        uv: { u: 0, v: 1 },
      },
      {
        position: { x: position.x + width / 2, y: position.y - height / 2, z: position.z - depth / 2 },
        normal: { x: 0, y: 0, z: -1 },
        uv: { u: 0, v: 0 },
      },
      // Top face
      {
        position: { x: position.x - width / 2, y: position.y + height / 2, z: position.z + depth / 2 },
        normal: { x: 0, y: 1, z: 0 },
        uv: { u: 0, v: 1 },
      },
      {
        position: { x: position.x - width / 2, y: position.y + height / 2, z: position.z - depth / 2 },
        normal: { x: 0, y: 1, z: 0 },
        uv: { u: 0, v: 0 },
      },
      {
        position: { x: position.x + width / 2, y: position.y + height / 2, z: position.z - depth / 2 },
        normal: { x: 0, y: 1, z: 0 },
        uv: { u: 1, v: 0 },
      },
      {
        position: { x: position.x + width / 2, y: position.y + height / 2, z: position.z + depth / 2 },
        normal: { x: 0, y: 1, z: 0 },
        uv: { u: 1, v: 1 },
      },
      // Bottom face
      {
        position: { x: position.x - width / 2, y: position.y - height / 2, z: position.z - depth / 2 },
        normal: { x: 0, y: -1, z: 0 },
        uv: { u: 1, v: 0 },
      },
      {
        position: { x: position.x - width / 2, y: position.y - height / 2, z: position.z + depth / 2 },
        normal: { x: 0, y: -1, z: 0 },
        uv: { u: 0, v: 0 },
      },
      {
        position: { x: position.x + width / 2, y: position.y - height / 2, z: position.z + depth / 2 },
        normal: { x: 0, y: -1, z: 0 },
        uv: { u: 1, v: 0 },
      },
      {
        position: { x: position.x + width / 2, y: position.y - height / 2, z: position.z - depth / 2 },
        normal: { x: 0, y: -1, z: 0 },
        uv: { u: 1, v: 1 },
      },
      // Right face
      {
        position: { x: position.x + width / 2, y: position.y - height / 2, z: position.z - depth / 2 },
        normal: { x: 1, y: 0, z: 0 },
        uv: { u: 0, v: 0 },
      },
      {
        position: { x: position.x + width / 2, y: position.y + height / 2, z: position.z - depth / 2 },
        normal: { x: 1, y: 0, z: 0 },
        uv: { u: 0, v: 1 },
      },
      {
        position: { x: position.x + width / 2, y: position.y + height / 2, z: position.z + depth / 2 },
        normal: { x: 1, y: 0, z: 0 },
        uv: { u: 1, v: 1 },
      },
      {
        position: { x: position.x + width / 2, y: position.y - height / 2, z: position.z + depth / 2 },
        normal: { x: 1, y: 0, z: 0 },
        uv: { u: 1, v: 0 },
      },
      // Left face
      {
        position: { x: position.x - width / 2, y: position.y - height / 2, z: position.z + depth / 2 },
        normal: { x: -1, y: 0, z: 0 },
        uv: { u: 0, v: 0 },
      },
      {
        position: { x: position.x - width / 2, y: position.y + height / 2, z: position.z + depth / 2 },
        normal: { x: -1, y: 0, z: 0 },
        uv: { u: 0, v: 1 },
      },
      {
        position: { x: position.x - width / 2, y: position.y + height / 2, z: position.z - depth / 2 },
        normal: { x: -1, y: 0, z: 0 },
        uv: { u: 1, v: 1 },
      },
      {
        position: { x: position.x - width / 2, y: position.y - height / 2, z: position.z - depth / 2 },
        normal: { x: -1, y: 0, z: 0 },
        uv: { u: 1, v: 0 },
      },
    ];

    const faces: Face[] = [
      // Front
      { indices: [0, 1, 2], materialId: material.id },
      { indices: [0, 2, 3], materialId: material.id },
      // Back
      { indices: [4, 6, 5], materialId: material.id },
      { indices: [4, 7, 6], materialId: material.id },
      // Top
      { indices: [8, 9, 10], materialId: material.id },
      { indices: [8, 10, 11], materialId: material.id },
      // Bottom
      { indices: [12, 14, 13], materialId: material.id },
      { indices: [12, 15, 14], materialId: material.id },
      // Right
      { indices: [16, 17, 18], materialId: material.id },
      { indices: [16, 18, 19], materialId: material.id },
      // Left
      { indices: [20, 22, 21], materialId: material.id },
      { indices: [20, 23, 22], materialId: material.id },
    ];

    return {
      id: `mesh_box_${Date.now()}`,
      name: 'Box',
      vertices,
      faces,
      material,
    };
  }

  createSphere(
    material: Material,
    radius: number = 1,
    widthSegments: number = 32,
    heightSegments: number = 16,
    position: Vec3 = { x: 0, y: 0, z: 0 }
  ): Mesh {
    const vertices: Vertex[] = [];
    const faces: Face[] = [];

    for (let y = 0; y <= heightSegments; y++) {
      const theta = (y * Math.PI) / heightSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let x = 0; x <= widthSegments; x++) {
        const phi = (x * 2 * Math.PI) / widthSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const px = position.x + radius * cosPhi * sinTheta;
        const py = position.y + radius * cosTheta;
        const pz = position.z + radius * sinPhi * sinTheta;

        vertices.push({
          position: { x: px, y: py, z: pz },
          normal: { x: cosPhi * sinTheta, y: cosTheta, z: sinPhi * sinTheta },
          uv: { u: x / widthSegments, v: y / heightSegments },
        });
      }
    }

    for (let y = 0; y < heightSegments; y++) {
      for (let x = 0; x < widthSegments; x++) {
        const a = y * (widthSegments + 1) + x;
        const b = a + widthSegments + 1;

        faces.push({ indices: [a, b, a + 1], materialId: material.id });
        faces.push({ indices: [b, b + 1, a + 1], materialId: material.id });
      }
    }

    return {
      id: `mesh_sphere_${Date.now()}`,
      name: 'Sphere',
      vertices,
      faces,
      material,
    };
  }

  computeNormals(mesh: Mesh): Mesh {
    const normals: Vec3[] = mesh.vertices.map(() => ({ x: 0, y: 0, z: 0 }));

    mesh.faces.forEach((face) => {
      const v0 = mesh.vertices[face.indices[0]].position;
      const v1 = mesh.vertices[face.indices[1]].position;
      const v2 = mesh.vertices[face.indices[2]].position;

      const edge1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
      const edge2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };

      const normal = {
        x: edge1.y * edge2.z - edge1.z * edge2.y,
        y: edge1.z * edge2.x - edge1.x * edge2.z,
        z: edge1.x * edge2.y - edge1.y * edge2.x,
      };

      const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
      if (len > 0) {
        normal.x /= len;
        normal.y /= len;
        normal.z /= len;
      }

      face.indices.forEach((idx) => {
        normals[idx].x += normal.x;
        normals[idx].y += normal.y;
        normals[idx].z += normal.z;
      });
    });

    normals.forEach((n) => {
      const len = Math.sqrt(n.x ** 2 + n.y ** 2 + n.z ** 2);
      if (len > 0) {
        n.x /= len;
        n.y /= len;
        n.z /= len;
      }
    });

    return {
      ...mesh,
      vertices: mesh.vertices.map((v, i) => ({
        ...v,
        normal: normals[i],
      })),
    };
  }
}

export function transformMesh(mesh: Mesh, transform: { position?: Vec3; scale?: Vec3; rotation?: { x: number; y: number; z: number } }): Mesh {
  return {
    ...mesh,
    vertices: mesh.vertices.map((v) => {
      let pos = v.position;

      if (transform.scale) {
        pos = {
          x: pos.x * transform.scale.x,
          y: pos.y * transform.scale.y,
          z: pos.z * transform.scale.z,
        };
      }

      if (transform.position) {
        pos = {
          x: pos.x + transform.position.x,
          y: pos.y + transform.position.y,
          z: pos.z + transform.position.z,
        };
      }

      return { ...v, position: pos };
    }),
  };
}

export function mergeMeshes(meshes: Mesh[], material: Material): Mesh {
  let vertexOffset = 0;
  const allVertices: Vertex[] = [];
  const allFaces: Face[] = [];

  meshes.forEach((mesh) => {
    allVertices.push(...mesh.vertices);
    allFaces.push(
      ...mesh.faces.map((face) => ({
        ...face,
        indices: [
          face.indices[0] + vertexOffset,
          face.indices[1] + vertexOffset,
          face.indices[2] + vertexOffset,
        ] as [number, number, number],
      }))
    );
    vertexOffset += mesh.vertices.length;
  });

  return {
    id: `mesh_merged_${Date.now()}`,
    name: 'Merged',
    vertices: allVertices,
    faces: allFaces,
    material,
  };
}

export { ProceduralGeometry } from './procedural';
