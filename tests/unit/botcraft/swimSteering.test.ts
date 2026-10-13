import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Player.travel steers a swimmer toward the look direction: vy += (lookY - vy) * (lookY < -0.2 ? 0.085 : 0.06), with
// lookY = getLookAngle().y, the float -Mth.sin(xRot * 0.017453292F).
// Recorded as b_water_sprint_swim_surface_up: sprinting east (yaw 270) looking up (pitch -60) in still water, tick 3,
// the first tick swimming.
const recorded: { version: string; y: number; velY: number }[] = [
  { version: "1.20.4", y: 99.04319960635304, velY: 0.03855968565701969 },
  { version: "1.21.11", y: 99.04319960635304, velY: 0.03855968565701969 },
];

describe("Botcraft swim steering", () => {
  for (const { version, y, velY } of recorded) {
    it(`pulls toward the float look vector (${version}, b_water_sprint_swim_surface_up)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5548800000751019, 98.995, 1833.5), groundLevel: 97 });
      const world = createFlatWorld(version, 97);
      for (let x = -3; x <= 4; x++) {
        for (let wy = 97; wy <= 100; wy++) {
          for (let z = 1831; z <= 1835; z++) world.setOverrideBlock(new Vec3(x, wy, z), rig.mcData.blocksByName.water.id);
        }
      }
      const state = rig.playerState;
      state.vel.set(0.03175199927741287, -0.004000000059604645, 0);
      state.onGround = false;
      state.isInWater = true;
      state.isUnderWater = true;
      state.eyeInWater = true;
      state.sprinting = true;
      state.yawDegrees = 270;
      state.pitch = (60 * Math.PI) / 180;
      state.control.forward = true;
      state.control.sprint = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.swimming).toBe(true);
      expect(state.pos.y).toBe(y);
      expect(state.vel.y).toBe(velY);
    });
  }
});
