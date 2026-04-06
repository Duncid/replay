const WRITE_INDEX = 0;
const DROPPED_SAMPLES = 1;

export type SharedRingBuffer = {
  pcm: Float32Array;
  state: Int32Array;
  capacity: number;
};

export function createSharedRingBuffer(capacity: number): {
  pcmSAB: SharedArrayBuffer;
  stateSAB: SharedArrayBuffer;
  capacity: number;
} {
  const pcmSAB = new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * capacity);
  const stateSAB = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const state = new Int32Array(stateSAB);
  state[WRITE_INDEX] = 0;
  state[DROPPED_SAMPLES] = 0;
  return { pcmSAB, stateSAB, capacity };
}

export function attachSharedRingBuffer(
  pcmSAB: SharedArrayBuffer,
  stateSAB: SharedArrayBuffer,
  capacity: number,
): SharedRingBuffer {
  return {
    pcm: new Float32Array(pcmSAB),
    state: new Int32Array(stateSAB),
    capacity,
  };
}

export class RingBufferReader {
  private readIndex = 0;

  constructor(private readonly ring: SharedRingBuffer) {}

  readAvailable(maxSamples?: number): Float32Array {
    const writeIndex = Atomics.load(this.ring.state, WRITE_INDEX);
    let available = writeIndex - this.readIndex;
    if (available <= 0) {
      return new Float32Array(0);
    }

    // Writer has wrapped and overwritten unread data.
    if (available > this.ring.capacity) {
      const dropped = available - this.ring.capacity;
      this.readIndex = writeIndex - this.ring.capacity;
      available = this.ring.capacity;
      Atomics.add(this.ring.state, DROPPED_SAMPLES, dropped);
    }

    const readCount = maxSamples ? Math.min(maxSamples, available) : available;
    const out = new Float32Array(readCount);
    for (let i = 0; i < readCount; i++) {
      const idx = (this.readIndex + i) % this.ring.capacity;
      out[i] = this.ring.pcm[idx];
    }
    this.readIndex += readCount;
    return out;
  }

  getDroppedSamples(): number {
    return Atomics.load(this.ring.state, DROPPED_SAMPLES);
  }
}
