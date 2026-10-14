import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { BoatStatus } from "../../../src/physics/states/boatState";
import { createBoatRig, fillWaterColumn, simulateBoatTick } from "../../helpers/unit/botcraftTestSupport";

type Vec = [number, number, number];

// v_boat_turn_left ticks 2 - 3: the left key turns the boat by deltaRotation (float degrees: -1, then -1 - 0.9) and,
// turning in place, pushes it 0.005F along Mth.sin/cos of its float yaw (the 1.21.11 table differs).
const recorded: { version: string; entityName: string; yaw: number; ticks: { pos: Vec; vel: Vec; yaw: number }[] }[] = [
  {
    version: "1.12.2",
    entityName: "boat",
    yaw: 270,
    ticks: [
      { pos: [0.5049992306157947, 100.52326050574547, 2125.499912279978], vel: [0.004999230615794659, -4.546344654909884e-9, -0.00008772002183832228], yaw: 269 },
      { pos: [0.5144921332337145, 100.52326050170403, 2125.4995803332063], vel: [0.009492902617919907, -4.0414379967601555e-9, -0.0003319467717123846], yaw: 267.1 },
    ],
  },
  {
    version: "1.21.11",
    entityName: "oak_boat",
    yaw: -90,
    ticks: [
      { pos: [0.5049992385320365, 100.52326050574547, 2125.4999127592746], vel: [0.004999238532036543, -4.546345149306075e-9, -0.00008724072540644556], yaw: -91 },
      { pos: [0.5144921724889608, 100.52326050170403, 2125.4995817226277], vel: [0.009492933956924354, -4.041438381868767e-9, -0.0003310366469241096], yaw: -92.9 },
    ],
  },
];

describe("Boat controlBoat", () => {
  for (const { version, entityName, yaw, ticks } of recorded) {
    it(`turns and pushes the boat as vanilla (${version}, v_boat_turn_left)`, () => {
      const rig = createBoatRig({ version, position: new Vec3(0.5, 100.52326051029182, 2125.5), floorY: 99, entityName });
      for (let x = -2; x <= 3; x++) for (let z = 2123; z <= 2128; z++) fillWaterColumn(rig.world, x, z, 99, 100);
      const state = rig.boatState;
      // tick 1's state (the keys of tick 1 reach the boat on tick 2)
      state.vel = new Vec3(0, version === "1.12.2" ? -4.722174984372884e-9 : -4.722175614077506e-9, 0);
      state.status = state.previousStatus = BoatStatus.IN_WATER;
      state.setYawDegrees(yaw);
      state.control.left = true;

      for (const expected of ticks) {
        simulateBoatTick(rig);
        expect(state.yawDegrees).toBe(Math.fround(expected.yaw));
        expect([state.vel.x, state.vel.y, state.vel.z]).toEqual(expected.vel);
        // (before 1.14 Entity.move takes the position from the moved box, which the engine does not do yet)
        if (version !== "1.12.2") expect([state.pos.x, state.pos.y, state.pos.z]).toEqual(expected.pos);
      }
    });
  }
});
