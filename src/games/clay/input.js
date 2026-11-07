/** Keep one gesture tied to the finger or primary mouse button that began it.
 * In particular, releasing a second finger on GLÄTTA must not stop shaping. */
export function createPointerSession() {
  let pointerId = null;
  return {
    get active() { return pointerId !== null; },
    begin(event) {
      const { pointerId: nextPointerId } = event;
      if (pointerId !== null || !Number.isInteger(nextPointerId)) return false;
      if (event.pointerType === 'mouse' && event.button !== 0) return false;
      pointerId = nextPointerId;
      return true;
    },
    owns(event) { return pointerId !== null && event.pointerId === pointerId; },
    release(event) {
      if (pointerId === null || event.pointerId !== pointerId) return false;
      pointerId = null;
      return true;
    },
    reset() {
      const previous = pointerId;
      pointerId = null;
      return previous;
    }
  };
}
