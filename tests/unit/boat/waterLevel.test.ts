import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { BoatStatus } from "../../../src/physics/states/boatState";
import { createBoatRig, fillWaterColumn, simulateBoatTick } from "../../helpers/unit/botcraftTestSupport";

// Boat.checkInWater: the water level is a float, the block's y plus its fluid height (8 / 9F for a source: 1F - 1 / 9F
// before 1.13), here 100.88888549804688 over the pool of v_boat_forward (source water at y 99 - 100).
describe("Boat water level", () => {
  for (const [version, entityName] of [["1.12.2", "boat"], ["1.21.11", "oak_boat"]]) {
    it(`is the float height of the water surface (${version}, v_boat_forward)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(0.5, 100.523260515014, 2125.5), floorY: 99, entityName });
      for (let x = -2; x <= 3; x++) for (let z = 2123; z <= 2128; z++) fillWaterColumn(rig.world, x, z, 99, 100);
      rig.boatState.status = rig.boatState.previousStatus = BoatStatus.IN_WATER;

      simulateBoatTick(rig);

      expect(rig.boatState.status).toBe(BoatStatus.IN_WATER);
      expect(rig.boatState.waterLevel).toBe(100.88888549804688);
    });
  }
});
