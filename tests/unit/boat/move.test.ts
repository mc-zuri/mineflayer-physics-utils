import { describe, it } from "mocha";
import expect from "expect";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
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

// v_boat_forward tick 5 on 1.12.2: before 1.14 the boat keeps its own box, which the move shifts; the position is
// taken from the shifted box, so it can differ from the box rebuilt around the position in the last bit.
describe("Boat move with its own box (before 1.14)", () => {
  it("moves the boat's own box and places the boat from it (1.12.2, v_boat_forward tick 5)", () => {
    const rig = boatOnPool("1.12.2", 100.52326049837288, -3.331152744270871e-9);
    const state = rig.boatState;
    state.pos.x = 0.7243999913603067;
    state.vel = new Vec3(0.10839999490678319, -3.331152744270871e-9, 0);
    state.box = new AABB(0.03689999136030685, 100.52326049837288, 2124.8125, 1.4118999913603067, 101.08576049837288, 2126.1875);
    state.setYawDegrees(270);
    state.control.forward = true;

    simulateBoatTick(rig);

    expect(state.vel.x).toBe(0.13755999193757792);
    expect(state.pos.x).toBe(0.8619599832978847);
    expect(state.box!.minX).toBe(0.17445998329788476);
    expect(state.box!.maxX).toBe(1.5494599832978846);
  });
});

// v_boat_onto_land tick 24: the boat runs into the shore wall with a tiny sinking motion. From 1.13 a motion under
// 1.0E-7 that meets a shape stays (VoxelShapes.calculateMaxOffset), so 1.13.2 lands on the spot; 1.12.2 still sinks.
const intoTheShore = [
  { version: "1.12.2", nextY: 100.52326049849721, nextVelY: -1.721213276073552e-10, onGround: false },
  { version: "1.13.2", nextY: 100.52326049866933, nextVelY: 0, onGround: true },
];

describe("Boat move into the shore", () => {
  for (const { version, nextY, nextVelY, onGround } of intoTheShore) {
    it(`keeps or drops a tiny motion meeting a block (${version}, v_boat_onto_land tick 24)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(24.054516729478955, 100.52326049866933, 2125.5), floorY: 99 });
      for (let z = 2123; z <= 2128; z++) {
        for (let x = 21; x <= 24; x++) fillWaterColumn(rig.world, x, z, 99, 100);
        for (let x = 25; x <= 27; x++) rig.world.setStone(new Vec3(x, 100, z));
      }
      const state = rig.boatState;
      state.vel = new Vec3(0.3606090928335157, -1.6139742667342638e-10, 0);
      state.box = new AABB(23.367016729478955, 100.52326049866933, 2124.8125, 24.742016729478955, 101.08576049866933, 2126.1875);
      state.status = state.previousStatus = BoatStatus.IN_WATER;
      state.setYawDegrees(270);
      state.control.forward = true;

      simulateBoatTick(rig);

      expect(state.pos.x).toBe(24.3125);
      expect(state.pos.y).toBe(nextY);
      expect(state.vel.y).toBe(nextVelY);
      expect(state.onGround).toBe(onGround);
    });
  }
});

// v_boat_dismount tick 4 on 1.14.4: 1.14 - 1.16 still keep the entity's own box and place it from the moved box
// (Entity.setLocationFromBoundingbox), so the position is the box's centre, not the position plus the motion.
describe("Boat move with its own box (1.14 - 1.16)", () => {
  it("places the boat from its moved box (1.14.4, v_boat_dismount tick 4)", () => {
    const rig = boatOnPool("1.14.4", 100.52329062800678, -0.000024499169649019534);
    const state = rig.boatState;
    state.pos.x = 0.6159999964535237;
    state.vel = new Vec3(0.07599999734759333, -0.000024499169649019534, 0);
    state.box = new AABB(-0.07150000354647634, 100.52329062800678, 2124.8125, 1.3034999964535237, 101.08579062800678, 2126.1875);
    state.setYawDegrees(270);
    state.control.forward = true;

    simulateBoatTick(rig);

    expect(state.pos.x).toBe(0.7243999913603067);
    expect(state.pos.y).toBe(100.52326978142776);
  });
});
