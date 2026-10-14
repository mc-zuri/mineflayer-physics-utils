import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { BoatStatus } from "../../../src/physics/states/boatState";
import { createBoatRig, fillWaterColumn, simulateBoatTick } from "../../helpers/unit/botcraftTestSupport";

function boatOnPool(version: string, y: number, velY: number, entityName = "boat") {
  const rig = createBoatRig({ version, position: new Vec3(0.5, y, 2125.5), floorY: 99, entityName });
  for (let x = -2; x <= 3; x++) for (let z = 2123; z <= 2128; z++) fillWaterColumn(rig.world, x, z, 99, 100);
  rig.boatState.vel = new Vec3(0, velY, 0);
  rig.boatState.status = rig.boatState.previousStatus = BoatStatus.IN_WATER;
  return rig;
}

// v_boat_forward tick 1: the settling boat's tiny vertical motion. 1.14 - 1.21.1 Entity.move moves only by more than
// 1.0E-7 squared, so the 1.20.4 boat stays put; 1.21.2+ also moves when nothing blocked the motion (1.21.11 sinks by
// 4.7e-9); before 1.14 the position is the moved box's.
describe("Boat move", () => {
  it("does not move by 1.0E-7 squared or less (1.20.4, v_boat_forward tick 1)", () => {
    const rig = boatOnPool("1.20.4", 100.52334181621595, -0.000025473708472461068);
    simulateBoatTick(rig);
    expect(rig.boatState.pos.y).toBe(100.52334181621595);
    expect(rig.boatState.vel.y).toBe(-0.0000257775412316006);
  });

  it("moves when nothing blocks the motion (1.21.11, v_boat_forward tick 1)", () => {
    const rig = boatOnPool("1.21.11", 100.523260515014, -4.440001475855548e-9, "oak_boat");
    simulateBoatTick(rig);
    expect(rig.boatState.pos.y).toBe(100.52326051029182);
  });

  it("takes the position from the moved box before 1.14 (1.12.2, v_boat_turn_left tick 3)", () => {
    const rig = boatOnPool("1.12.2", 100.52326050574547, -4.546344654909884e-9);
    rig.boatState.pos.x = 0.5049992306157947;
    rig.boatState.pos.z = 2125.499912279978;
    rig.boatState.vel = new Vec3(0.004999230615794659, -4.546344654909884e-9, -0.00008772002183832228);
    rig.boatState.setYawDegrees(269);
    rig.boatState.yawVelocity = -1;
    rig.boatState.control.left = true;
    simulateBoatTick(rig);
    expect(rig.boatState.pos.x).toBe(0.5144921332337145);
    expect(rig.boatState.pos.z).toBe(2125.4995803332063);
  });
});

// v_boat_onto_land: the boat rests against the shore (its box ends at x 25, the stone's face). From 1.18 Entity.collide
// gathers only the shapes that meet the box swept along the motion, so the touching stone leaves the boat's tiny
// vertical motion alone: 1.21.11 sinks by 5.1e-11 (tick 82); 1.20.4 keeps the motion though it does not move by it.
const atTheShore = [
  { version: "1.21.11", entityName: "oak_boat", y: 100.52326049866933, velY: 0, nextY: 100.52326049861826, nextVelY: -5.107326020437064e-11 },
  { version: "1.20.4", entityName: "boat", y: 100.52326348459798, velY: -9.802013090105116e-7, nextY: 100.52326348459798, nextVelY: -9.802013230305467e-7 },
];

describe("Boat move against the shore", () => {
  for (const { version, entityName, y, velY, nextY, nextVelY } of atTheShore) {
    it(`keeps a tiny vertical motion beside a block it only touches (${version}, v_boat_onto_land)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(24.3125, y, 2125.5), floorY: 99, entityName });
      for (let z = 2123; z <= 2128; z++) {
        for (let x = 21; x <= 24; x++) fillWaterColumn(rig.world, x, z, 99, 100);
        for (let x = 25; x <= 27; x++) rig.world.setStone(new Vec3(x, 100, z));
      }
      rig.boatState.vel = new Vec3(0, velY, 0);
      rig.boatState.status = rig.boatState.previousStatus = BoatStatus.IN_WATER;

      simulateBoatTick(rig);

      expect(rig.boatState.vel.y).toBe(nextVelY);
      expect(rig.boatState.pos.y).toBe(nextY);
    });
  }
});
