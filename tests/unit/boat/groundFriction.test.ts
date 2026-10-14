import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { BoatStatus } from "../../../src/physics/states/boatState";
import { createBoatRig, simulateBoatTick } from "../../helpers/unit/botcraftTestSupport";

// v_boat_on_land_push tick 3: a boat pushed forward on stone. Boat.getGroundFriction is the float average of the
// blocks' friction under it (0.6F), and the motion is scaled by that float.
describe("Boat ground friction", () => {
  for (const [version, entityName, yaw] of [["1.12.2", "boat", 270], ["1.21.11", "oak_boat", -90]] as const) {
    it(`slows the boat by the blocks' float friction (${version}, v_boat_on_land_push tick 3)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(30.53999999910593, 101, 2125.5), floorY: 101, entityName });
      const state = rig.boatState;
      state.vel = new Vec3(0.03999999910593033, 0, 0);
      state.status = state.previousStatus = BoatStatus.ON_LAND;
      state.controllingPlayer = true;
      state.setYawDegrees(yaw);
      state.control.forward = true;

      simulateBoatTick(rig);

      expect(state.vel.x).toBe(0.06399999713897708);
      expect(state.pos.x).toBe(30.60399999624491);
    });
  }
});
