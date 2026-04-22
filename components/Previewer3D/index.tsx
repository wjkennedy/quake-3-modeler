'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';

interface Previewer3DProps {
  modelJson: string;
  selectedAnimation: string;
  textures?: Record<string, TextureAsset>;
}

interface TextureAsset {
  name: string;
  url: string;
  type: string;
  sourceName?: string;
  sourceUrl?: string;
  previewUrl?: string;
}

type AxisSwap = 'none' | 'xy' | 'xz' | 'yz';

interface DisplayTransform {
  quaternion: THREE.Quaternion;
  matrix: THREE.Matrix4;
  position: [number, number, number];
  bounds: {
    min: THREE.Vector3;
    max: THREE.Vector3;
  };
}

const previewTextureCache = new Map<string, Promise<THREE.Texture>>();

function ModelMesh({ model, textures }: { model: any; textures: Record<string, TextureAsset> }) {
  const meshRef = useRef<THREE.Group>(null);
  const [wireframe, setWireframe] = useState(false);

  useEffect(() => {
    if (!model.meshes || model.meshes.length === 0) return;
    if (!meshRef.current) return;

    meshRef.current.clear();
    const createdMaterials: THREE.Material[] = [];
    let cancelled = false;

    model.meshes.forEach((meshData: any) => {
      if (!Array.isArray(meshData.vertices) || !Array.isArray(meshData.faces) || meshData.vertices.length === 0 || meshData.faces.length === 0) {
        return;
      }

      const geometry = new THREE.BufferGeometry();

      const positions = meshData.vertices.flatMap((v: any) => [v.position.x, v.position.y, v.position.z]);
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));

      const normals = meshData.vertices.flatMap((v: any) => [v.normal.x, v.normal.y, v.normal.z]);
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));

      const uvs = meshData.vertices.flatMap((v: any) => [v.uv?.u ?? 0, v.uv?.v ?? 0]);
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));

      const indices = buildDisplayIndices(meshData);
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

      const material = meshData.material;
      const diffuse = Array.isArray(material.diffuse) ? material.diffuse : [0.8, 0.8, 0.8];
      const texture = findTexture(material, textures);
      const meshMaterial = new THREE.MeshPhongMaterial({
        color: new THREE.Color(diffuse[0], diffuse[1], diffuse[2]),
        emissive: material.emissive ? new THREE.Color(material.emissive[0], material.emissive[1], material.emissive[2]) : 0x000000,
        shininess: material.shininess || 32,
        wireframe,
      });
      createdMaterials.push(meshMaterial);

      if (texture) {
        loadTexture(texture, loadedTexture => {
          if (cancelled) {
            return;
          }

          loadedTexture.colorSpace = THREE.SRGBColorSpace;
          loadedTexture.flipY = false;
          loadedTexture.wrapS = THREE.RepeatWrapping;
          loadedTexture.wrapT = THREE.RepeatWrapping;
          meshMaterial.map = loadedTexture;
          meshMaterial.color.set(0xffffff);
          meshMaterial.needsUpdate = true;
        });
      }

      const threeMesh = new THREE.Mesh(geometry, meshMaterial);
      meshRef.current?.add(threeMesh);
    });

    return () => {
      cancelled = true;
      if (meshRef.current) {
        meshRef.current.clear();
      }
      createdMaterials.forEach(material => material.dispose());
    };
  }, [model, textures, wireframe]);

  return <group ref={meshRef} />;
}

function BoneSkeleton({ model }: { model: any }) {
  const skeletonRef = useRef<THREE.Group>(null);

  useMemo(() => {
    if (!model.bones || model.bones.length === 0) return;

    const boneMap = new Map<string, THREE.Bone>();

    // Create bones
    model.bones.forEach((boneData: any) => {
      const bone = new THREE.Bone();
      bone.position.set(boneData.position.x, boneData.position.y, boneData.position.z);
      bone.quaternion.set(boneData.rotation.x, boneData.rotation.y, boneData.rotation.z, boneData.rotation.w);
      bone.scale.set(boneData.scale?.x || 1, boneData.scale?.y || 1, boneData.scale?.z || 1);
      boneMap.set(boneData.id, bone);
    });

    // Build hierarchy
    model.bones.forEach((boneData: any) => {
      const bone = boneMap.get(boneData.id);
      if (bone && boneData.parentId) {
        const parent = boneMap.get(boneData.parentId);
        if (parent) {
          parent.add(bone);
        }
      } else if (bone && skeletonRef.current) {
        skeletonRef.current.add(bone);
      }
    });

    return () => {
      if (skeletonRef.current) {
        skeletonRef.current.clear();
      }
    };
  }, [model]);

  return (
    <group ref={skeletonRef}>
      {model.bones?.map((bone: any) => (
        <BoneVisualization key={bone.id} bone={bone} />
      ))}
    </group>
  );
}

function BoneVisualization({ bone }: { bone: any }) {
  return (
    <group position={[bone.position.x, bone.position.y, bone.position.z]}>
      <mesh>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={0xff6b00} />
      </mesh>
    </group>
  );
}

function PreviewModel({
  model,
  textures,
  transform,
}: {
  model: any;
  textures: Record<string, TextureAsset>;
  transform: DisplayTransform;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.rotation.y += delta * 0.25;
  });

  return (
    <group ref={groupRef}>
      <group matrix={transform.matrix} matrixAutoUpdate={false}>
        <ModelMesh model={model} textures={textures} />
        <BoneSkeleton model={model} />
      </group>
    </group>
  );
}

function GradientSphere() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    <mesh scale={180}>
      <sphereGeometry args={[1, 48, 32]} />
      <shaderMaterial
        ref={materialRef}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          varying vec3 vPosition;

          void main() {
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec3 vPosition;

          vec3 palette(float t) {
            return 0.5 + 0.5 * cos(6.28318 * (vec3(0.00, 0.28, 0.58) + t));
          }

          void main() {
            vec3 direction = normalize(vPosition);
            float vertical = direction.y * 0.5 + 0.5;
            float horizon = pow(1.0 - abs(direction.y), 2.0);
            float cycle = uTime * 0.035;
            vec3 top = palette(cycle + 0.06) * 0.55;
            vec3 middle = palette(cycle + 0.22) * 0.38;
            vec3 bottom = palette(cycle + 0.42) * 0.22;
            vec3 color = mix(bottom, top, vertical);
            color += middle * horizon;
            color *= 0.78 + 0.22 * pow(max(direction.y, 0.0), 2.0);
            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}

function SceneContent({ model, textures, axisSwap }: { model: any; textures: Record<string, TextureAsset>; axisSwap: AxisSwap }) {
  const { camera } = useThree();
  const displayTransform = useMemo(() => computeDisplayTransform(model, axisSwap), [model, axisSwap]);

  // Auto-fit camera to model bounds
  useMemo(() => {
    const bounds = displayTransform.bounds;
    const minX = bounds.min.x;
    const minY = bounds.min.y;
    const minZ = bounds.min.z;
    const maxX = bounds.max.x;
    const maxY = bounds.max.y;
    const maxZ = bounds.max.z;

    if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ, 1);
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
    const distance = (maxSize * 1.35) / Math.tan((fov * Math.PI) / 360);

    camera.position.set(centerX + distance * 0.55, centerY + distance * 0.32, centerZ + distance * 0.75);
    camera.lookAt(centerX, centerY, centerZ);
  }, [displayTransform, camera]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.5, 3]} />
      <color attach="background" args={['#111827']} />
      <GradientSphere />
      <ambientLight intensity={0.62} />
      <directionalLight position={[10, 12, 8]} intensity={1.1} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <directionalLight position={[-6, 4, -8]} intensity={0.35} />

      <PreviewModel model={model} textures={textures} transform={displayTransform} />
      <Environment preset="studio" environmentIntensity={0.35} />
      <OrbitControls target={[0, Math.max(displayTransform.bounds.max.y * 0.45, 0), 0]} />
    </>
  );
}

export function Previewer3D({ modelJson, selectedAnimation, textures = {} }: Previewer3DProps) {
  const [axisSwap, setAxisSwap] = useState<AxisSwap>('none');
  const model = useMemo(() => {
    try {
      return JSON.parse(modelJson);
    } catch {
      return null;
    }
  }, [modelJson]);
  const resolvedTextures = useMemo(() => ({ ...textures, ...(model?.embeddedTextures || {}) }), [model, textures]);

  if (!model) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Invalid model JSON
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded bg-background/80 px-2 py-1 text-xs shadow">
        <label htmlFor="axis-swap" className="text-muted-foreground">Axes</label>
        <select
          id="axis-swap"
          value={axisSwap}
          onChange={event => setAxisSwap(event.target.value as AxisSwap)}
          className="rounded border border-border bg-background px-1 py-0.5"
        >
          <option value="none">Normal</option>
          <option value="xy">Swap X/Y</option>
          <option value="xz">Swap X/Z</option>
          <option value="yz">Swap Y/Z</option>
        </select>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading 3D viewer...
          </div>
        }
      >
        <Canvas>
          <SceneContent model={model} textures={resolvedTextures} axisSwap={axisSwap} />
        </Canvas>
      </Suspense>
    </div>
  );
}

function findTexture(material: any, textures: Record<string, TextureAsset>): TextureAsset | null {
  const candidates = [material?.texturePath, material?.texture, material?.diffuseMap, material?.name]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .flatMap(getTextureCandidates);

  for (const key of candidates) {
    const texture = textures[key];
    if (texture) return texture;
  }

  return null;
}

function getTextureCandidates(value: string): string[] {
  const normalized = value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
  const withoutExtension = normalized.replace(/\.[^/.]+$/, '');
  const fileName = normalized.split('/').pop() || normalized;
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const hasDirectory = normalized.includes('/');
  const candidates = [normalized, withoutExtension];

  if (!/\.[^/.]+$/.test(normalized)) {
    ['.png', '.jpg', '.jpeg', '.tga', '.webp'].forEach(extension => {
      candidates.push(`${normalized}${extension}`);
    });
  }

  if (!hasDirectory) {
    candidates.push(fileName, baseName);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function loadTexture(texture: TextureAsset, onLoad: (texture: THREE.Texture) => void) {
  const candidates = getTextureLoadCandidates(texture);
  if (!candidates.length) {
    return;
  }

  loadFirstAvailableTexture(candidates).then(onLoad).catch(() => {
    // Missing original MD3 texture paths and stale object URLs are expected while
    // users are replacing material slots. Keep the mesh on its diffuse fallback.
  });
}

async function loadFirstAvailableTexture(candidates: TextureLoadCandidate[]): Promise<THREE.Texture> {
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return await loadCachedTexture(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No texture candidates loaded');
}

function loadCachedTexture(candidate: TextureLoadCandidate): Promise<THREE.Texture> {
  const cached = previewTextureCache.get(candidate.url);
  if (cached) {
    return cached;
  }

  const loader = candidate.useTgaLoader ? new TGALoader() : new THREE.TextureLoader();
  const pending = new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(candidate.url, resolve, undefined, reject);
  }).catch(error => {
    previewTextureCache.delete(candidate.url);
    throw error;
  });

  previewTextureCache.set(candidate.url, pending);
  return pending;
}

interface TextureLoadCandidate {
  url: string;
  useTgaLoader: boolean;
}

function getTextureLoadCandidates(texture: TextureAsset): TextureLoadCandidate[] {
  const isTga = texture.type === 'image/x-tga' || texture.name.toLowerCase().endsWith('.tga');
  const candidates: TextureLoadCandidate[] = [];

  if (isTga && texture.previewUrl && isLoadableUrl(texture.previewUrl)) {
    candidates.push({ url: texture.previewUrl, useTgaLoader: false });
  }

  [texture.sourceUrl, texture.url, texture.previewUrl].forEach(url => {
    if (!url || !isLoadableUrl(url)) {
      return;
    }

    candidates.push({ url, useTgaLoader: isTga && !isPreviewImageUrl(url) });
  });

  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.url)) {
      return false;
    }
    seen.add(candidate.url);
    return true;
  });
}

function isLoadableUrl(url: string): boolean {
  return /^(blob:|data:|https?:\/\/|\/)/i.test(url);
}

function isPreviewImageUrl(url: string): boolean {
  return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml)/i.test(url);
}

function computeDisplayTransform(model: any, axisSwap: AxisSwap = 'none'): DisplayTransform {
  const sourceBounds = computeModelBounds(model);
  const upVector = inferModelUpVector(model, sourceBounds);
  const rightingQuaternion = new THREE.Quaternion().setFromUnitVectors(upVector, new THREE.Vector3(0, 1, 0));
  const swapMatrix = createAxisSwapMatrix(axisSwap);
  const transformMatrix = new THREE.Matrix4().makeRotationFromQuaternion(rightingQuaternion).premultiply(swapMatrix);
  const transformedBounds = transformBounds(sourceBounds, transformMatrix);
  const centerX = (transformedBounds.min.x + transformedBounds.max.x) / 2;
  const centerZ = (transformedBounds.min.z + transformedBounds.max.z) / 2;
  const position: [number, number, number] = [
    -centerX,
    -transformedBounds.min.y,
    -centerZ,
  ];
  const translatedMatrix = transformMatrix.clone().premultiply(new THREE.Matrix4().makeTranslation(position[0], position[1], position[2]));
  const displayBounds = {
    min: transformedBounds.min.clone().add(new THREE.Vector3(...position)),
    max: transformedBounds.max.clone().add(new THREE.Vector3(...position)),
  };

  return {
    quaternion: rightingQuaternion,
    matrix: translatedMatrix,
    position,
    bounds: displayBounds,
  };
}

function computeModelBounds(model: any): { min: THREE.Vector3; max: THREE.Vector3 } {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  if (Array.isArray(model?.meshes)) {
    model.meshes.forEach((mesh: any) => {
      if (!Array.isArray(mesh?.vertices)) {
        return;
      }

      mesh.vertices.forEach((vertex: any) => {
        if (!vertex?.position) {
          return;
        }

        const point = new THREE.Vector3(vertex.position.x, vertex.position.y, vertex.position.z);
        min.min(point);
        max.max(point);
      });
    });
  }

  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
    return {
      min: new THREE.Vector3(-0.5, 0, -0.5),
      max: new THREE.Vector3(0.5, 1, 0.5),
    };
  }

  return { min, max };
}

function inferModelUpVector(model: any, bounds: { min: THREE.Vector3; max: THREE.Vector3 }): THREE.Vector3 {
  const tagUp = inferTagUpVector(model);
  if (tagUp) {
    return tagUp;
  }

  const size = new THREE.Vector3().subVectors(bounds.max, bounds.min);
  const candidates = [
    { axis: new THREE.Vector3(1, 0, 0), magnitude: size.x },
    { axis: new THREE.Vector3(0, 1, 0), magnitude: size.y },
    { axis: new THREE.Vector3(0, 0, 1), magnitude: size.z },
  ].sort((a, b) => b.magnitude - a.magnitude);

  return candidates[0]?.axis.clone().normalize() || new THREE.Vector3(0, 1, 0);
}

function inferTagUpVector(model: any): THREE.Vector3 | null {
  if (!Array.isArray(model?.tags)) {
    return null;
  }

  const headTag = model.tags.find((tag: any) => String(tag?.name || '').toLowerCase().includes('tag_head'));
  const torsoTag = model.tags.find((tag: any) => String(tag?.name || '').toLowerCase().includes('tag_torso'));

  if (!headTag?.position || !torsoTag?.position) {
    return null;
  }

  const vector = new THREE.Vector3(
    headTag.position.x - torsoTag.position.x,
    headTag.position.y - torsoTag.position.y,
    headTag.position.z - torsoTag.position.z
  );

  if (vector.lengthSq() < 1e-6) {
    return null;
  }

  const dominantAxis = dominantSignedAxis(vector);
  if (Math.abs(dominantAxis.x) === 1) {
    dominantAxis.x *= -1;
  }
  return dominantAxis.normalize();
}

function dominantSignedAxis(vector: THREE.Vector3): THREE.Vector3 {
  const absX = Math.abs(vector.x);
  const absY = Math.abs(vector.y);
  const absZ = Math.abs(vector.z);

  if (absX >= absY && absX >= absZ) {
    return new THREE.Vector3(Math.sign(vector.x) || 1, 0, 0);
  }
  if (absY >= absX && absY >= absZ) {
    return new THREE.Vector3(0, Math.sign(vector.y) || 1, 0);
  }
  return new THREE.Vector3(0, 0, Math.sign(vector.z) || 1);
}

function createAxisSwapMatrix(axisSwap: AxisSwap): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();

  switch (axisSwap) {
    case 'xy':
      return matrix.set(
        0, 1, 0, 0,
        1, 0, 0, 0,
        0, 0, -1, 0,
        0, 0, 0, 1
      );
    case 'xz':
      return matrix.set(
        0, 0, 1, 0,
        0, -1, 0, 0,
        1, 0, 0, 0,
        0, 0, 0, 1
      );
    case 'yz':
      return matrix.set(
        -1, 0, 0, 0,
        0, 0, 1, 0,
        0, 1, 0, 0,
        0, 0, 0, 1
      );
    case 'none':
    default:
      return matrix.identity();
  }
}

function transformBounds(bounds: { min: THREE.Vector3; max: THREE.Vector3 }, matrix: THREE.Matrix4): { min: THREE.Vector3; max: THREE.Vector3 } {
  const corners = [
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
  ].map(point => point.applyMatrix4(matrix));
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  corners.forEach(point => {
    min.min(point);
    max.max(point);
  });

  return { min, max };
}

function buildDisplayIndices(meshData: any): number[] {
  const faces = Array.isArray(meshData.faces) ? meshData.faces : [];
  const shouldReverse = hasReversedWinding(meshData);

  return faces.flatMap((face: any) => {
    const indices = Array.isArray(face.indices) ? face.indices : [];
    if (indices.length < 3) return [];

    return shouldReverse
      ? [indices[0], indices[2], indices[1]]
      : [indices[0], indices[1], indices[2]];
  });
}

function hasReversedWinding(meshData: any): boolean {
  const vertices = Array.isArray(meshData.vertices) ? meshData.vertices : [];
  const faces = Array.isArray(meshData.faces) ? meshData.faces : [];
  let vote = 0;
  let samples = 0;

  for (const face of faces) {
    const [i0, i1, i2] = Array.isArray(face.indices) ? face.indices : [];
    const v0 = vertices[i0];
    const v1 = vertices[i1];
    const v2 = vertices[i2];

    if (!v0?.position || !v1?.position || !v2?.position || !v0?.normal || !v1?.normal || !v2?.normal) {
      continue;
    }

    const edge1 = {
      x: v1.position.x - v0.position.x,
      y: v1.position.y - v0.position.y,
      z: v1.position.z - v0.position.z,
    };
    const edge2 = {
      x: v2.position.x - v0.position.x,
      y: v2.position.y - v0.position.y,
      z: v2.position.z - v0.position.z,
    };
    const faceNormal = {
      x: edge1.y * edge2.z - edge1.z * edge2.y,
      y: edge1.z * edge2.x - edge1.x * edge2.z,
      z: edge1.x * edge2.y - edge1.y * edge2.x,
    };
    const vertexNormal = {
      x: v0.normal.x + v1.normal.x + v2.normal.x,
      y: v0.normal.y + v1.normal.y + v2.normal.y,
      z: v0.normal.z + v1.normal.z + v2.normal.z,
    };
    const dot = faceNormal.x * vertexNormal.x + faceNormal.y * vertexNormal.y + faceNormal.z * vertexNormal.z;

    if (Math.abs(dot) < 1e-6) {
      continue;
    }

    vote += dot < 0 ? 1 : -1;
    samples++;
  }

  return samples > 0 && vote > 0;
}
