// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import type { NodeId } from '$lib/network';
import type { IDrawableNetwork } from '$lib/layout';
import type { IRectOptions } from '$lib/ui';
import { BoundingBox } from '$lib/geometry';
import type { IPoint } from '$lib/geometry';
import { EdgeManager } from './edge';
import { NodeManager } from './node';
// TEXT_VISIBILITY_SCALE_THRESHOLD is used within TextManager; not needed here
import { TextManager } from './text';

export class SceneManager {
  public scene: THREE.Scene;
  private nodeManager: NodeManager;
  private edgeManager: EdgeManager;
  private frustum: THREE.Frustum;
  private projScreenMatrix: THREE.Matrix4;
  private textManager: TextManager;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    // Initialize TextManager before NodeManager so it's available during NodeManager construction
    this.textManager = new TextManager();
    this.nodeManager = new NodeManager(this);
    this.edgeManager = new EdgeManager(this);
  }

  updateNetwork(drawable: IDrawableNetwork, decorations: Map<NodeId, Partial<IRectOptions>>): void {
    this.computeBoundingBox(drawable);
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

  private computeBoundingBox(drawable: IDrawableNetwork): void {
    let allElementsBB = BoundingBox.infinity();

    const allNodes = [...drawable.nodes.values(), ...drawable.collapsed.values()];
    allNodes.forEach((node) => {
      allElementsBB = allElementsBB.union(node.boundingBox());
    });

    drawable.expanded.forEach((module) => {
      allElementsBB = allElementsBB.union(module.boundingBox);
    });

    const allEdgePoints: IPoint[] = [];
    drawable.edges.children.forEach((edge) => {
      edge.points.forEach((p) => {
        allEdgePoints.push({ x: p.x, y: p.y });
      });
    });

    if (allEdgePoints.length > 0) {
      allElementsBB = allElementsBB.union(BoundingBox.fromPoints(...allEdgePoints));
    }
  }

  public getNodeAtPoint(point: THREE.Vector2, camera: THREE.Camera): NodeId | undefined {
    return this.nodeManager.getNodeAtPoint(point, camera);
  }

  public hoverNode(nodeId: NodeId | undefined): void {
    this.nodeManager.hoverNode(nodeId);
  }

  // Hide text when zoomed out and when off-screen to improve performance
  public updateTextVisibility(camera: THREE.Camera, currentScale: number): void {
    // Defer to TextManager which tracks instances
    this.textManager.updateVisibility(camera, currentScale);
  }

  public selectNodes(nodeIds: Set<NodeId>): void {
    this.nodeManager.selectNodes(nodeIds);
  }

  public getTextManager(): TextManager {
    return this.textManager;
  }

  dispose(): void {
    this.textManager.clearInstances();
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
