// 놀이공원 배치도 (단위: m). 북쪽 = -z, 동쪽 = +x
export const ISLAND_R = 96; // 섬(잔디) 반지름
export const HEDGE_R = 86; // 울타리
export const TRAIN_R = 80; // 기차 선로
export const WALK_R = 84; // 걸어다닐 수 있는 범위

export const PLAZA = { x: 0, z: 4, r: 13 };
export const GATE = { x: 0, z: 62 };
export const SPAWN = { x: 0, z: 56 };

// 각 기구 위치 (기구 파일에서 사용)
export const SPOTS = {
  coaster: { x: 0, z: -50 },
  pirate: { x: 40, z: -26 },
  ferris: { x: 56, z: -4 },
  carousel: { x: 34, z: 14 },
  cups: { x: 36, z: 36 },
  bumper: { x: 56, z: 26 },
  haunted: { x: -36, z: 38 },
  swing: { x: -38, z: 12 },
  flume: { x: -56, z: -10 },
  drop: { x: -40, z: -36 },
  darts: { x: -11, z: 34 },
  moles: { x: 11, z: 34 },
  shop: { x: -12, z: 46 },
};

// 나무를 심지 않을 구역
export const NO_TREE = [
  { x: 0, z: -50, r: 36 },
  { x: 40, z: -26, r: 14 },
  { x: 56, z: -4, r: 16 },
  { x: 34, z: 14, r: 11 },
  { x: 36, z: 36, r: 12 },
  { x: 56, z: 26, r: 13 },
  { x: -36, z: 38, r: 13 },
  { x: -38, z: 12, r: 12 },
  { x: -56, z: -10, r: 20 },
  { x: -40, z: -36, r: 9 },
  { x: 0, z: 4, r: 17 },
  { x: 0, z: 40, r: 14 },
  { x: 0, z: 62, r: 9 },
];
