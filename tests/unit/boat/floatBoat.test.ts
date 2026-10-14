import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBoatRig, fillWaterColumn, simulateBoatTick } from "../../helpers/unit/botcraftTestSupport";

// v_boat_forward tick 1: a boat settled on a pool of still source water (y 99 - 100) whose input is not applied yet.
// Boat.floatBoat pulls it toward the water level, 100.8888889F (8 / 9F above the top water block), in double
// arithmetic: gravity 0.04F and buoyancy 0.06153846016296973 per unit before 1.20.5, 0.04 and 0.04 / 0.65 since.
const recorded: { version: string; entityName: string; velY: number; nextVelY: number; nextY: number }[] = [
  { version: "1.12.2", entityName: "boat", velY: -4.440000679617473e-9, nextVelY: -4.722174984372884e-9, nextY: 100.52326051029182 },
  { version: "1.13.2", entityName: "boat", velY: -4.440000679617473e-9, nextVelY: -4.722174984372884e-9, nextY: 100.52326051029182 },
  { version: "1.21.11", entityName: "oak_boat", velY: -4.440001475855548e-9, nextVelY: -4.722175614077506e-9, nextY: 100.52326051029182 },
];

describe("Boat floatBoat", () => {
  for (const { version, entityName, velY, nextVelY, nextY } of recorded) {
    it(`floats toward the water level as vanilla (${version}, v_boat_forward tick 1)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(0.5, 100.523260515014, 2125.5), floorY: 99, entityName });
      for (let x = -2; x <= 3; x++) for (let z = 2123; z <= 2128; z++) fillWaterColumn(rig.world, x, z, 99, 100);
      rig.boatState.vel = new Vec3(0, velY, 0);
      rig.boatState.status = rig.boatState.previousStatus = 0; // IN_WATER, as the boat sat the tick before

      simulateBoatTick(rig);

      expect(rig.boatState.vel.y).toBe(nextVelY);
      expect(rig.boatState.pos.y).toBe(nextY);
      expect(rig.boatState.vel.x).toBe(0);
    });
  }
});

// The same tick on 1.20.4 and 1.20.6, around the gravity's change to the double 0.04: their boats sit a little higher
// (Entity.move drops moves under 1.0E-7 squared there), and 1.20.6's is at the fixed point of its buoyancy.
const aroundDoubleGravity = [
  { version: "1.20.4", y: 100.52334181621595, velY: -0.000025473708472461068, nextVelY: -0.0000257775412316006 },
  { version: "1.20.6", y: 100.52334181630349, velY: -0.000026689068836262958, nextVelY: -0.000026689068836262958 },
];

describe("Boat floatBoat around 1.20.5", () => {
  for (const { version, y, velY, nextVelY } of aroundDoubleGravity) {
    it(`pulls the boat toward the water level as vanilla (${version}, v_boat_forward tick 1)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(0.5, y, 2125.5), floorY: 99 });
      for (let x = -2; x <= 3; x++) for (let z = 2123; z <= 2128; z++) fillWaterColumn(rig.world, x, z, 99, 100);
      rig.boatState.vel = new Vec3(0, velY, 0);
      rig.boatState.status = rig.boatState.previousStatus = 0;

      simulateBoatTick(rig);

      expect(rig.boatState.vel.y).toBe(nextVelY);
    });
  }
});
