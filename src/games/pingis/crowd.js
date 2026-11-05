/**
 * Pekkas Pingis — the people of Bredbyn who came to watch.
 *
 * A village hall final is not played to an empty room, and a crowd that
 * REACTS does more for the sense of occasion than any amount of geometry on
 * the table: heads follow the ball, everyone leans in as a rally gets long,
 * arms go up when you win a point, hands go to heads when you lose one, a
 * long rally he wins still gets polite applause, the room holds its breath
 * on match point — and stands up for the champion.
 *
 * The people are the shared crowd (people.js createCrowd): instanced, a
 * handful of draw calls however many seats are filled, and the ten friends
 * who are not across the table from you are somewhere in it — the same
 * faces they have in every other game. This file only says what the room
 * does with them.
 */

import * as THREE from 'three';
import { createCrowd, PARTICIPANT_NAMES, SEAT_HEIGHT, SEAT_BACK } from '../shared/people.js';

/** They are at the table tonight, not in the seats. */
const PLAYING = ['Henrik Lundqvist', 'Rickard Nilsson', 'Viktor Jones'];

/**
 * seats: [{ x, y, z, ry, pose: 'sit' | 'stand' }] from hall.js — for a
 * seated spectator (x, y, z) is the centre of the seat's top, for a
 * standing one it is the feet.
 */
export function buildCrowd(seats, { castShadow = true } = {}) {
  const crowd = createCrowd({
    seats: seats.map((s) => ({ position: new THREE.Vector3(s.x, s.y, s.z), rotationY: s.ry, pose: s.pose })),
    names: PARTICIPANT_NAMES.filter((n) => !PLAYING.includes(n)),
    seed: 2019,
    hats: 0.1,
    castShadow
  });
  // Seat everyone on their own seat: the figure's seat height scales with
  // its height, so a tall man's root goes a little lower than a short one's
  crowd.members.forEach((m, i) => {
    const s = seats[i];
    if (s.pose === 'stand') return;
    m.position.set(
      s.x + Math.sin(s.ry) * SEAT_BACK * m.scale,
      s.y - SEAT_HEIGHT * m.scale,
      s.z + Math.cos(s.ry) * SEAT_BACK * m.scale
    );
  });

  const mood = { excite: 0, hush: 0, ooh: 0, drop: 0, cheering: 0, celebrating: false };
  const tableEnd = new THREE.Vector3(0, 0, 1.6); // where heads go when the point is lost
  const tableMid = new THREE.Vector3(0, 0.9, 0);

  /**
   * kind: 'cheer' (your point) | 'groan' (theirs) | 'ooh' (a smash, a rally
   * milestone) | 'applause' (a long rally he won: polite, a friendly hall)
   * | 'celebrate' (the champion) | 'idle'.
   */
  function react(kind, power = 1) {
    if (mood.celebrating && kind !== 'celebrate') {
      mood.celebrating = false;
      crowd.setMood('idle');
    }
    if (kind === 'cheer') {
      crowd.react('cheer', 0.9 + power * 1.2);
      mood.cheering = 0.9 + power;
    } else if (kind === 'applause') {
      crowd.react('polite', 1.2 + power);
    } else if (kind === 'groan') {
      // Hands to the head, a slump, back up — and every eye on the table end
      crowd.react('groan', 1.2 + power * 0.6);
      mood.drop = 1.1;
    } else if (kind === 'ooh') {
      mood.ooh = Math.max(mood.ooh, Math.min(1, power));
    } else if (kind === 'celebrate') {
      mood.celebrating = true;
      crowd.setMood('ovation');
      crowd.react('ovation', 6);
    } else {
      crowd.react('idle', 0.1);
    }
  }

  /** levels: { excite 0..1 (rally length), hush 0..1 (match point) }. */
  function update(t, dt, ball, levels) {
    const k = Math.min(1, dt * 2);
    mood.excite += ((levels.excite || 0) - mood.excite) * k;
    mood.hush += ((levels.hush || 0) - mood.hush) * k;
    mood.ooh = Math.max(0, mood.ooh - dt * 1.4);
    mood.drop = Math.max(0, mood.drop - dt);
    mood.cheering = Math.max(0, mood.cheering - dt);
    // Everyone leans in as the rally grows, more on match point, and jolts
    // forward on a smash (the shared crowd eases it per person, each with
    // their own depth and lag); nobody leans while on their feet
    const lean = mood.celebrating || mood.cheering > 0 ? 0
      : mood.excite * 0.55 + mood.hush * 0.45 + mood.ooh * 0.5;
    crowd.setLean(Math.min(1, lean));
    // Heads: the ball while it is in play; on a lost point they drop to the
    // near end of the table; on match point, between rallies, every eye
    // stays on the table instead of wandering
    if (mood.drop > 0) crowd.lookAt(tableEnd);
    else if (ball) crowd.lookAt(ball);
    else if (mood.hush > 0.3) crowd.lookAt(tableMid);
    else crowd.lookAt(null);
    crowd.update(dt, t);
  }

  return {
    group: crowd.root,
    react,
    update,
    get drawCalls() {
      return crowd.drawCalls;
    },
    dispose: () => crowd.dispose()
  };
}
