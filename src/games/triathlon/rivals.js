/** Swim start lanes leave room for each stroke; later racing lanes stay unchanged. */
export const RIVALS = [
  { name: 'Per Vikman', color: 0xc25856, duration: 89, lane: -2.4, swimLane: -1.95, strengths: [1.08, 0.98, 1] },
  { name: 'Mikael Hägglund', color: 0x68a3bc, duration: 96, lane: 2.2, swimLane: 1.6, strengths: [0.96, 1.07, 1] },
  { name: 'Tobias Lundqvist', color: 0x839b5a, duration: 104, lane: 0, swimLane: -0.975, strengths: [1, 0.95, 1.07] }
];

export function rivalLane(rival, time) {
  // The narrow start field fits phones. The animated stroke already rolls the
  // body; root-level sideways wandering would push outer swimmers off-screen.
  if (rival.stage === 0) return rival.swimLane;
  return rival.lane + Math.sin(time * 0.17 + rival.phase) * 0.3;
}
