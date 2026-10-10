import * as THREE from 'three';
import { Dept } from '@/config/office';
import { deptColor, getAccent } from './materials';

export const SKIN_TONES = [0xf1c9a5, 0xe0ac7e, 0xc68863, 0xa5714f, 0x7a4f35, 0x5c3a28];
export const HAIR_COLORS = [0x2b2118, 0x4a3325, 0x6b4a2f, 0x1a1a1e, 0x8a6a4a, 0x3d3d42];

const shared = {
  head: new THREE.SphereGeometry(0.115, 12, 10),
  torso: new THREE.CapsuleGeometry(0.16, 0.42, 4, 8),
  upper: new THREE.CapsuleGeometry(0.055, 0.3, 3, 6),
  leg: new THREE.CapsuleGeometry(0.07, 0.34, 3, 6),
  shin: new THREE.CapsuleGeometry(0.06, 0.32, 3, 6),
  cup: new THREE.CylinderGeometry(0.035, 0.028, 0.09, 8),
  blob: new THREE.CircleGeometry(0.32, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });

export interface RigPose {
  seated: boolean; walkBlend: number; phase: number; speed: number;
  activity: string; carry: boolean; t: number;
}

export interface Rig {
  group: THREE.Group;
  update(x: number, z: number, heading: number, p: RigPose, dt: number): void;
  dispose(): void;
}

export function buildRig(seed: number, dept: Dept | null, role: string): Rig {
  const rand = mulberry(seed);
  const group = new THREE.Group();
  const scale = 1.6 / 1.75 + rand() * 0.14; // 1.6–1.85 m

  const skin = new THREE.MeshStandardMaterial({ color: SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)], roughness: 0.75 });
  const hairC = HAIR_COLORS[Math.floor(rand() * HAIR_COLORS.length)];
  const hair = new THREE.MeshStandardMaterial({ color: hairC, roughness: 0.9 });
  const shirtC = dept ? deptColor(dept).clone() : new THREE.Color(0x3d3d44);
  if (role === 'manager') shirtC.set(0x2B2B2E);          // manager: charcoal suit
  if (role === 'lead') shirtC.multiplyScalar(0.72);      // lead: a deeper shade of the department color
  const shirt = new THREE.MeshStandardMaterial({ color: shirtC, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: [0x2f3540, 0x3d3d44, 0x54514a][Math.floor(rand() * 3)], roughness: 0.9 });

  const hips = new THREE.Group(); hips.position.y = 0.84; group.add(hips);
  const torso = new THREE.Mesh(shared.torso, shirt); torso.position.y = 0.28; hips.add(torso);
  // --- hierarchy markers (front of the torso is +z) ---
  const extras: THREE.Material[] = [];
  const mat = (c: number | THREE.Color) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }); extras.push(m); return m; };
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(shared.box, m); b.scale.set(w, h, d); b.position.set(x, y, z); hips.add(b); return b;
  };
  if (role === 'manager') {                 // suit jacket + white collar + brand-colored tie
    const jacket = new THREE.Mesh(shared.torso, mat(0x23232a)); jacket.scale.set(1.1, 1.02, 1.2); jacket.position.y = 0.28; hips.add(jacket);
    add(0.05, 0.09, 0.03, -0.045, 0.6, 0.17, mat(0xfaf7f2)); add(0.05, 0.09, 0.03, 0.045, 0.6, 0.17, mat(0xfaf7f2));
    add(0.045, 0.27, 0.02, 0, 0.42, 0.205, mat(new THREE.Color(getAccent())));
  } else if (role === 'lead') {             // lanyard + ID badge (brand color)
    add(0.026, 0.3, 0.012, 0, 0.42, 0.168, mat(new THREE.Color(getAccent())));
    add(0.085, 0.105, 0.014, 0, 0.23, 0.171, mat(0xfaf7f2));
  }
  const head = new THREE.Mesh(shared.head, skin); head.position.y = 0.72; hips.add(head);
  const hairStyle = Math.floor(rand() * 5);
  const hairMesh = new THREE.Mesh(shared.head, hair);
  hairMesh.scale.set(1.12, hairStyle === 0 ? 1.0 : 0.85, 1.12);
  hairMesh.position.y = hairStyle === 0 ? 0.74 : 0.76; head.add(hairMesh);
  if (hairStyle === 1) { const bun = new THREE.Mesh(shared.head, hair); bun.scale.setScalar(0.45); bun.position.set(0, 0.05, 0.1); head.add(bun); }
  if (hairStyle === 2) { const tail = new THREE.Mesh(shared.leg, hair); tail.rotation.x = 0.35; tail.position.set(0, -0.1, 0.1); head.add(tail); }
  if (hairStyle === 3) for (const [hx, hz] of [[0.05, 0.03], [-0.05, 0.02], [0, 0.07]])
    { const c = new THREE.Mesh(shared.head, hair); c.scale.setScalar(0.5); c.position.set(hx, 0.04, hz); head.add(c); }

  const armL = new THREE.Group(); armL.position.set(-0.2, 0.46, 0); hips.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.2, 0.46, 0); hips.add(armR);
  const armLMesh = new THREE.Mesh(shared.upper, shirt); armLMesh.position.y = -0.16; armL.add(armLMesh);
  const armRMesh = new THREE.Mesh(shared.upper, shirt); armRMesh.position.y = -0.16; armR.add(armRMesh);
  const handL = new THREE.Mesh(shared.head, skin); handL.scale.setScalar(0.45); handL.position.y = -0.34; armL.add(handL);
  const handR = handL.clone(); armR.add(handR);

  const legL = new THREE.Group(); legL.position.set(-0.09, 0, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.09, 0, 0); hips.add(legR);
  const thighL = new THREE.Mesh(shared.leg, pants); thighL.position.y = -0.2; legL.add(thighL);
  const thighR = new THREE.Mesh(shared.leg, pants); thighR.position.y = -0.2; legR.add(thighR);
  const shinLg = new THREE.Group(); shinLg.position.y = -0.4; legL.add(shinLg);
  const shinRg = new THREE.Group(); shinRg.position.y = -0.4; legR.add(shinRg);
  const shinL = new THREE.Mesh(shared.shin, pants); shinL.position.y = -0.16; shinLg.add(shinL);
  const shinR = new THREE.Mesh(shared.shin, pants); shinR.position.y = -0.16; shinRg.add(shinR);

  const cup = new THREE.Mesh(shared.cup, new THREE.MeshStandardMaterial({ color: 0xfaf7f2 })); cup.visible = false;
  armR.add(cup); cup.position.set(0, -0.42, 0.05);

  const blob = new THREE.Mesh(shared.blob, blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; group.add(blob);

  group.scale.setScalar(scale);
  const targets = { thighL: 0, thighR: 0, shinL: 0, shinR: 0, armL: 0, armR: 0, hipY: 0.84, headNod: 0, headTilt: 0 };
  const cur = { ...targets };

  return {
    group,
    update(x, z, heading, p, dt) {
      group.position.x = x; group.position.z = z;
      group.rotation.y = heading;
      const T = 8;
      const k = Math.min(1, dt * T);
      if (p.seated) {
        targets.thighL = targets.thighR = -1.45;
        targets.shinL = targets.shinR = 1.45;
        targets.hipY = 0.62;
        if (p.activity === 'type') {
          targets.armL = targets.armR = -1.15 + Math.sin(p.t * 9) * 0.07;
          targets.headNod = Math.sin(p.t * 1.3) * 0.05 - 0.15;
        } else if (p.activity === 'think') {
          targets.armR = -2.4; targets.armL = -0.4;
          targets.headTilt = Math.sin(p.t * 0.8) * 0.08;
        } else if (p.activity === 'review') { targets.armL = targets.armR = -1.0; }
        else if (p.activity === 'eat') { targets.armR = -1.9 + Math.sin(p.t * 1.6) * 0.25; targets.armL = -1.6; }
        else if (p.activity === 'wait') { targets.armL = -1.9; targets.headNod = 0.2; }
        else if (p.activity === 'talk') {
          targets.armL = -0.9 + Math.sin(p.t * 3.1) * 0.3;
          targets.armR = -1.1 + Math.cos(p.t * 2.7) * 0.35;
          targets.headNod = Math.sin(p.t * 2.2) * 0.1;
        }
        else { targets.armL = targets.armR = -0.25; targets.headNod = 0; }
      } else {
        targets.hipY = 0.84;
        const A = Math.min(0.62, p.speed * 0.5);
        const s = Math.sin(p.phase), c = Math.cos(p.phase);
        targets.thighL = s * A * p.walkBlend;
        targets.thighR = -s * A * p.walkBlend;
        targets.shinL = Math.max(0, -c) * A * 0.9 * p.walkBlend;
        targets.shinR = Math.max(0, c) * A * 0.9 * p.walkBlend;
        targets.hipY = 0.84 + Math.abs(c) * 0.03 * p.walkBlend;
        let baseArm = -s * A * 0.6 * p.walkBlend;
        if (p.carry) { targets.armR = -0.55; targets.armL = baseArm; }
        else { targets.armL = baseArm; targets.armR = -baseArm; }
        if (p.activity === 'drink') targets.armR = -2.1 + Math.sin(p.t * 2.2) * 0.3;
        if (p.activity === 'talk') { targets.armR = -0.9 + Math.sin(p.t * 3.1) * 0.35; targets.headNod = Math.sin(p.t * 2.2) * 0.1; }
        if (p.activity === 'wait') targets.armL = -1.9;
        targets.headNod = p.walkBlend > 0.3 ? 0 : Math.sin(p.t * 1.1) * 0.04; // idle breathing
        if (p.activity === 'celebrate') { targets.armL = targets.armR = -2.7 + Math.sin(p.t * 10) * 0.2; }
      }
      cur.thighL += (targets.thighL - cur.thighL) * k;
      cur.thighR += (targets.thighR - cur.thighR) * k;
      cur.shinL += (targets.shinL - cur.shinL) * k;
      cur.shinR += (targets.shinR - cur.shinR) * k;
      cur.armL += (targets.armL - cur.armL) * k;
      cur.armR += (targets.armR - cur.armR) * k;
      cur.hipY += (targets.hipY - cur.hipY) * k;
      legL.rotation.x = cur.thighL; legR.rotation.x = cur.thighR;
      shinLg.rotation.x = cur.shinL; shinRg.rotation.x = cur.shinR;
      armL.rotation.x = cur.armL; armR.rotation.x = cur.armR;
      hips.position.y = cur.hipY;
      head.rotation.x = targets.headNod ?? 0; head.rotation.z = targets.headTilt ?? 0;
      cup.visible = p.carry || p.activity === 'drink';
      blob.visible = true;
      blob.scale.setScalar(p.seated ? 0.8 : 1);
    },
    dispose() { skin.dispose(); hair.dispose(); shirt.dispose(); pants.dispose(); extras.forEach((m) => m.dispose()); },
  };
}

function mulberry(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
