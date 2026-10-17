import { describe, it } from "mocha";
import expect from "expect";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { Vec3 } from "vec3";
import { BoatStatus } from "../../../src/physics/states/boatState";
import { createBoatRig } from "../../helpers/unit/botcraftTestSupport";

// Before 1.13 flowing water and lava are blocks of their own (flowing_water, flowing_lava: BlockDynamicLiquid) of the
// water's and lava's material: a horse or boat in them is in water or lava, and the flowing water's level pushes it
// (Entity.handleWaterMovement, World.handleMaterialAcceleration, BlockLiquid.getFlow).
describe("flowing water and lava before 1.13 (the horse and boat engines)", () => {
  for (const version of ["1.8.8", "1.12.2"]) {
    it(`flowing water is water, its current pushes (${version})`, () => {
      const rig = createBoatRig({ version, position: new Vec3(0.5, 101, 0.5), floorY: 100, entityName: version === "1.8.8" ? "Boat" : "boat" });
      const flowing = rig.mcData.blocksByName.flowing_water.id;
      // (level 1 here, 2 to the east: the current goes east)
      rig.world.setBlock(new Vec3(0, 101, 0), flowing, 1);
      rig.world.setBlock(new Vec3(1, 101, 0), flowing, 2);
      const vel = { x: 0, y: 0, z: 0 };
      const inWater = rig.physics.isInWaterApplyCurrent(new AABB(0.2, 101.1, 0.2, 0.8, 101.5, 0.8), vel, rig.world);
      expect(inWater).toBe(true);
      expect(vel.x).toBe(0.014);
      expect(vel.z).toBe(0);
    });

    it(`flowing lava is lava (${version})`, () => {
      const rig = createBoatRig({ version, position: new Vec3(0.5, 101, 0.5), floorY: 100, entityName: version === "1.8.8" ? "Boat" : "boat" });
      rig.world.setBlock(new Vec3(0, 101, 0), rig.mcData.blocksByName.flowing_lava.id, 1);
      expect(rig.physics.isMaterialInBB(new AABB(0.2, 101.1, 0.2, 0.8, 101.5, 0.8), rig.mcData.blocksByName.lava.id, rig.world)).toBe(true);
    });
  }

  it("a boat on flowing water floats on it (1.12.2)", () => {
    const rig = createBoatRig({ version: "1.12.2", position: new Vec3(0.5, 100.8, 0.5), floorY: 100 });
    const flowing = rig.mcData.blocksByName.flowing_water.id;
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) rig.world.setBlock(new Vec3(x, 100, z), flowing, 0);
    rig.physics.settleStatus(rig.boatCtx, rig.world);
    expect(rig.boatState.status).toBe(BoatStatus.IN_WATER);
  });
});
