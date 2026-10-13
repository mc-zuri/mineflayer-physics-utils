import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { PlayerPoses } from "../../../src/physics/states/poses";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 64;

type Vec = [number, number, number];

// f_elytra_rocket_level: the first tick of a rocket (yaw 0, pitch -10). FireworkRocketEntity.tick, after the player's
// own tick, pulls the motion toward 1.5 times the float look vector (Entity.getLookAngle).
const recorded: { version: string; tick: number; pos: Vec; vel: Vec; nextPos: Vec; nextVel: Vec }[] = [
  {
    version: "1.15.2",
    tick: 10,
    pos: [0.5, 129.97902839906502, 2220.825563150126],
    vel: [0, -0.2707647785947148, 0.1023209011145955],
    nextPos: [0.5, 129.7223403193609, 2220.9515096564346],
    nextVel: [0, 0.01922124451932855, 0.9000519705052296],
  },
  {
    version: "1.21.11",
    tick: 11,
    pos: [0.5, 129.72234468323782, 2220.9515107112184],
    vel: [0, -0.2566852348670584, 0.12594715527249767],
    nextPos: [0.5, 129.47863237179573, 2221.099484747081],
    nextVel: [0, 0.025709128650328872, 0.9110657352824167],
  },
];

describe("Botcraft firework boost", () => {
  for (const { version, tick, pos, vel, nextPos, nextVel } of recorded) {
    it(`boosts toward the float look vector as vanilla (${version}, f_elytra_rocket_level tick ${tick})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(...pos), groundLevel });
      const state = rig.playerState;
      state.vel = new Vec3(...vel);
      state.onGround = false;
      state.validElytraEquipped = true;
      state.fallFlying = true;
      state.pose = PlayerPoses.FALL_FLYING;
      state.fireworkRocketDuration = 1;
      state.yawDegrees = 0;
      state.pitch = (10 * Math.PI) / 180; // vanilla's pitch -10, looking up

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(state.vel.x).toBe(nextVel[0]);
      expect(state.vel.y).toBe(nextVel[1]);
      expect(state.vel.z).toBe(nextVel[2]);
      expect(state.pos.y).toBe(nextPos[1]);
      expect(state.pos.z).toBe(nextPos[2]);
    });
  }
});
