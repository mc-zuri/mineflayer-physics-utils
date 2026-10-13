import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// LivingEntity.travel in lava since 1.16: in lava no deeper than getFluidJumpThreshold (0.4) the motion is scaled by
// (0.5, 0.8, 0.5) and falls by the water's falling adjustment (gravity / 16) before lava's gravity / 4; deeper lava
// halves all of it.
// Recorded as b_lava_walk_in: walking east (yaw 270) off a stone ledge into a pool of source lava, tick 13, the
// first tick in lava, 0.12 deep.
const recorded = ["1.20.4", "1.21.11"];

describe("Botcraft shallow lava", () => {
  for (const version of recorded) {
    it(`drags shallow lava like water vertically (${version}, b_lava_walk_in)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(-4.247510453787319, 100.76636799395752, 1937.5), groundLevel: 99 });
      const world = createFlatWorld(version, 99);
      const { lava, stone } = rig.mcData.blocksByName;
      for (let z = 1932; z <= 1942; z++) {
        for (let y = 99; y <= 100; y++) {
          for (let bx = -10; bx <= -6; bx++) world.setOverrideBlock(new Vec3(bx, y, z), stone.id);
          for (let bx = -5; bx <= -2; bx++) world.setOverrideBlock(new Vec3(bx, y, z), lava.id);
        }
      }
      const state = rig.playerState;
      state.vel.set(0.12494986551862786, -0.230527368912964, 0);
      state.onGround = false;
      state.yawDegrees = 270;
      state.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.isInLava).toBe(true);
      expect(state.pos.x).toBe(-4.102960588325315);
      expect(state.pos.y).toBe(100.53584062504456);
      expect(state.vel.x).toBe(0.07227493273100172);
      expect(state.vel.y).toBe(-0.20942189787847157);
    });
  }
});
