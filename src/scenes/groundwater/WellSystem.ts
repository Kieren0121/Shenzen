import * as THREE from 'three';
import { WELLS } from './AquiferModel';
import { CASING_R, surfaceHeight, wellDisplay } from './GroundwaterVisuals';
import type { WellState } from './WaterBalance';

/**
 * Two wells built on the cut-away plane, so the section shows each well in
 * half: casing, slotted screen at depth, the submersible pump at its intake,
 * the rising main, and the water standing in the well (driven by the model).
 */
export const PUMP_Z = 59.25;
const FRONT_Z = 60;

function slotTexture(): THREE.DataTexture {
  const w = 8, h = 64;
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const slot = y % 8 < 3;
    const v = slot ? 30 : 205;
    const i = (y * w + x) * 4;
    d[i] = v; d[i + 1] = v; d[i + 2] = v + 6; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function halfCylinder(r: number, h: number, seg = 20): THREE.BufferGeometry {
  // back half (z <= 0): theta from PI/2 to 3PI/2 in three's convention (x = sin, z = cos)
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true, Math.PI / 2, Math.PI);
  g.translate(0, h / 2, 0);
  return g;
}

export interface WellVisual {
  group: THREE.Group;
  water: THREE.Group;
  light: THREE.Mesh;
  lightMat: THREE.MeshStandardMaterial;
  pumpTop: number;
  surface: number;
  x: number;
}

export class WellSystem {
  readonly group = new THREE.Group();
  readonly wells: WellVisual[] = [];
  private slotTex = slotTexture();
  private waterMat = new THREE.MeshStandardMaterial({ color: 0x2aa9d8, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, emissive: 0x0b4a63, emissiveIntensity: 0.6 });

  constructor() {
    const casingMat = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide });
    const screenMat = new THREE.MeshStandardMaterial({ map: this.slotTex, color: 0xb9c3cc, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3f6f9a, roughness: 0.35, metalness: 0.4 });
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0x2d3640, roughness: 0.3, metalness: 0.75 });
    const intakeMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.6, metalness: 0.4 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.9 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x2f5f8a, roughness: 0.4, metalness: 0.5 });

    WELLS.forEach((def, i) => {
      const { x } = wellDisplay(i);
      const grp = new THREE.Group();
      const top = surfaceHeight(x, FRONT_Z);
      const casingBottom = def.bottom - 0.6;
      // casing (above the screen) and screen (slotted section at the intake depth)
      const upper = new THREE.Mesh(halfCylinder(CASING_R, top + 0.7 - def.screenTop), casingMat);
      upper.position.set(x, def.screenTop, FRONT_Z);
      const lower = new THREE.Mesh(halfCylinder(CASING_R, def.screenBottom - casingBottom), casingMat);
      lower.position.set(x, casingBottom, FRONT_Z);
      const screenGeo = halfCylinder(CASING_R * 1.01, def.screenTop - def.screenBottom);
      const uv = screenGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 6, uv.getY(k) * (def.screenTop - def.screenBottom) * 1.6);
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.set(x, def.screenBottom, FRONT_Z);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(CASING_R, 20, Math.PI, Math.PI), casingMat);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(x, casingBottom, FRONT_Z);
      grp.add(upper, lower, screen, cap);

      // submersible pump at the intake + rising main to the surface
      const pumpTop = def.intake + 2.3;
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, pumpTop - def.intake, 14), pumpMat);
      pump.position.set(x, (pumpTop + def.intake) / 2, PUMP_Z);
      const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.8, 14), intakeMat);
      intake.position.set(x, def.intake + 0.1, PUMP_Z);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.5, 1.2, 14), pumpMat);
      motor.position.set(x, def.intake - 0.8, PUMP_Z);
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, top + 1.8 - pumpTop, 10), pipeMat);
      riser.position.set(x, (top + 1.8 + pumpTop) / 2, PUMP_Z);
      grp.add(pump, intake, motor, riser);

      // well head above ground: apron, head works, discharge elbow and status light
      const apron = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.5, 5.5), concrete);
      apron.position.set(x, top + 0.05, FRONT_Z - 2.9);
      apron.castShadow = true;
      apron.receiveShadow = true;
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 2.2), headMat);
      head.position.set(x, top + 1.9, PUMP_Z - 0.3);
      head.castShadow = true;
      const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 3.6, 10), pipeMat);
      elbow.rotation.x = Math.PI / 2;
      elbow.position.set(x, top + 1.6, PUMP_Z - 2.5);
      const lightMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x30ff70, emissiveIntensity: 1.6, roughness: 0.3 });
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), lightMat);
      light.position.set(x, top + 3.15, PUMP_Z - 0.3);
      grp.add(apron, head, elbow, light);
      if (def.id === 'B') {
        // small pump house beside the deep well
        const house = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 5.5), new THREE.MeshStandardMaterial({ color: 0xd2cbbd, roughness: 0.85 }));
        house.position.set(x + 8, top + 2.1, FRONT_Z - 6);
        house.castShadow = true;
        house.receiveShadow = true;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.5, 6.1), new THREE.MeshStandardMaterial({ color: 0x5a6670, roughness: 0.6, metalness: 0.3 }));
        roof.position.set(x + 8, top + 4.45, FRONT_Z - 6);
        roof.castShadow = true;
        const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.8), new THREE.MeshStandardMaterial({ color: 0x33414c }));
        door.position.set(x + 8, top + 1.4, FRONT_Z - 3.24);
        grp.add(house, roof, door);
      }

      // water standing in the well: unit-height column scaled every frame
      const water = new THREE.Group();
      const wSide = new THREE.Mesh(halfCylinder(CASING_R * 0.93, 1), this.waterMat);
      const wFront = new THREE.Mesh(new THREE.PlaneGeometry(CASING_R * 1.86, 1), this.waterMat);
      wFront.position.set(0, 0.5, -0.02);
      const wTopGeo = new THREE.CircleGeometry(CASING_R * 0.93, 20, 0, Math.PI);
      const wTop = new THREE.Mesh(wTopGeo, this.waterMat);
      wTop.rotation.x = -Math.PI / 2;
      wTop.position.y = 1;
      water.add(wSide, wFront, wTop);
      water.position.set(x, casingBottom, FRONT_Z);
      water.renderOrder = 6;
      water.children.forEach((c) => (c.renderOrder = 6));
      grp.add(water);

      this.group.add(grp);
      this.wells.push({ group: grp, water, light, lightMat, pumpTop, surface: top, x });
    });
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material !== this.waterMat) m.receiveShadow = true;
    });
  }

  /** Update water levels and status lights from the simulation. */
  update(states: WellState[], time: number): void {
    states.forEach((s, i) => {
      const v = this.wells[i];
      const def = WELLS[i];
      const level = s.rate > 0 ? s.pumpingLevel : s.staticLevel;
      const bottom = def.bottom - 0.6;
      const h = Math.max(0.02, Math.min(level, v.surface - 0.3) - bottom);
      v.water.scale.y = h; // the flat top disc lies in the XZ plane, so y-scaling only moves it
      const pulse = 0.6 + 0.4 * Math.sin(time * 6);
      if (s.status === 'dry') {
        v.lightMat.emissive.setHex(0xff2a1a);
        v.lightMat.emissiveIntensity = 1.2 + 1.4 * pulse;
      } else if (s.status === 'reduced') {
        v.lightMat.emissive.setHex(0xffb020);
        v.lightMat.emissiveIntensity = 1.6;
      } else if (s.status === 'off') {
        v.lightMat.emissive.setHex(0x333333);
        v.lightMat.emissiveIntensity = 0.3;
      } else {
        v.lightMat.emissive.setHex(0x30ff70);
        v.lightMat.emissiveIntensity = 1.6;
      }
    });
  }

  dispose(): void {
    this.slotTex.dispose();
  }
}
