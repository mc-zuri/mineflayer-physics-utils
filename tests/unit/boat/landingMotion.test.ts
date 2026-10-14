import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { BoatStatus } from "../../../src/physics/states/boatState";
import { createBoatRig, simulateBoatTick } from "../../helpers/unit/botcraftTestSupport";

// A boat on the ground falls by its gravity every tick and lands again. From 1.14 Block.updateEntityAfterFallOn
// multiplies the motion by (1, 0, 1), which leaves the fall's sign: -0. Before, Block.onEntityLand sets 0.
// Recorded as v_boat_on_land_push tick 3: a boat pushed forward on stone.
const recorded = [
  { version: "1.13.2", entityName: "boat", yaw: 270, velY: 0 },
  { version: "1.21.11", entityName: "oak_boat", yaw: -90, velY: -0 },
  { version: "26.1", entityName: "oak_boat", yaw: -90, velY: -0 },
] as const;

describe("Boat landing motion", () => {
  for (const { version, entityName, yaw, velY } of recorded) {
    it(`lands with a vertical motion of ${Object.is(velY, -0) ? "-0" : "0"} (${version}, v_boat_on_land_push tick 3)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(30.53999999910593, 101, 2125.5), floorY: 101, entityName });
      const state = rig.boatState;
      state.vel = new Vec3(0.03999999910593033, velY, 0);
      state.status = state.previousStatus = BoatStatus.ON_LAND;
      state.controllingPlayer = true;
      state.setYawDegrees(yaw);
      state.control.forward = true;

      simulateBoatTick(rig);

      expect(state.pos.y).toBe(101);
      expect(state.onGround).toBe(true);
      expect(state.vel.y).toBe(velY);
    });
  }
});
