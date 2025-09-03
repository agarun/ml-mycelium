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
    this.material = material;
  }

  private ensureCapacity(capacity: number): void {
    if (this.mesh && capacity <= this.capacity) {
      return;
    } else if (this.mesh) {
      this.unregisterDisposable(this.mesh.geometry);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }

    this.capacity = capacity;

    const length = 8;
    const width = 5;
    const vertices = new Float32Array([0, 0, 0, -length, width, 0, -length, -width, 0]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    this.registerDisposable(geometry);

    const mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.mesh = mesh;
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

  dispose(): void {
    this.mesh = null;
    this.capacity = 0;
    super.dispose();
  }
}
