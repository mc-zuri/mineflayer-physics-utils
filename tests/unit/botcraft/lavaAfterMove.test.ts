import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// LivingEntity.checkFallDamage looks at the fluids again where the move ended, for a player not in water: water alone
// (updateInWaterStateAndDoWaterCurrentPushing) until 26.1, the whole updateFluidInteraction, lava included, since.
// Recorded as b_lava_walk_in: walking east (yaw 270) off a stone ledge into a pool of source lava (y 99 - 100),
// tick 12, from 100.9216 above the 100.8889 lava top to 100.7664 in it. Both versions move alike; only 26.1 ends the
// tick in lava.
const START = new Vec3(-4.384817994356104, 100.92159999847412, 1937.5);
const recorded = [
  { version: "1.21.11", isInLava: false },
  { version: "26.1", isInLava: true },
];

describe("Botcraft lava after the move", () => {
  for (const { version, isInLava } of recorded) {
    it(`${isInLava ? "enters" : "does not enter"} lava where the move ends (${version}, b_lava_walk_in)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: START, groundLevel: 99 });
      const world = createFlatWorld(version, 99);
      const { lava, stone } = rig.mcData.blocksByName;
      for (let z = 1932; z <= 1942; z++) {
        for (let y = 99; y <= 100; y++) {
          for (let bx = -10; bx <= -6; bx++) world.setOverrideBlock(new Vec3(bx, y, z), stone.id);
          for (let bx = -5; bx <= -2; bx++) world.setOverrideBlock(new Vec3(bx, y, z), lava.id);
        }
      }
      const state = rig.playerState;
      state.vel.set(0.11770754062540936, -0.1552320045166016, 0);
      state.onGround = false;
      state.yawDegrees = 270;
      state.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.x).toBe(-4.247510453787319);
      expect(state.pos.y).toBe(100.76636799395752);
      expect(state.vel.x).toBe(0.12494986551862786);
      expect(state.vel.y).toBe(-0.230527368912964);
      expect(state.isInLava).toBe(isInLava);
    });
  }
});
