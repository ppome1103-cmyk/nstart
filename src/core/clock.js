// 두 폰이 같은 "놀이공원 시간"을 쓰도록. 방장 시계를 기준으로 맞춰요.
let offset = 0;
let bestRtt = Infinity;

export function parkNow() {
  return performance.now() / 1000 + offset;
}

export function resetClock() {
  offset = 0;
  bestRtt = Infinity;
}

// 게스트: ping 보낸 시각(c), 방장 시각(h)을 받아서 보정
export function onPong(c, h) {
  const now = performance.now() / 1000;
  const rtt = now - c;
  if (rtt > bestRtt * 1.5 && bestRtt !== Infinity) return;
  bestRtt = Math.min(bestRtt, rtt);
  const target = h + rtt / 2 - now;
  offset = Math.abs(target - offset) > 1 || bestRtt === rtt ? target : offset + (target - offset) * 0.3;
}

export function localNow() {
  return performance.now() / 1000;
}
