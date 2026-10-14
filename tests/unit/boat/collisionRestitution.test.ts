import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { BoatStatus } from "../../../src/physics/states/boatState";
import { createBoatRig, fillWaterColumn, simulateBoatTick } from "../../helpers/unit/botcraftTestSupport";

// 26.2 replaced Entity.move's reset of a collided axis (0) and Block.updateEntityAfterFallOn (the fall times 0) with
// Entity.restituteMovementAfterCollisions: each collided axis becomes -v times the boat's bounciness, 0. Running east
// into the shore that is -0 along x, and a sinking motion stopped on the spot becomes 0 instead of -0.
// Recorded as v_boat_onto_land tick 24: the boat runs into the stone shore (x 25) with a tiny sinking motion.
const recorded = [
  { version: "26.1", velX: 0, velY: -0 },
  { version: "26.2", velX: -0, velY: 0 },
  { version: "26.3", velX: -0, velY: 0 },
];

describe("Boat collision restitution", () => {
  for (const { version, velX, velY } of recorded) {
    it(`stops a collided axis as ${version === "26.1" ? "the old reset" : "-v * 0"} (${version}, v_boat_onto_land tick 24)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(24.054516729478955, 100.52326049866933, 2125.5), floorY: 99, entityName: "oak_boat" });
      for (let z = 2123; z <= 2128; z++) {
        for (let x = 21; x <= 24; x++) fillWaterColumn(rig.world, x, z, 99, 100);
        for (let x = 25; x <= 27; x++) rig.world.setStone(new Vec3(x, 100, z));
      }
      const state = rig.boatState;
      state.vel = new Vec3(0.3606090928335157, -1.613974318775968e-10, 0);
      state.status = state.previousStatus = BoatStatus.IN_WATER;
      state.setYawDegrees(-90);
      state.control.forward = true;

      simulateBoatTick(rig);

      expect(state.pos.x).toBe(24.3125);
      expect(state.pos.y).toBe(100.52326049866933);
      expect(state.vel.x).toBe(velX);
      expect(state.vel.y).toBe(velY);
    });
  }
});
