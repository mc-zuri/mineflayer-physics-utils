/**
 * The sin and cos behind vanilla's direct java.lang.Math calls (not Mth's table, see mth.ts). V8's Math.sin and
 * Math.cos differ from HotSpot's in the last bit on about 3% of inputs, so a caller that replays the vanilla client
 * bit for bit installs Java's own with setJavaTrig (the root workspace's java-math addon provides them).
 */
export interface JavaTrig {
  sin(radians: number): number;
  cos(radians: number): number;
}

export const javaTrig: JavaTrig = { sin: Math.sin, cos: Math.cos };

export function setJavaTrig({ sin, cos }: JavaTrig): void {
  javaTrig.sin = sin;
  javaTrig.cos = cos;
}
