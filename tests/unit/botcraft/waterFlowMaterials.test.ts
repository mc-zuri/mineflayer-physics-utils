import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Before 1.13 BlockLiquid.getFlow asks the neighbours' materials, not their collision boxes: a neighbour without water
// whose material does not block movement lets the flow drop toward the water below it (a sign's wood does block it, a
// carpet's or a ladder's does not), and falling water turns down beside a block solid to it (isBlockSolid, the
// material's isSolid; 1.12's causesDownwardCurrent, a solid face, and never glass, leaves, slabs or stairs). The
// clients' own tests of every block state, 1.8.9 - 1.12.2.
function flowAt(version: string, place: (world: any, ids: any) => void, level: number) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 0.5), groundLevel: 101 });
  const world = createFlatWorld(version, 101);
  const ids = rig.mcData.blocksByName;
  // a channel of stone around the water at (0, 101, 0), water under the east side
  for (const [x, z] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) world.setOverrideBlock(new Vec3(x, 101, z), ids.stone.id);
  world.setOverrideBlock(new Vec3(1, 100, 0), ids.water.id, 0);
  world.setOverrideBlock(new Vec3(0, 101, 0), ids.flowing_water.id, level);
  place(world, ids);
  return rig.physics.getFlow(world.getBlock(new Vec3(0, 101, 0)) as any, world as any);
}

describe("Botcraft water flow by the neighbours' materials before 1.13", () => {
  for (const version of ["1.8.8", "1.12.2"]) {
    it(`does not drop through a sign beside (${version})`, () => {
      const flow = flowAt(version, (world, ids) => world.setOverrideBlock(new Vec3(1, 101, 0), ids.standing_sign.id, 0), 2);
      expect([flow.x, flow.y, flow.z]).toEqual([0, 0, 0]);
    });

    it(`drops through a carpet beside, toward the water under it (${version})`, () => {
      const flow = flowAt(version, (world, ids) => world.setOverrideBlock(new Vec3(1, 101, 0), ids.carpet.id, 0), 2);
      expect([flow.x, flow.y, flow.z]).toEqual([1, 0, 0]);
    });
  }

  // falling water (level 8) beside glass: glass's material is solid before 1.12; 1.12 never turns down at glass
  for (const [version, down] of [["1.8.8", true], ["1.12.2", false]] as const) {
    it(`${down ? "turns" : "does not turn"} falling water down beside glass (${version})`, () => {
      const flow = flowAt(version, (world, ids) => {
        world.setOverrideBlock(new Vec3(-1, 101, 0), ids.glass.id);
        for (const [x, z] of [[0, -1], [0, 1], [1, 0]]) world.setOverrideBlock(new Vec3(x, 101, z), ids.air.id);
        world.setOverrideBlock(new Vec3(1, 100, 0), ids.stone.id);
      }, 8);
      expect(flow.y < 0).toBe(down);
    });
  }
});
