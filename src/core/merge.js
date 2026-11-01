import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 움직이지 않는 메시들을 재질별로 하나로 합쳐 draw call 줄이기.
// userData.dynamic = true 인 오브젝트(와 그 자식)는 건드리지 않아요.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const toRemove = [];

  const visit = (obj) => {
    if (obj !== root && obj.userData.dynamic) return;
    if (obj.isMesh && !obj.isInstancedMesh && !obj.isSkinnedMesh && !Array.isArray(obj.material)) {
      const key = `${obj.material.uuid}|${obj.castShadow ? 1 : 0}|${obj.receiveShadow ? 1 : 0}`;
      let g = obj.geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      }
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.index) {
        const idx = [];
        for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
        g.setIndex(idx);
      }
      g.morphAttributes = {};
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld));
      if (!groups.has(key)) groups.set(key, { mat: obj.material, cast: obj.castShadow, recv: obj.receiveShadow, geos: [] });
      groups.get(key).geos.push(g);
      toRemove.push(obj);
    }
    for (const c of obj.children) visit(c);
  };
  visit(root);

  for (const o of toRemove) {
    o.parent?.remove(o);
  }
  // 빈 그룹 정리
  const prune = (obj) => {
    for (const c of [...obj.children]) {
      if (c.userData.dynamic) continue;
      prune(c);
      if (!c.isMesh && !c.isLight && !c.isSprite && !c.isPoints && !c.isLine && c.children.length === 0 && c.type === 'Group') {
        obj.remove(c);
      }
    }
  };
  prune(root);

  for (const { mat, cast, recv, geos } of groups.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = recv;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    for (const g of geos) g.dispose();
  }
  return root;
}

// 편의 함수: 메시 만들고 위치/회전/그림자 설정
export function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = cast;
  m.receiveShadow = recv;
  return m;
}

// 두 점을 잇는 원기둥 (기둥, 체인, 철골)
const _up = new THREE.Vector3(0, 1, 0);
export function beam(a, b, radius, mat, radial = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radial), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(_up, dir.normalize());
  m.castShadow = true;
  return m;
}
