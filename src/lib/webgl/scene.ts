import * as THREE from 'three';
import type { NodeId } from '$lib/network';
import type { IDrawableNetwork } from '$lib/layout';
import type { IRectOptions } from '$lib/ui';
import { BoundingBox } from '$lib/geometry';
import type { IPoint } from '$lib/geometry';
import { EdgeManager } from './edge';
import { NodeManager } from './node';

export class SceneManager {
  public scene: THREE.Scene;
  private nodeManager: NodeManager;
  private edgeManager: EdgeManager;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.nodeManager = new NodeManager(this);
    this.edgeManager = new EdgeManager(this);
  }

  updateNetwork(drawable: IDrawableNetwork, decorations: Map<NodeId, Partial<IRectOptions>>): void {
    this.computeBoundingBox(drawable);
    this.dispose();
    this.updateNodes(drawable, decorations);
    this.updateEdges(drawable);
  }

  private updateNodes(
    drawable: IDrawableNetwork,
    decorations: Map<NodeId, Partial<IRectOptions>>,
  ): void {
    this.nodeManager.render(drawable, decorations);
  }

  private updateEdges(drawable: IDrawableNetwork): void {
    this.edgeManager.render(drawable);
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

  public selectNodes(nodeIds: Set<NodeId>): void {
    this.nodeManager.selectNodes(nodeIds);
  }

  dispose(): void {
    this.nodeManager.dispose();
    this.edgeManager.dispose();
    this.traverse(this.scene, (object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material: THREE.Material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }

  traverse(node: THREE.Object3D, callback: (object: any) => void): void {
    callback(node);
    node.children.forEach((child) => {
      this.traverse(child, callback);
    });
  }
}
