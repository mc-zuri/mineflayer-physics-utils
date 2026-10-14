import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// The fluid height that scales a shallow current is the fluid's top above the bottom of the box deflated by 0.001
// (Entity.updateFluidHeightAndDoFluidPushing) until 26.1, above the bottom of the box itself since
// (EntityFluidInteraction.update: fluidTop - entity.getBoundingBox().minY), 0.001 deeper.
// Recorded as n_waterfall_inside: standing at the top of a one-block column of falling water (x 0, z 2667, y 101 - 109
// under a source at 110, stone to the east and at the western corners), ticks 1 and 2. On tick 2 the feet are at
// 106.986: the block there, the first one met, still sees the running height of its own top (107) above the bottom,
// under 0.4, and its current is scaled by it.
const recorded = [
  { version: "1.21.11", y: 106.96040599983311, velY: -0.02547520043861863 },
  { version: "26.1", y: 106.96040133316644, velY: -0.02547893377200761 },
];

function waterfall(version: string, water: number, stone: number) {
  const world = createFlatWorld(version, 100);
  for (let y = 101; y <= 110; y++) {
    for (const [x, z] of [[-1, 2666], [-1, 2668], [1, 2666], [1, 2667], [1, 2668]]) world.setOverrideBlock(new Vec3(x, y, z), stone);
    world.setOverrideBlock(new Vec3(0, y, 2667), water, y === 110 ? 0 : 8);
  }
  for (let x = -1; x <= 1; x++) {
    for (let z = 2666; z <= 2668; z++) world.setOverrideBlock(new Vec3(x, 111, z), stone);
  }
  return world;
}

describe("Botcraft fluid height from the box", () => {
  for (const { version, y, velY } of recorded) {
    it(`measures the depth from the ${version === "26.1" ? "box's own" : "deflated box's"} bottom (${version}, n_waterfall_inside)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 107, 2667.5), groundLevel: 100 });
      const { water, stone } = rig.mcData.blocksByName;
      const world = waterfall(version, water.id, stone.id);
      const state = rig.playerState;
      state.vel.set(0, 0, 0);
      state.onGround = true;

      rig.physics.simulate(rig.playerCtx, world as any);
      expect(state.pos.y).toBe(106.986);
      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.y).toBe(y);
      expect(state.vel.y).toBe(velY);
    });
  }
});
