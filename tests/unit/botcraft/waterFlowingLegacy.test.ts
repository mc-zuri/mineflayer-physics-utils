import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Before 1.13 flowing water is a block of its own (flowing_water, BlockDynamicLiquid) of water's material: it is water
// to Entity.handleWaterMovement and BlockLiquid.getFlow (getEffectiveFlowDecay reads any block of the material), so
// its current pushes as the still water's does.
// Recorded as m_c_item_water_bucket_place_pickup, ticks 51 - 53: standing still (yaw 270) at x 0.5 as the water poured
// at x 2 (now still water) reaches the player's block, flowing level 2 next to level 1 east of it and to air (over
// stone) north, south and west: the current, -x, pushes the player west by 0.014 a tick.
const recorded = ["1.8.8", "1.9.4", "1.10.2", "1.11.2", "1.12.2"];
const ticks = [
  { x: 0.486, velX: -0.011200000166893006 },
  { x: 0.46079999983310693, velX: -0.020160000433921816 },
  { x: 0.4266399993991851, velX: -0.02732800075435639 },
];

describe("Botcraft flowing water before 1.13", () => {
  for (const version of recorded) {
    it(`pushes as water (${version}, m_c_item_water_bucket_place_pickup)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 3748.5), groundLevel: 101 });
      const world = createFlatWorld(version, 101);
      const { water, flowing_water } = rig.mcData.blocksByName;
      const z = 3748;
      world.setOverrideBlock(new Vec3(2, 101, z), water.id, 0);
      for (const [x, dz, level] of [
        [1, 0, 1],
        [2, -1, 1],
        [2, 1, 1],
        [0, 0, 2],
        [1, -1, 2],
        [1, 1, 2],
      ]) {
        world.setOverrideBlock(new Vec3(x, 101, z + dz), flowing_water.id, level);
      }
      const state = rig.playerState;
      state.vel.set(0, -0.0784000015258789, 0);
      state.onGround = true;
      state.yawDegrees = 270;

      for (const { x, velX } of ticks) {
        rig.physics.simulate(rig.playerCtx, world as any);

        expect(state.isInWater).toBe(true);
        expect(state.pos.x).toBe(x);
        expect(state.pos.y).toBe(101);
        expect(state.pos.z).toBe(3748.5);
        expect(state.vel.x).toBe(velX);
        expect(state.vel.y).toBe(-0.02);
      }
    });
  }
});
