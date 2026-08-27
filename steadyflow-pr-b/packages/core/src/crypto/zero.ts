/**
 * Zero out a buffer in place.
 * Best-effort: JS engines may copy buffers, but this still reduces the
 * window where plaintext sits in memory.
 */
export const zeroBuffer = (buf: Uint8Array | undefined | null): void => {
  if (!buf) return;
  for (let i = 0; i < buf.length; i++) {
    buf[i] = 0;
  }
};
