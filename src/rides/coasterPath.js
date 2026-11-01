import * as THREE from 'three';

// 별똥별 코스터 레일 경로 (중심 x=0, z=-50 기준 절대 좌표)
// 역 → 리프트 언덕 → 큰 낙하 → 루프 → 낙타 언덕 → 나선 → 에어타임 언덕 → 역
export function coasterPoints() {
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const pts = [];
  // 역 (동쪽 방향 +x)
  pts.push(P(-10, 1.2, -36), P(-4, 1.2, -36), P(2, 1.2, -36), P(8, 1.3, -36));
  // 북쪽으로 꺾어서 리프트
  pts.push(P(14, 1.6, -37.5), P(18, 2.4, -41));
  // 리프트 언덕 (x=20, -z 방향)
  for (let i = 0; i <= 5; i++) {
    const f = i / 5;
    pts.push(P(20, 3.5 + f * 19, -44 - f * 17));
  }
  // 꼭대기에서 서쪽으로 크게 돌기
  pts.push(P(19.5, 23.6, -63.5), P(17, 24, -66), P(13.5, 23.4, -66.6));
  // 큰 낙하 (-x 방향)
  pts.push(P(10, 19, -66.4), P(6.5, 11, -66), P(3, 3.5, -65.5), P(-0.5, 1.3, -65));
  // 루프 (-x 방향으로 진행, 나오면서 z +3 이동)
  const lc = P(-8, 8.6, -64);
  const R = 7;
  pts.push(P(-4, 1.6, -64.8));
  for (let i = 1; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pts.push(P(lc.x - Math.sin(a) * R, lc.y - Math.cos(a) * R, lc.z + (i / 12) * 3.8 - 0.4));
  }
  pts.push(P(-12, 1.6, -60.3), P(-16, 1.8, -60.1));
  // 낙타 언덕
  pts.push(P(-20, 6, -60), P(-23, 9.5, -58.5), P(-25.5, 9, -56), P(-26.4, 7.2, -53));
  // 나선 한 바퀴 (중심 -20,-50, 반지름 6.5, 내려가며 시계방향)
  const hc = P(-20, 0, -50);
  const hr = 6.5;
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI - (i / 12) * Math.PI * 2;
    pts.push(P(hc.x + Math.cos(a) * hr, 6.4 - (i / 12) * 4.6, hc.z + Math.sin(a) * hr));
  }
  // 에어타임 언덕 → 역으로
  pts.push(P(-26.8, 2.6, -44.5), P(-26.6, 4.6, -41), P(-24.5, 2.6, -37.6), P(-20, 1.4, -36.2), P(-15, 1.2, -36));
  return pts;
}
