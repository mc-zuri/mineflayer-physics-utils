import { afterEach, describe, it } from "mocha";
import expect from "expect";
import fs from "fs";
import path from "path";
import { Vec3 } from "vec3";
import { PlayerPoses } from "../../../src/physics/states/poses";
import { JavaTrig, setJavaTrig } from "../../../src/util/javaTrig";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 64;
const f32 = Math.fround;

type Vec = [number, number, number];

// pitch 56 as vanilla scales it: 56 * 0.017453292F, in float
const pitch56 = f32(f32(56) * f32(0.017453292));
// Java's Math.cos of it; V8's Math.cos gives 0.5591928973939153
const javaCos56 = 0.5591928973939152;

// The root workspace's java-math addon (java.lang.Math through JNI), when this checkout sits in it and it is built.
function loadJavaMath(): JavaTrig | null {
  const dir = path.resolve(__dirname, "../../../../packages/java-math");
  if (!fs.existsSync(path.join(dir, "index.js"))) return null;
  return require(dir).load();
}

// The recording f_elytra_pitch_sweep_down_up, tick 36 (yaw 0, pitch 56), from the state vanilla had before it.
// From 1.18.2 LivingEntity.travel's glide lift squares Java's double Math.cos of the pitch (Mth.cos in float before).
const recorded: { version: string; pos: Vec; vel: Vec; nextPos: Vec; nextVel: Vec }[] = [
  {
    version: "1.20.4",
    pos: [0.5, 122.44682444032344, 2229.7381095067913],
    vel: [0, -0.49656865113679033, 0.5181196247863328],
    nextPos: [0.5, 121.91726730484591, 2230.266589150814],
    nextVel: [0, -0.5295571354775266, 0.5284796440228063],
  },
  {
    version: "1.21.11",
    pos: [0.5, 122.44682444032344, 2229.7381095067913],
    vel: [0, -0.49656865113679033, 0.5181196247863328],
    nextPos: [0.5, 121.91726730484591, 2230.266589150814],
    nextVel: [0, -0.5295571354775266, 0.5284796440228063],
  },
];

function glide(version: string, pos: Vec, vel: Vec) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(...pos), groundLevel });
  const state = rig.playerState;
  state.vel = new Vec3(...vel);
  state.onGround = false;
  state.validElytraEquipped = true;
  state.fireworkRocketDuration = 0;
  state.fallFlying = true;
  state.pose = PlayerPoses.FALL_FLYING;
  state.yawDegrees = 0;
  state.pitch = (-56 * Math.PI) / 180; // mineflayer's pitch looks up; vanilla's 56 looks down
  rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);
  return state;
}

describe("Botcraft fall flying lift with Java's Math.cos", () => {
  afterEach(() => setJavaTrig({ sin: Math.sin, cos: Math.cos }));

  for (const [version, usesJavaCos] of [["1.13.2", false], ["1.18.1", false], ["1.18.2", true], ["1.21.11", true]] as const) {
    it(`${usesJavaCos ? "takes" : "does not take"} the lift's cos from java.lang.Math (${version})`, () => {
      const calls: number[] = [];
      setJavaTrig({ sin: Math.sin, cos: (radians) => (calls.push(radians), Math.cos(radians)) });

      glide(version, [0.5, 122, 2229.7], [0, -0.5, 0.5]);

      expect(calls).toEqual(usesJavaCos ? [pitch56] : []);
    });
  }

  for (const { version, pos, vel, nextPos, nextVel } of recorded) {
    it(`glides as vanilla with Java's cos of the pitch (${version}, f_elytra_pitch_sweep_down_up)`, () => {
      setJavaTrig({ sin: Math.sin, cos: (radians) => (radians === pitch56 ? javaCos56 : Math.cos(radians)) });

      const state = glide(version, pos, vel);

      expect(state.vel.x).toBe(nextVel[0]);
      expect(state.vel.y).toBe(nextVel[1]);
      expect(state.vel.z).toBe(nextVel[2]);
      expect(state.pos.x).toBe(nextPos[0]);
      expect(state.pos.y).toBe(nextPos[1]);
      expect(state.pos.z).toBe(nextPos[2]);
    });

    it(`glides as vanilla with the java-math addon (${version}, f_elytra_pitch_sweep_down_up)`, function () {
      const javaMath = loadJavaMath();
      if (!javaMath) this.skip();
      setJavaTrig(javaMath);

      const state = glide(version, pos, vel);

      expect(state.vel.y).toBe(nextVel[1]);
      expect(state.pos.y).toBe(nextPos[1]);
    });
  }
});
