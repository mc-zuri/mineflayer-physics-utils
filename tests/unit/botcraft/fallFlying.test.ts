import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { PlayerPoses } from "../../../src/physics/states/poses";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 64;

type Vec = [number, number, number];

// A gliding tick of the recording f_elytra_spiral (tick 60: yaw -312, pitch 20), from the state vanilla had before it.
// The look vector comes from Mth.sin/cos of the float rotation (the legacy -yaw - PI form before 1.13), the lift from
// the float Mth.cos of the pitch before 1.18.2 and Java's Math.cos since; before 1.13 gravity is -0.08 + lift * 0.06.
const recorded: { version: string; pos: Vec; vel: Vec; nextPos: Vec; nextVel: Vec }[] = [
  {
    version: "1.12.2",
    pos: [4.568960889343993, 117.42286529435839, 2215.2278013453824],
    vel: [-0.42705983122737007, -0.2270311681123478, -0.0267849673163522],
    nextPos: [4.14211133902384, 117.19588525113609, 2215.2456530050745],
    nextVel: [-0.4268495503201526, -0.2269800432222916, 0.017851659691826987],
  },
  {
    version: "1.13.2",
    pos: [4.568971074740189, 117.42286529435839, 2215.2284482827968],
    vel: [-0.42705053597942466, -0.2270311681123478, -0.026783798710440863],
    nextPos: [4.142130494041336, 117.19588525113609, 2215.246300363937],
    nextVel: [-0.42684058069885267, -0.2269800432222916, 0.01785208113985952],
  },
  {
    version: "1.20.4",
    pos: [4.081470585129684, 118.19658996241333, 2215.596320481638],
    vel: [-0.4204554051532339, -0.22678178082529504, -0.023861676079476556],
    nextPos: [3.66101878504543, 117.9698284405623, 2215.6163147769994],
    nextVel: [-0.42045180008425387, -0.22676152185103168, 0.019994295361239818],
  },
  {
    version: "1.21.11",
    pos: [4.081470585129684, 118.19658996241333, 2215.596320481638],
    vel: [-0.4204554051532339, -0.22678178082529504, -0.023861676079476556],
    nextPos: [3.66101878504543, 117.9698284405623, 2215.6163147769994],
    nextVel: [-0.42045180008425387, -0.22676152185103168, 0.019994295361239818],
  },
];

describe("Botcraft fall flying", () => {
  for (const { version, pos, vel, nextPos, nextVel } of recorded) {
    it(`glides toward the float look vector as vanilla (${version}, f_elytra_spiral)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(...pos), groundLevel });
      const state = rig.playerState;
      state.vel = new Vec3(...vel);
      state.onGround = false;
      state.validElytraEquipped = true;
      state.fireworkRocketDuration = 0;
      state.fallFlying = true;
      state.pose = PlayerPoses.FALL_FLYING;
      state.yawDegrees = -312;
      state.pitch = (-20 * Math.PI) / 180; // mineflayer's pitch looks up; vanilla's 20 looks down

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(state.vel.x).toBe(nextVel[0]);
      expect(state.vel.y).toBe(nextVel[1]);
      expect(state.vel.z).toBe(nextVel[2]);
      expect(state.pos.x).toBe(nextPos[0]);
      expect(state.pos.y).toBe(nextPos[1]);
      expect(state.pos.z).toBe(nextPos[2]);
    });
  }
});
