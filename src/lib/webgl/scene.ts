// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import type { NodeId } from '$lib/network';
import type { IDrawableNetwork } from '$lib/layout';
import type { IRectOptions } from '$lib/ui';
import { EdgeManager } from './edge';
import { NodeManager } from './node';
import { TextManager } from './text';

export class SceneManager {
  public scene: THREE.Scene;
  public textManager: TextManager;
  private nodeManager: NodeManager;
  private edgeManager: EdgeManager;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.textManager = new TextManager();
    this.nodeManager = new NodeManager(this);
    this.edgeManager = new EdgeManager(this);
  }

  updateNetwork(drawable: IDrawableNetwork, decorations: Map<NodeId, Partial<IRectOptions>>): void {
    this.updateNodes(drawable, decorations);
    this.updateEdges(drawable);
  }

  private updateNodes(
    drawable: IDrawableNetwork,
    decorations: Map<NodeId, Partial<IRectOptions>>,
  ): void {
    this.nodeManager.renderNodes(drawable, decorations);
  }

  private updateEdges(drawable: IDrawableNetwork): void {
    this.edgeManager.renderEdges(drawable);
  }

  public getNodeAtPoint(point: THREE.Vector2, camera: THREE.Camera): NodeId | undefined {
    return this.nodeManager.getNodeAtPoint(point, camera);
  }

  public hoverNode(nodeId: NodeId | undefined): void {
    this.nodeManager.hoverNode(nodeId);
  }

  public updateTextVisibility(camera: THREE.Camera, currentScale: number): void {
    this.textManager.updateVisibility(camera, currentScale);
  }

  public selectNodes(nodeIds: Set<NodeId>): void {
    this.nodeManager.selectNodes(nodeIds);
  }

  dispose(): void {
    this.textManager.clear();
    this.nodeManager.dispose();
    this.edgeManager.dispose();

    this.scene.traverse((object: THREE.Object3D) => {
      if ('geometry' in object && object.geometry) {
        const geometry = object.geometry as THREE.BufferGeometry;
        geometry.dispose();
      }

      if ('material' in object && object.material) {
        const material = object.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) {
          material.forEach((mat: THREE.Material) => {
            mat.dispose();
          });
        } else {
          material.dispose();
        }
      }
    });

    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      this.scene.remove(child);
    }
  }
}
