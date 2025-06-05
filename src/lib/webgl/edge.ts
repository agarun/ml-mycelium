// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import type { IDrawableNetwork } from '$lib/layout';
import { Theme } from '$lib/ui';
import { CurveBuilder } from '$lib/geometry/curveBuilder';
import type { SceneManager } from './scene';
import { WebGLManager } from './webgl';

export class EdgeManager extends WebGLManager {
  private material: THREE.LineBasicMaterial;
  private arrowMaterial: THREE.MeshBasicMaterial;
  private edges: THREE.Group;
  private sceneManager: SceneManager;
  private lastDrawableHash: string | null = null;

  constructor(sceneManager: SceneManager) {
    super();
    this.material = new THREE.LineBasicMaterial({
      color: Theme.colors.foreground.grayTertiary,
      linewidth: 0.5,
      transparent: true,
      opacity: 0.5,
    });
    this.arrowMaterial = new THREE.MeshBasicMaterial({
      color: Theme.colors.foreground.grayTertiary,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
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
    const didDrawableUpdate = this.lastDrawableHash !== this.drawableHash(drawable);
    if (didDrawableUpdate) this.lastDrawableHash = drawableHash;
    return didDrawableUpdate;
  }

  private clearEdges(): void {
    while (this.edges.children.length > 0) {
      const child = this.edges.children[0];
      this.edges.remove(child);
      if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
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
    for (const edge of drawable.edges.children) {
      const transformedEdgePoints = edge.points.map((p) => ({
        x: p.x,
        y: p.y,
      }));
      const curveBuilder = new CurveBuilder(transformedEdgePoints);
      const path = curveBuilder.build();

      // Parse SVG path to get points for THREE.js curve
      const points: THREE.Vector3[] = [];
      const pathSegments = path.split(/[MLC]/).filter(Boolean);
      for (const segment of pathSegments) {
        const [x, y] = segment
          .trim()
          .split(/[/\s,]+/)
          .map(Number);
        if (!isNaN(x) && !isNaN(y)) {
          points.push(new THREE.Vector3(x, y, 0));
        }
      }

      if (points.length < 2) continue;

      // Smooth the curve
      const curve = new THREE.CatmullRomCurve3(points);
      const curveLength = curve.getLength();
      const pointCount = Math.max(10, Math.min(50, Math.floor(curveLength / 10)));
      const curvePoints = curve.getPoints(pointCount);
      const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const line = new THREE.Line(geometry, this.material);
      line.position.z = -0.1;

      // Arrowhead
      const lastPoint = curvePoints[curvePoints.length - 1];
      const secondLastPoint = curvePoints[curvePoints.length - 2];
      if (lastPoint && secondLastPoint) {
        const direction = new THREE.Vector3().subVectors(lastPoint, secondLastPoint).normalize();
        const arrowLength = 8;
        const arrowWidth = 5;

        const arrowShape = new THREE.Shape();

        arrowShape.moveTo(0, 0);

        // Create inward-curved edge to the left point
        arrowShape.quadraticCurveTo(-arrowLength * 0.8, arrowWidth * 0.8, -arrowLength, arrowWidth);
        // Create slightly curved edge to the bottom point
        arrowShape.quadraticCurveTo(-arrowLength * 0.6, 0, -arrowLength, -arrowWidth);
        // Create inward-curved edge back to the tip
        arrowShape.quadraticCurveTo(-arrowLength * 0.8, -arrowWidth * 0.8, 0, 0);

        const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), this.arrowMaterial);

        arrow.position.copy(lastPoint);
        arrow.rotation.z = Math.atan2(direction.y, direction.x);
        arrow.position.z = -0.15;

        this.edges.add(arrow);
      }

      this.registerDisposable(geometry);
      this.edges.add(line);
    }
  }

  dispose(): void {
    this.material.dispose();
    this.arrowMaterial.dispose();
    this.clearEdges();
    super.dispose();
  }
}
