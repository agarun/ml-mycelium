// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import type { IDrawableNetwork } from '$lib/layout';
import { Theme } from '$lib/ui';
import { CurveBuilder } from '$lib/geometry/curveBuilder';
import type { SceneManager } from './scene';
import { WebGLManager } from './webgl';
import { InstancedArrowManager } from './instanced-arrow';

export class EdgeManager extends WebGLManager {
  private material: THREE.LineBasicMaterial;
  private arrowMaterial: THREE.MeshBasicMaterial;
  private edges: THREE.Group;
  private mergedLine: THREE.LineSegments | null = null;
  private instancedArrowManager: InstancedArrowManager | null = null;
  private sceneManager: SceneManager;
  private lastDrawableHash: string | null = null;

  constructor(sceneManager: SceneManager) {
    super();
    this.material = new THREE.LineBasicMaterial({
      color: Theme.colors.foreground.grayTertiary,
      linewidth: 0.5,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      depthTest: false,
    });
    this.arrowMaterial = new THREE.MeshBasicMaterial({
      color: Theme.colors.foreground.grayTertiary,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    this.edges = new THREE.Group();
    this.sceneManager = sceneManager;
    this.sceneManager.scene.add(this.edges);
  }

  private drawableHash(drawable: IDrawableNetwork): string {
    return JSON.stringify(
      drawable.edges.children.map((edge) => ({
        points: edge.points.map((p) => ({ x: p.x, y: p.y })),
      })),
    );
  }

  private needsUpdate(drawable: IDrawableNetwork): boolean {
    const drawableHash = this.drawableHash(drawable);
    const didDrawableUpdate = this.lastDrawableHash !== drawableHash;
    if (didDrawableUpdate) this.lastDrawableHash = drawableHash;
    return didDrawableUpdate;
  }

  private clearEdges(): void {
    if (this.mergedLine) {
      this.edges.remove(this.mergedLine);
      this.mergedLine.geometry.dispose();
      this.mergedLine = null;
    }
    if (this.instancedArrowManager?.mesh) {
      this.edges.remove(this.instancedArrowManager.mesh);
    }
    while (this.edges.children.length > 0) {
      const child = this.edges.children[0];
      this.edges.remove(child);
      if ('geometry' in child && child.geometry) {
        const geometry = child.geometry as THREE.BufferGeometry & {
          userData: { __sharedCache?: boolean };
        };
        if (geometry.userData.__sharedCache !== true) {
          geometry.dispose();
        }
      }
      if ('material' in child && child.material) {
        const mat = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            m.dispose();
          });
        } else {
          mat.dispose();
        }
      }
    }
  }

  renderEdges(drawable: IDrawableNetwork): void {
    if (this.needsUpdate(drawable)) {
      this.clearEdges();
      this.render(drawable);
    }
  }

  render(drawable: IDrawableNetwork) {
    const mergedPositions: number[] = [];
    const lineIndices: number[] = [];
    let vertexOffset = 0;
    const arrowPositions: THREE.Vector3[] = [];
    const arrowAngles: number[] = [];

    for (const edge of drawable.edges.children) {
      const transformedEdgePoints = edge.points.map((p) => ({ x: p.x, y: p.y }));
      const curveBuilder = new CurveBuilder(transformedEdgePoints);
      const path = curveBuilder.build();

      // Parse SVG path
      const points: THREE.Vector3[] = [];
      const pathSegments = path.split(/[MLC]/).filter(Boolean);
      for (const segment of pathSegments) {
        const [x, y] = segment
          .trim()
          .split(/[/\s,]+/)
          .map(Number);
        if (!isNaN(x) && !isNaN(y)) points.push(new THREE.Vector3(x, y, -0.1));
      }
      if (points.length < 2) continue;

      const curve = new THREE.CatmullRomCurve3(points);
      const curveLength = curve.getLength();
      const pointCount = Math.max(10, Math.min(50, Math.floor(curveLength / 10)));
      const curvePoints = curve.getPoints(pointCount);

      for (let i = 0; i < curvePoints.length; i++) {
        mergedPositions.push(curvePoints[i].x, curvePoints[i].y, curvePoints[i].z);
        if (i > 0) {
          lineIndices.push(vertexOffset + i - 1, vertexOffset + i);
        }
      }
      vertexOffset += curvePoints.length;

      // Arrow tip placement
      const last = curvePoints[curvePoints.length - 1];
      const prev = curvePoints[curvePoints.length - 2];
      const dir = new THREE.Vector3().subVectors(last, prev).normalize();
      const angle = Math.atan2(dir.y, dir.x);
      arrowPositions.push(last.clone().setZ(-0.15));
      arrowAngles.push(angle);
    }

    if (mergedPositions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
      geom.setIndex(lineIndices);
      const line = new THREE.LineSegments(geom, this.material);
      this.mergedLine = line;
      this.edges.add(line);
    }

    if (arrowPositions.length > 0) {
      if (!this.instancedArrowManager) {
        this.instancedArrowManager = new InstancedArrowManager(this.arrowMaterial);
      }

      this.instancedArrowManager.begin(arrowPositions.length);
      for (let i = 0; i < arrowPositions.length; i++) {
        this.instancedArrowManager.setInstance(i, arrowPositions[i], arrowAngles[i], -0.15);
      }
      this.instancedArrowManager.end();

      if (this.instancedArrowManager.mesh) {
        this.edges.add(this.instancedArrowManager.mesh);
      }
    }
  }

  dispose(): void {
    this.sceneManager.scene.remove(this.edges);
    this.material.dispose();
    this.arrowMaterial.dispose();
    this.clearEdges();
    if (this.instancedArrowManager) {
      this.instancedArrowManager.dispose();
      this.instancedArrowManager = null;
    }
    super.dispose();
  }
}
