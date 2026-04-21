import { NextRequest, NextResponse } from 'next/server';
import { validateModel, MD3Exporter, MD5Exporter, glTFExporter } from '@/lib/q3gen';

export async function POST(request: NextRequest) {
  try {
    const { model, format } = await request.json();

    // Validate model
    const validatedModel = validateModel(model);

    let exportData: ArrayBuffer | string;
    let mimeType = 'application/octet-stream';
    let extension = 'bin';

    // Export based on format
    switch (format) {
      case 'md3':
        exportData = MD3Exporter.export(validatedModel);
        mimeType = 'application/octet-stream';
        extension = 'md3';
        break;
      case 'md5':
        exportData = MD5Exporter.export(validatedModel);
        mimeType = 'text/plain';
        extension = 'md5';
        break;
      case 'gltf':
        exportData = glTFExporter.export(validatedModel);
        mimeType = 'application/json';
        extension = 'gltf';
        break;
      case 'pk3':
        exportData = createPK3(validatedModel);
        mimeType = 'application/zip';
        extension = 'pk3';
        break;
      case 'widget':
        exportData = createWidgetHtml(validatedModel);
        mimeType = 'text/html';
        extension = 'html';
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported format: ${format}` },
          { status: 400 }
        );
    }

    // Convert to buffer if needed
    let buffer: BodyInit;
    if (typeof exportData === 'string') {
      buffer = new TextEncoder().encode(exportData);
    } else {
      buffer = exportData;
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="model.${extension}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Export failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 400 }
    );
  }
}

function createWidgetHtml(model: any): string {
  const widgetModel = JSON.stringify(model).replace(/<\//g, '<\\/');
  const title = escapeHtml(model.name || 'Quake 3 Model');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #111827; }
    #q3-widget { width: 100vw; height: 100vh; display: block; }
    .q3-widget-label {
      position: fixed;
      left: 12px;
      bottom: 10px;
      color: rgba(255,255,255,.72);
      font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="q3-widget"></div>
  <div class="q3-widget-label">${title}</div>
  <script id="q3-model-data" type="application/json">${widgetModel}</script>
  <script type="module">
    import * as THREE from 'https://esm.sh/three@0.181.2';
    import { OrbitControls } from 'https://esm.sh/three@0.181.2/examples/jsm/controls/OrbitControls.js';
    import { TGALoader } from 'https://esm.sh/three@0.181.2/examples/jsm/loaders/TGALoader.js';

    const model = JSON.parse(document.getElementById('q3-model-data').textContent);
    const container = document.getElementById('q3-widget');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    scene.add(createGradientSphere());
    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(10, 12, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-6, 4, -8);
    scene.add(fillLight);

    const transform = computeDisplayTransform(model);
    const spinner = new THREE.Group();
    const modelGroup = new THREE.Group();
    modelGroup.quaternion.copy(transform.quaternion);
    modelGroup.position.fromArray(transform.position);
    spinner.add(modelGroup);
    scene.add(spinner);

    buildModel(model, modelGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, Math.max(transform.bounds.max.y * 0.45, 0), 0);

    function resize() {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      fitCamera(camera, transform.bounds);
    }

    window.addEventListener('resize', resize);
    resize();

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      spinner.rotation.y += delta * 0.25;
      scene.traverse(object => {
        if (object.userData.gradientMaterial) {
          object.userData.gradientMaterial.uniforms.uTime.value = elapsed;
        }
      });
      controls.update();
      renderer.render(scene, camera);
    });

    function buildModel(model, parent) {
      const textures = { ...(model.embeddedTextures || {}) };
      (model.meshes || []).forEach(mesh => {
        if (!Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces)) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.vertices.flatMap(v => [v.position.x, v.position.y, v.position.z])), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mesh.vertices.flatMap(v => [v.normal?.x || 0, v.normal?.y || 0, v.normal?.z || 1])), 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(mesh.vertices.flatMap(v => [v.uv?.u || 0, v.uv?.v || 0])), 2));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buildDisplayIndices(mesh)), 1));

        const diffuse = Array.isArray(mesh.material?.diffuse) ? mesh.material.diffuse : [0.8, 0.8, 0.8];
        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(diffuse[0], diffuse[1], diffuse[2]),
          shininess: mesh.material?.shininess || 32,
        });

        const texture = findTexture(mesh.material, textures);
        if (texture) {
          loadTexture(texture, loaded => {
            loaded.colorSpace = THREE.SRGBColorSpace;
            loaded.flipY = false;
            loaded.wrapS = THREE.RepeatWrapping;
            loaded.wrapT = THREE.RepeatWrapping;
            material.map = loaded;
            material.color.set(0xffffff);
            material.needsUpdate = true;
          });
        }

        parent.add(new THREE.Mesh(geometry, material));
      });
    }

    function createGradientSphere() {
      const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec3 vPosition; void main(){ vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uTime; varying vec3 vPosition; vec3 palette(float t){ return 0.5 + 0.5 * cos(6.28318 * (vec3(0.00,0.28,0.58)+t)); } void main(){ vec3 d=normalize(vPosition); float vertical=d.y*0.5+0.5; float horizon=pow(1.0-abs(d.y),2.0); float cycle=uTime*0.035; vec3 top=palette(cycle+0.06)*0.55; vec3 middle=palette(cycle+0.22)*0.38; vec3 bottom=palette(cycle+0.42)*0.22; vec3 color=mix(bottom,top,vertical); color += middle*horizon; color *= 0.78 + 0.22 * pow(max(d.y,0.0),2.0); gl_FragColor=vec4(color,1.0); }',
      });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(180, 48, 32), material);
      sphere.userData.gradientMaterial = material;
      return sphere;
    }

    function fitCamera(camera, bounds) {
      const center = new THREE.Vector3().addVectors(bounds.min, bounds.max).multiplyScalar(0.5);
      const size = new THREE.Vector3().subVectors(bounds.max, bounds.min);
      const maxSize = Math.max(size.x, size.y, size.z, 1);
      const distance = (maxSize * 1.35) / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(center.x + distance * 0.55, center.y + distance * 0.32, center.z + distance * 0.75);
      camera.lookAt(center);
    }

    function computeDisplayTransform(model) {
      const sourceBounds = computeModelBounds(model);
      const up = inferUpVector(model, sourceBounds);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
      const transformedBounds = transformBounds(sourceBounds, quaternion);
      const position = [
        -((transformedBounds.min.x + transformedBounds.max.x) / 2),
        -transformedBounds.min.y,
        -((transformedBounds.min.z + transformedBounds.max.z) / 2),
      ];
      const offset = new THREE.Vector3(...position);
      return {
        quaternion,
        position,
        bounds: { min: transformedBounds.min.clone().add(offset), max: transformedBounds.max.clone().add(offset) },
      };
    }

    function computeModelBounds(model) {
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      (model.meshes || []).forEach(mesh => (mesh.vertices || []).forEach(vertex => {
        if (!vertex.position) return;
        const point = new THREE.Vector3(vertex.position.x, vertex.position.y, vertex.position.z);
        min.min(point);
        max.max(point);
      }));
      if (!Number.isFinite(min.x)) return { min: new THREE.Vector3(-0.5, 0, -0.5), max: new THREE.Vector3(0.5, 1, 0.5) };
      return { min, max };
    }

    function inferUpVector(model, bounds) {
      const tagUp = inferTagUpVector(model);
      if (tagUp) return tagUp;
      const size = new THREE.Vector3().subVectors(bounds.max, bounds.min);
      if (size.x >= size.y && size.x >= size.z) return new THREE.Vector3(1, 0, 0);
      if (size.y >= size.x && size.y >= size.z) return new THREE.Vector3(0, 1, 0);
      return new THREE.Vector3(0, 0, 1);
    }

    function inferTagUpVector(model) {
      const tags = model.tags || [];
      const head = tags.find(tag => String(tag.name || '').toLowerCase().includes('tag_head'));
      const torso = tags.find(tag => String(tag.name || '').toLowerCase().includes('tag_torso'));
      if (!head?.position || !torso?.position) return null;
      const vector = new THREE.Vector3(head.position.x - torso.position.x, head.position.y - torso.position.y, head.position.z - torso.position.z);
      if (vector.lengthSq() < 1e-6) return null;
      const axis = dominantSignedAxis(vector);
      if (Math.abs(axis.x) === 1) axis.x *= -1;
      return axis.normalize();
    }

    function dominantSignedAxis(vector) {
      const ax = Math.abs(vector.x), ay = Math.abs(vector.y), az = Math.abs(vector.z);
      if (ax >= ay && ax >= az) return new THREE.Vector3(Math.sign(vector.x) || 1, 0, 0);
      if (ay >= ax && ay >= az) return new THREE.Vector3(0, Math.sign(vector.y) || 1, 0);
      return new THREE.Vector3(0, 0, Math.sign(vector.z) || 1);
    }

    function transformBounds(bounds, quaternion) {
      const corners = [
        new THREE.Vector3(bounds.min.x,bounds.min.y,bounds.min.z), new THREE.Vector3(bounds.min.x,bounds.min.y,bounds.max.z),
        new THREE.Vector3(bounds.min.x,bounds.max.y,bounds.min.z), new THREE.Vector3(bounds.min.x,bounds.max.y,bounds.max.z),
        new THREE.Vector3(bounds.max.x,bounds.min.y,bounds.min.z), new THREE.Vector3(bounds.max.x,bounds.min.y,bounds.max.z),
        new THREE.Vector3(bounds.max.x,bounds.max.y,bounds.min.z), new THREE.Vector3(bounds.max.x,bounds.max.y,bounds.max.z),
      ].map(point => point.applyQuaternion(quaternion));
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      corners.forEach(point => { min.min(point); max.max(point); });
      return { min, max };
    }

    function findTexture(material, textures) {
      const candidates = [material?.texturePath, material?.texture, material?.diffuseMap, material?.name]
        .filter(Boolean)
        .flatMap(getTextureCandidates);
      for (const key of candidates) if (textures[key]) return textures[key];
      return null;
    }

    function getTextureCandidates(value) {
      const normalized = String(value).toLowerCase().replace(/\\\\/g, '/').replace(/^\\/+/, '');
      const withoutExtension = normalized.replace(/\\.[^/.]+$/, '');
      const fileName = normalized.split('/').pop() || normalized;
      const baseName = fileName.replace(/\\.[^/.]+$/, '');
      return Array.from(new Set([normalized, withoutExtension, fileName, baseName].filter(Boolean)));
    }

    function loadTexture(texture, onLoad) {
      const isTga = texture.type === 'image/x-tga' || String(texture.name || '').toLowerCase().endsWith('.tga');
      const loader = isTga ? new TGALoader() : new THREE.TextureLoader();
      loader.load(texture.sourceUrl || texture.url, onLoad);
    }

    function buildDisplayIndices(mesh) {
      const shouldReverse = hasReversedWinding(mesh);
      return (mesh.faces || []).flatMap(face => {
        const indices = face.indices || [];
        return shouldReverse ? [indices[0], indices[2], indices[1]] : [indices[0], indices[1], indices[2]];
      });
    }

    function hasReversedWinding(mesh) {
      const vertices = mesh.vertices || [];
      let vote = 0, samples = 0;
      for (const face of mesh.faces || []) {
        const [i0, i1, i2] = face.indices || [];
        const v0 = vertices[i0], v1 = vertices[i1], v2 = vertices[i2];
        if (!v0?.position || !v1?.position || !v2?.position || !v0?.normal || !v1?.normal || !v2?.normal) continue;
        const e1 = { x: v1.position.x - v0.position.x, y: v1.position.y - v0.position.y, z: v1.position.z - v0.position.z };
        const e2 = { x: v2.position.x - v0.position.x, y: v2.position.y - v0.position.y, z: v2.position.z - v0.position.z };
        const n = { x: e1.y * e2.z - e1.z * e2.y, y: e1.z * e2.x - e1.x * e2.z, z: e1.x * e2.y - e1.y * e2.x };
        const vn = { x: v0.normal.x + v1.normal.x + v2.normal.x, y: v0.normal.y + v1.normal.y + v2.normal.y, z: v0.normal.z + v1.normal.z + v2.normal.z };
        const dot = n.x * vn.x + n.y * vn.y + n.z * vn.z;
        if (Math.abs(dot) < 1e-6) continue;
        vote += dot < 0 ? 1 : -1;
        samples++;
      }
      return samples > 0 && vote > 0;
    }
  </script>
</body>
</html>`;
}

interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

interface TextureAsset {
  name: string;
  url: string;
  type: string;
  sourceName?: string;
  sourceUrl?: string;
}

function createPK3(model: any): ArrayBuffer {
  const modelPath = `models/players/${sanitizePathSegment(model.name || model.id || 'model')}/model.md3`;
  const entries: ArchiveEntry[] = [
    {
      name: modelPath,
      data: new Uint8Array(MD3Exporter.export(model)),
    },
  ];

  getExportTextures(model).forEach(texture => {
    const dataUrl = texture.sourceUrl || texture.url;
    const data = dataUrlToBytes(dataUrl);

    if (data) {
      entries.push({
        name: normalizeArchivePath(texture.sourceName || texture.name),
        data,
      });
    }
  });

  return writeZip(entries);
}

function getExportTextures(model: any): TextureAsset[] {
  const textures = (model.embeddedTextures || {}) as Record<string, TextureAsset>;
  const materialPaths = new Set<string>();
  const seen = new Set<string>();
  const result: TextureAsset[] = [];

  if (Array.isArray(model.meshes)) {
    model.meshes.forEach((mesh: any) => {
      const texturePath = mesh.material?.texturePath || mesh.material?.name;
      if (texturePath) {
        getTextureKeys(texturePath).forEach(key => materialPaths.add(key));
      }
    });
  }

  Object.values(textures).forEach(texture => {
    const textureName = texture.sourceName || texture.name;
    const keys = getTextureKeys(textureName);
    const matchesMaterial = keys.some(key => materialPaths.has(key));

    if (!matchesMaterial) {
      return;
    }

    const archiveName = normalizeArchivePath(textureName);
    if (!archiveName || seen.has(archiveName)) {
      return;
    }

    seen.add(archiveName);
    result.push(texture);
  });

  return result;
}

function dataUrlToBytes(url: string | undefined): Uint8Array | null {
  if (!url) return null;

  const match = url.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return null;

  return new Uint8Array(Buffer.from(match[1], 'base64'));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function writeZip(entries: ArchiveEntry[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach(entry => {
    const nameBytes = encoder.encode(normalizeArchivePath(entry.name));
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + nameBytes.byteLength + entry.data.byteLength);
    const localView = new DataView(local.buffer);

    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, entry.data.byteLength);
    writeUint32(localView, 22, entry.data.byteLength);
    writeUint16(localView, 26, nameBytes.byteLength);
    writeUint16(localView, 28, 0);
    local.set(nameBytes, 30);
    local.set(entry.data, 30 + nameBytes.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(central.buffer);

    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, entry.data.byteLength);
    writeUint32(centralView, 24, entry.data.byteLength);
    writeUint16(centralView, 28, nameBytes.byteLength);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.byteLength;
  });

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);

  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, centralOffset);
  writeUint16(endView, 20, 0);

  const output = new Uint8Array(centralOffset + centralSize + end.byteLength);
  let targetOffset = 0;

  [...localParts, ...centralParts, end].forEach(part => {
    output.set(part, targetOffset);
    targetOffset += part.byteLength;
  });

  return output.buffer;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let index = 0; index < data.byteLength; index++) {
    crc = CRC32_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function getTextureKeys(value: string): string[] {
  if (!value) return [];

  const normalized = normalizeArchivePath(value);
  const withoutExtension = normalized.replace(/\.[^/.]+$/, '');
  const fileName = normalized.split('/').pop() || normalized;
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  return Array.from(new Set([normalized, withoutExtension, fileName, baseName].filter(Boolean)));
}

function normalizeArchivePath(value: string): string {
  return value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\.+/g, '.');
}

function sanitizePathSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'model';
}
