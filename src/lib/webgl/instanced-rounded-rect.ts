// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import { WebGLManager } from './webgl';

export interface RoundedRectInstance {
  centerX: number;
  centerY: number;
  z: number;
  width: number;
  height: number;
  radius: number;
  borderWidth: number;
  fillR: number;
  fillG: number;
  fillB: number;
  fillA: number;
  borderR: number;
  borderG: number;
  borderB: number;
  borderA: number;
}

export class InstancedRoundedRectManager extends WebGLManager {
  public mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private instanceCount = 0;
  private capacity = 0;

  private aSize: THREE.InstancedBufferAttribute | null = null; // vec2
  private aRadius: THREE.InstancedBufferAttribute | null = null; // float
  private aBorderWidth: THREE.InstancedBufferAttribute | null = null; // float
  private aFillColor: THREE.InstancedBufferAttribute | null = null; // vec4
  private aBorderColor: THREE.InstancedBufferAttribute | null = null; // vec4

  private createMaterial(): THREE.ShaderMaterial {
    const vertexShader = `
      attribute vec2 aSize;
      attribute float aRadius;
      attribute float aBorderWidth;
      attribute vec4 aFillColor;
      attribute vec4 aBorderColor;
      varying vec2 vLocal;
      varying vec2 vHalfSize;
      varying float vRadius;
      varying float vBorderWidth;
      varying vec4 vFillColor;
      varying vec4 vBorderColor;
      void main() {
        // local rect-space coords for SDF
        vLocal = position.xy * aSize;
        vHalfSize = aSize * 0.5;
        vRadius = aRadius;
        vBorderWidth = aBorderWidth;
        vFillColor = aFillColor;
        vBorderColor = aBorderColor;
        // final position: instanceMatrix includes translation and scale
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;


      varying vec2 vLocal;
      varying vec2 vHalfSize;
      varying float vRadius;
      varying float vBorderWidth;
      varying vec4 vFillColor;
      varying vec4 vBorderColor;
      uniform float uBorderScale;

      float sdRoundRect(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - (b - vec2(r));
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }

      void main() {
        float r = clamp(vRadius, 0.0, min(vHalfSize.x, vHalfSize.y));
        float bw = clamp(vBorderWidth, 0.0, min(vHalfSize.x, vHalfSize.y));
        bw = max(bw * uBorderScale, 0.0001);

        // Single signed-distance and coverage-based AA (previous behavior)
        float d = sdRoundRect(vLocal, vHalfSize, r);
        float aa = max(fwidth(d), 1e-4);
        float shapeCov = 1.0 - smoothstep(0.0, aa, d);
        // Fill fully inside the border width (d <= -bw)
        float fillMask = 1.0 - smoothstep(-bw, -bw + aa, d);
        fillMask = clamp(fillMask, 0.0, 1.0);
        float borderMask = clamp(shapeCov - fillMask, 0.0, 1.0);
        if (shapeCov <= 0.0) discard;

        // Porter-Duff: border over fill, to avoid fill tinting border
        float fillAlpha = fillMask * vFillColor.a;
        float borderAlpha = borderMask * vBorderColor.a;
        float outAlpha = borderAlpha + fillAlpha * (1.0 - borderAlpha);
        if (outAlpha <= 0.0) discard;
        // Compose in linear
        vec3 premul = vBorderColor.rgb * borderAlpha + vFillColor.rgb * fillAlpha * (1.0 - borderAlpha);
        gl_FragColor = vec4(premul / max(outAlpha, 1e-6), outAlpha);
        gl_FragColor = linearToOutputTexel(gl_FragColor);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    material.side = THREE.DoubleSide;
    material.toneMapped = false;
    // @ts-expect-error types are missing, but enabled standard derivatives for fwidth AA
    material.extensions = { ...material.extensions, derivatives: true };
    material.uniforms = {
      uBorderScale: { value: 1.4 },
    };
    this.registerDisposable(material);
    return material;
  }

  private ensureCapacity(capacity: number): void {
    if (capacity <= this.capacity && this.mesh) return;

    // Dispose old resources
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    this.capacity = capacity;

    const geom = new THREE.PlaneGeometry(1, 1, 1, 1).toNonIndexed();
    const pos = geom.getAttribute('position') as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2 + 0] = pos.getX(i);
      uv[i * 2 + 1] = pos.getY(i);
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    // Instanced attributes
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    this.aRadius = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.aBorderWidth = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.aFillColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aBorderColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);

    geom.setAttribute('aSize', this.aSize);
    geom.setAttribute('aRadius', this.aRadius);
    geom.setAttribute('aBorderWidth', this.aBorderWidth);
    geom.setAttribute('aFillColor', this.aFillColor);
    geom.setAttribute('aBorderColor', this.aBorderColor);

    const material = this.createMaterial();
    const mesh = new THREE.InstancedMesh(geom, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.registerDisposable(geom, material);
  }

  begin(instanceCount: number): void {
    this.ensureCapacity(instanceCount);
    this.instanceCount = instanceCount;
    if (this.mesh) {
      this.mesh.count = instanceCount;
    }
  }

  setInstance(index: number, data: RoundedRectInstance): void {
    if (
      !this.mesh ||
      !this.aSize ||
      !this.aRadius ||
      !this.aBorderWidth ||
      !this.aFillColor ||
      !this.aBorderColor
    ) {
      return;
    }
    if (index >= this.capacity) throw new Error('instance index out of range');

    this.aSize.setXY(index, data.width, data.height);
    this.aRadius.setX(index, data.radius);
    this.aBorderWidth.setX(index, data.borderWidth);
    this.aFillColor.setXYZW(index, data.fillR, data.fillG, data.fillB, data.fillA);
    this.aBorderColor.setXYZW(index, data.borderR, data.borderG, data.borderB, data.borderA);

    // instance matrix: scale + translation
    const translation = new THREE.Vector3(data.centerX, data.centerY, data.z);
    const scale = new THREE.Vector3(data.width, data.height, 1);
    const quat = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    m.compose(translation, quat, scale);
    this.mesh.setMatrixAt(index, m);
  }

  end(): void {
    if (
      !this.mesh ||
      !this.aSize ||
      !this.aRadius ||
      !this.aBorderWidth ||
      !this.aFillColor ||
      !this.aBorderColor
    ) {
      return;
    }
    this.aSize.needsUpdate = true;
    this.aRadius.needsUpdate = true;
    this.aBorderWidth.needsUpdate = true;
    this.aFillColor.needsUpdate = true;
    this.aBorderColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  updateBorder(
    index: number,
    borderWidth: number,
    borderColor: { r: number; g: number; b: number; a: number },
  ): void {
    if (!this.mesh || !this.aBorderWidth || !this.aBorderColor) return;
    this.aBorderWidth.setX(index, borderWidth);
    this.aBorderColor.setXYZW(index, borderColor.r, borderColor.g, borderColor.b, borderColor.a);
    this.aBorderWidth.needsUpdate = true;
    this.aBorderColor.needsUpdate = true;
  }
}
