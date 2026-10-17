import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { BoatStatus } from "../../../src/physics/states/boatState";
import { createBoatRig, simulateBoatTick } from "../../helpers/unit/botcraftTestSupport";

// v_boat_on_land_push tick 89 (and v_boat_bubble_up, v_boat_ice...): a boat coming to rest on stone, its motion under
// 1.0E-7 after the ground's friction. Entity.move drops such a move (Shapes.collide; 1.14 - 1.17 always, the world
// border being a shape, from 1.18 only for a shape the swept box meets) and before 1.18 stops the axis whose move
// changed (movement.x != collided.x); 1.18+ stops it only on a horizontal collision (beyond Mth.equal's 1.0E-5F).
const recorded = [
  { version: "1.13.2", entityName: "boat", yaw: 270, velX: 0 },
  { version: "1.14.4", entityName: "boat", yaw: 270, velX: 0 },
  { version: "1.16.5", entityName: "boat", yaw: 270, velX: 0 },
  { version: "1.17.1", entityName: "boat", yaw: -90, velX: 0 },
  { version: "1.18.2", entityName: "boat", yaw: -90, velX: 6.140931279367179e-8 },
];

describe("Boat tiny motion", () => {
  for (const { version, entityName, yaw, velX } of recorded) {
    it(`${velX === 0 ? "stops" : "keeps"} a motion under 1.0E-7 on land (${version}, v_boat_on_land_push tick 89)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(36.49945513436251, 101, 2125.5), floorY: 101, entityName });
      const state = rig.boatState;
      state.vel = new Vec3(1.0234886075658713e-7, 0, 0);
      state.status = state.previousStatus = BoatStatus.ON_LAND;
      state.controllingPlayer = true;
      state.setYawDegrees(yaw);

      simulateBoatTick(rig);

      expect(state.vel.x).toBe(velX);
      expect(state.pos.x).toBe(36.49945513436251);
    });
  }
});
