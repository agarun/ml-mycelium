// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import { WebGLManager } from './webgl';

export class InstancedArrowManager extends WebGLManager {
  public mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  private capacity = 0;
  private material: THREE.MeshBasicMaterial;

  constructor(material: THREE.MeshBasicMaterial) {
    super();
    // Clone to ensure independent lifecycle if needed
    this.material = material;
  }

  private ensureCapacity(capacity: number): void {
    if (this.mesh && capacity <= this.capacity) return;

    if (this.mesh) {
      this.mesh.geometry.dispose();
      // material lifecycle managed outside
    }

    this.capacity = capacity;

    // Base triangle (arrow) pointing +X in local space; size ~ (length=8, width=5)
    const length = 8;
    const width = 5;
    const vertices = new Float32Array([0, 0, 0, -length, width, 0, -length, -width, 0]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const mesh = new THREE.InstancedMesh(geom, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.registerDisposable(geom);
  }

  begin(count: number): void {
    this.ensureCapacity(count);
    if (this.mesh) this.mesh.count = count;
  }

  setInstance(index: number, position: THREE.Vector3, angleRadians: number, z: number): void {
    if (!this.mesh) return;
    const translation = new THREE.Vector3(position.x, position.y, z);
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angleRadians);
    const scale = new THREE.Vector3(1, 1, 1);
    const m = new THREE.Matrix4().compose(translation, quat, scale);
    this.mesh.setMatrixAt(index, m);
  }

  end(): void {
    if (this.mesh) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
