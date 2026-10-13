/**
 * Vanilla's Mth.sin / Mth.cos: a 65536-entry float table.
 *
 * Before 1.21.11 the table holds sin(i * 2PI / 65536) and the argument is a float scaled by 10430.378F in float
 * arithmetic. Since 1.21.11 the table holds sin(i / 10430.378350470453) and the argument is a double scaled by that
 * constant and truncated as a long. JavaScript's Math.sin builds both tables bit for bit like Java's (each entry is
 * rounded to a float).
 */
const f32 = Math.fround;

const SIN_SCALE_F = f32(10430.378);
const SIN_SCALE = 10430.378350470453;

let legacyTable: Float32Array | undefined;
let modernTable: Float32Array | undefined;

function legacy(): Float32Array {
  if (!legacyTable) {
    legacyTable = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) legacyTable[i] = Math.sin((i * Math.PI * 2) / 65536);
  }
  return legacyTable;
}

function modern(): Float32Array {
  if (!modernTable) {
    modernTable = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) modernTable[i] = Math.sin(i / SIN_SCALE);
  }
  return modernTable;
}

/** Java's (int) of a float or double: toward zero, NaN to 0, saturating at the int range. */
export function javaInt(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value >= 2147483647) return 2147483647;
  if (value <= -2147483648) return -2147483648;
  return Math.trunc(value);
}

/** The low 16 bits of Java's (long) of a double: toward zero, NaN to 0, saturating at the long range. */
function javaLongLow16(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value >= 2 ** 63) return 65535; // Long.MAX_VALUE
  if (value < -(2 ** 63)) return 0; // Long.MIN_VALUE
  // ToInt32 of an integral double keeps its low 32 bits exactly (two's complement), so the low 16 match the long's
  return Math.trunc(value) & 65535;
}

export interface Mth {
  /** Mth.sin of an angle in radians (a float before 1.21.11, a double since) */
  sin(radians: number): number;
  cos(radians: number): number;
}

const legacyMth: Mth = {
  sin: (radians) => legacy()[javaInt(f32(f32(radians) * SIN_SCALE_F)) & 65535],
  cos: (radians) => legacy()[javaInt(f32(f32(f32(radians) * SIN_SCALE_F) + 16384)) & 65535],
};

const modernMth: Mth = {
  sin: (radians) => modern()[javaLongLow16(radians * SIN_SCALE)],
  cos: (radians) => modern()[javaLongLow16(radians * SIN_SCALE + 16384)],
};

/** The Mth of a version: true for 1.21.11 and later. */
export function mthFor(doubleArgument: boolean): Mth {
  return doubleArgument ? modernMth : legacyMth;
}

/** Degrees to radians as vanilla scales a float rotation: yaw * 0.017453292F, in float. */
export function floatRadians(degrees: number): number {
  return f32(f32(degrees) * f32(0.017453292));
}
