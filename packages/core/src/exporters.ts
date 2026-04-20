import { Model, AnimationConfigEntry } from './schema';

/**
 * MD3 Exporter for Quake 3
 * Binary format with frames, vertices, triangles, shaders, and tags
 */
export class MD3Exporter {
  static export(model: Model): ArrayBuffer {
    const magic = 0x33504449; // "IDP3"
    const version = 15;
    const flags = 0;
    const numFrames = 1;
    const numTags = model.tags?.length || 0;
    const numSurfaces = model.meshes.length;
    const headerSize = 108;
    const frameSize = 56;
    const tagSize = 112;
    const surfaceHeaderSize = 108;
    const shaderSize = 68;

    let totalSize = headerSize + numFrames * frameSize + numTags * tagSize;

    model.meshes.forEach((mesh) => {
      const numVerts = mesh.vertices.length;
      const numTris = mesh.faces.length;
      totalSize += surfaceHeaderSize;
      totalSize += numTris * 12;
      totalSize += shaderSize;
      totalSize += numVerts * 8;
      totalSize += numFrames * numVerts * 8;
    });

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;
    const encoder = new TextEncoder();

    view.setUint32(offset, magic, true);
    offset += 4;
    view.setUint32(offset, version, true);
    offset += 4;

    writeFixedString(buffer, offset, model.name || 'model', 64, encoder);
    offset += 64;

    view.setUint32(offset, flags, true);
    offset += 4;
    view.setUint32(offset, numFrames, true);
    offset += 4;
    view.setUint32(offset, numTags, true);
    offset += 4;
    view.setUint32(offset, numSurfaces, true);
    offset += 4;
    view.setUint32(offset, 0, true); // num skins
    offset += 4;

    const frameOffsetPos = offset;
    offset += 4;
    const tagOffsetPos = offset;
    offset += 4;
    const surfaceOffsetPos = offset;
    offset += 4;
    const eofPos = offset;
    offset += 4;

    const frameOffset = offset;
    const bounds = calculateBounds(model);
    view.setFloat32(offset, bounds.minX, true);
    offset += 4;
    view.setFloat32(offset, bounds.minY, true);
    offset += 4;
    view.setFloat32(offset, bounds.minZ, true);
    offset += 4;
    view.setFloat32(offset, bounds.maxX, true);
    offset += 4;
    view.setFloat32(offset, bounds.maxY, true);
    offset += 4;
    view.setFloat32(offset, bounds.maxZ, true);
    offset += 4;
    view.setFloat32(offset, bounds.originX, true);
    offset += 4;
    view.setFloat32(offset, bounds.originY, true);
    offset += 4;
    view.setFloat32(offset, bounds.originZ, true);
    offset += 4;
    view.setFloat32(offset, bounds.radius, true);
    offset += 4;
    writeFixedString(buffer, offset, 'q3gen', 16, encoder);
    offset += 16;

    const tagOffset = offset;
    model.tags?.forEach((tag) => {
      writeFixedString(buffer, offset, tag.name, 64, encoder);
      offset += 64;

      view.setFloat32(offset, tag.position.x, true);
      offset += 4;
      view.setFloat32(offset, tag.position.y, true);
      offset += 4;
      view.setFloat32(offset, tag.position.z, true);
      offset += 4;

      // Rotation matrix (3x3)
      for (let i = 0; i < 9; i++) {
        view.setFloat32(offset, i === 0 || i === 4 || i === 8 ? 1 : 0, true);
        offset += 4;
      }
    });

    const surfaceOffset = offset;
    model.meshes.forEach((mesh) => {
      const surfaceHeaderPos = offset;
      offset += surfaceHeaderSize;
      const numVerts = mesh.vertices.length;
      const numTris = mesh.faces.length;
      const numShaders = 1;

      const trianglesOffset = offset - surfaceHeaderPos;
      mesh.faces.forEach((face) => {
        view.setUint32(offset, face.indices[0], true);
        offset += 4;
        view.setUint32(offset, face.indices[1], true);
        offset += 4;
        view.setUint32(offset, face.indices[2], true);
        offset += 4;
      });

      const shadersOffset = offset - surfaceHeaderPos;
      writeFixedString(buffer, offset, mesh.material.texturePath || mesh.material.name || 'shader', 64, encoder);
      offset += 64;
      view.setUint32(offset, 0, true);
      offset += 4;

      const texCoordsOffset = offset - surfaceHeaderPos;
      mesh.vertices.forEach((vertex) => {
        view.setFloat32(offset, vertex.uv?.u || 0, true);
        offset += 4;
        view.setFloat32(offset, vertex.uv?.v || 0, true);
        offset += 4;
      });

      const verticesOffset = offset - surfaceHeaderPos;
      mesh.vertices.forEach((vertex) => {
        view.setInt16(offset, clampInt16(Math.round(vertex.position.x * 64)), true);
        offset += 2;
        view.setInt16(offset, clampInt16(Math.round(vertex.position.y * 64)), true);
        offset += 2;
        view.setInt16(offset, clampInt16(Math.round(vertex.position.z * 64)), true);
        offset += 2;
        view.setUint16(offset, encodeNormal(vertex.normal), true);
        offset += 2;
      });

      const nextSurfaceOffset = offset - surfaceHeaderPos;
      view.setUint32(surfaceHeaderPos, magic, true);
      writeFixedString(buffer, surfaceHeaderPos + 4, mesh.name || 'Surface', 64, encoder);
      view.setUint32(surfaceHeaderPos + 68, 0, true);
      view.setUint32(surfaceHeaderPos + 72, numFrames, true);
      view.setUint32(surfaceHeaderPos + 76, numShaders, true);
      view.setUint32(surfaceHeaderPos + 80, numVerts, true);
      view.setUint32(surfaceHeaderPos + 84, numTris, true);
      view.setUint32(surfaceHeaderPos + 88, trianglesOffset, true);
      view.setUint32(surfaceHeaderPos + 92, shadersOffset, true);
      view.setUint32(surfaceHeaderPos + 96, texCoordsOffset, true);
      view.setUint32(surfaceHeaderPos + 100, verticesOffset, true);
      view.setUint32(surfaceHeaderPos + 104, nextSurfaceOffset, true);
    });

    view.setUint32(frameOffsetPos, frameOffset, true);
    view.setUint32(tagOffsetPos, tagOffset, true);
    view.setUint32(surfaceOffsetPos, surfaceOffset, true);
    view.setUint32(eofPos, offset, true);

    return buffer.slice(0, offset);
  }
}

function writeFixedString(buffer: ArrayBuffer, offset: number, value: string, length: number, encoder: TextEncoder): void {
  const bytes = encoder.encode(value);
  const target = new Uint8Array(buffer, offset, length);
  target.fill(0);
  target.set(bytes.subarray(0, Math.max(0, length - 1)));
}

function calculateBounds(model: Model) {
  const positions = model.meshes.flatMap((mesh) => mesh.vertices.map((vertex) => vertex.position));

  if (positions.length === 0) {
    return { minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1, originX: 0, originY: 0, originZ: 0, radius: 1 };
  }

  const minX = Math.min(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const minZ = Math.min(...positions.map((position) => position.z));
  const maxX = Math.max(...positions.map((position) => position.x));
  const maxY = Math.max(...positions.map((position) => position.y));
  const maxZ = Math.max(...positions.map((position) => position.z));
  const originX = (minX + maxX) / 2;
  const originY = (minY + maxY) / 2;
  const originZ = (minZ + maxZ) / 2;
  const radius = Math.max(
    ...positions.map((position) =>
      Math.hypot(position.x - originX, position.y - originY, position.z - originZ)
    )
  );

  return { minX, minY, minZ, maxX, maxY, maxZ, originX, originY, originZ, radius };
}

function clampInt16(value: number): number {
  return Math.max(-32768, Math.min(32767, value));
}

function encodeNormal(normal: { x: number; y: number; z: number } | undefined): number {
  if (!normal) return 0;

  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (!length) return 0;

  const x = normal.x / length;
  const y = normal.y / length;
  const z = normal.z / length;
  const lat = Math.acos(Math.max(-1, Math.min(1, z)));
  const lng = Math.atan2(y, x);
  const latByte = Math.round((lat * 255) / (2 * Math.PI)) & 0xff;
  const lngByte = Math.round((((lng + 2 * Math.PI) % (2 * Math.PI)) * 255) / (2 * Math.PI)) & 0xff;

  return (latByte << 8) | lngByte;
}

/**
 * MD5 Exporter for Doom 3
 * Text-based format with joint hierarchy and mesh data
 */
export class MD5Exporter {
  static export(model: Model): string {
    let output = '';

    // MD5 header
    output += 'MD5Version 10\n';
    output += `commandline "exported from Q3Gen"\n\n`;

    // Joints (bones)
    output += `numJoints ${model.bones.length}\n`;
    output += `numMeshes ${model.meshes.length}\n\n`;

    output += 'joints {\n';
    model.bones.forEach((bone) => {
      const parentName = model.bones.find((b) => b.id === bone.parentId)?.name || 'root';
      output += `\t"${bone.name}"\t${model.bones.indexOf(model.bones.find((b) => b.id === bone.parentId) || { id: 'root' })}\t`;
      output += `( ${bone.position.x} ${bone.position.y} ${bone.position.z} )\t`;
      output += `( ${bone.rotation.x} ${bone.rotation.y} ${bone.rotation.z} )\n`;
    });
    output += '}\n\n';

    // Meshes
    output += 'mesh {\n';
    model.meshes.forEach((mesh, meshIdx) => {
      output += `\tshader "${mesh.material.name}"\n`;
      output += `\tnumverts ${mesh.vertices.length}\n`;

      mesh.vertices.forEach((vert, vertIdx) => {
        output += `\tvert ${vertIdx} ( ${vert.uv.u} ${vert.uv.v} ) 0 1\n`;
      });

      output += `\tnumtris ${mesh.faces.length}\n`;
      mesh.faces.forEach((face, faceIdx) => {
        output += `\ttri ${faceIdx} ${face.indices[0]} ${face.indices[1]} ${face.indices[2]}\n`;
      });

      output += `\tnumweights ${mesh.vertices.length}\n`;
      mesh.vertices.forEach((vert, vertIdx) => {
        const weight = vert.boneWeights?.[0] || { boneId: 0, weight: 1 };
        output += `\tweight ${vertIdx} ${weight.boneId} ${weight.weight} ( ${vert.position.x} ${vert.position.y} ${vert.position.z} )\n`;
      });
    });
    output += '}\n';

    return output;
  }
}

/**
 * glTF Exporter for universal format
 */
export class glTFExporter {
  static export(model: Model): string {
    // Simplified glTF JSON export (binary GLB export would require binary buffer construction)
    const gltf = {
      asset: {
        generator: 'Q3Gen',
        version: '2.0',
      },
      scene: 0,
      scenes: [
        {
          nodes: Array.from({ length: model.meshes.length }, (_, i) => i),
        },
      ],
      nodes: model.meshes.map((mesh, i) => ({
        name: mesh.name,
        mesh: i,
      })),
      meshes: model.meshes.map((mesh) => ({
        name: mesh.name,
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
            },
            indices: 2,
            material: 0,
          },
        ],
      })),
      materials: model.meshes.map((mesh) => ({
        name: mesh.material.name,
        pbrMetallicRoughness: {
          baseColorFactor: [...mesh.material.diffuse, 1.0],
        },
      })),
      accessors: model.meshes.flatMap((mesh) => [
        {
          bufferView: 0,
          componentType: 5126,
          count: mesh.vertices.length,
          type: 'VEC3',
          max: [1, 1, 1],
          min: [-1, -1, -1],
        },
        {
          bufferView: 1,
          componentType: 5126,
          count: mesh.vertices.length,
          type: 'VEC3',
        },
        {
          bufferView: 2,
          componentType: 5125,
          count: mesh.faces.length * 3,
          type: 'SCALAR',
        },
      ]),
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteStride: 12, target: 34962 },
        { buffer: 0, byteOffset: 1024000, byteStride: 12, target: 34962 },
        { buffer: 0, byteOffset: 2048000, target: 34963 },
      ],
      buffers: [
        {
          byteLength: 3072000,
          uri: 'data:application/octet-stream;base64,...',
        },
      ],
    };

    return JSON.stringify(gltf, null, 2);
  }
}
