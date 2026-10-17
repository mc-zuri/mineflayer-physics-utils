import { describe, it } from "mocha";
import expect from "expect";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { Vec3 } from "vec3";
import { createBoatRig, createFlatWorld, createHorseRig } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// Before 1.13 a fence's arms come from its neighbours (BlockFence.getActualState): two oak fences joined north - south
// at x 0 (z 0 and z -1) fill the gap their posts alone leave between z -0.375 and 0.375. A horse, boat or ridden mob
// collides with them as the player does.
describe("collision shapes from the neighbours before 1.13 (horses, boats, ridden mobs)", () => {
  // (the gap between the two posts)
  const gap = new AABB(0.3, 101, -0.3, 0.7, 101.5, 0.3);
  for (const version of ["1.8.8", "1.12.2"]) {
    const boatName = version === "1.8.8" ? "Boat" : "boat";
    const fences = (world: { setBlock(pos: Vec3, type: number, metadata?: number): void }, fence: number) => {
      world.setBlock(new Vec3(0, 101, 0), fence);
      world.setBlock(new Vec3(0, 101, -1), fence);
    };

    it(`a boat meets the joined fences' arms (${version})`, () => {
      const rig = createBoatRig({ version, position: new Vec3(1.5, 101, 0), floorY: 101, entityName: boatName });
      fences(rig.world, rig.mcData.blocksByName.fence.id);
      expect(rig.physics.getSurroundingBBs(gap, rig.world).some((bb) => bb.intersects(gap))).toBe(true);
    });

    it(`a horse meets the joined fences' arms (${version})`, () => {
      const rig = createHorseRig({ version, position: new Vec3(1.5, 101, 0), floorY: 101, entityName: version === "1.8.8" ? "EntityHorse" : "horse" });
      fences(rig.world, rig.mcData.blocksByName.fence.id);
      expect(rig.physics.getSurroundingBBs(gap, rig.world).some((bb) => bb.intersects(gap))).toBe(true);
    });

    it(`a ridden mob's world gives a fence its arms (${version})`, () => {
      const rig = createRiddenMobRig({ version, type: "pig", pos: [1.5, 101, 0], vel: [0, 0, 0], yawDegrees: 90 });
      const world = createFlatWorld(version, 101);
      const fence = rig.mcData.blocksByName.fence.id;
      world.setOverrideBlock(new Vec3(0, 101, 0), fence);
      world.setOverrideBlock(new Vec3(0, 101, -1), fence);
      // (the world the mob ticks in, as simulate sets it)
      (rig.physics as any).colliderWorld = world;
      const pos = new Vec3(0, 101, 0);
      const shapes: number[][] = (rig.physics as any).collisionShapes(world.getBlock(pos), pos);
      // the post and its arm to the north, reaching z 0
      expect(shapes.some((shape) => shape[2] === 0)).toBe(true);
    });
  }
});
