import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { BoatStatus } from "../../../src/physics/states/boatState";
import { createBoatRig, fillWaterColumn, simulateBoatTick } from "../../helpers/unit/botcraftTestSupport";

// v_boat_forward tick 1, from a boat met afloat (a fresh state, as for a boat the bot boards): its status the tick
// before is where it floats now, so the tick floats it (Boat.floatBoat) instead of snapping it onto the water.
describe("Boat settleStatus", () => {
  it("starts a boat met afloat from the water it floats on (1.21.11, v_boat_forward tick 1)", () => {
    const rig = createBoatRig({ version: "1.21.11", position: new Vec3(0.5, 100.523260515014, 2125.5), floorY: 99, entityName: "oak_boat" });
    for (let x = -2; x <= 3; x++) for (let z = 2123; z <= 2128; z++) fillWaterColumn(rig.world, x, z, 99, 100);
    rig.boatState.vel = new Vec3(0, -4.440001475855548e-9, 0);

    rig.physics.settleStatus(rig.boatCtx, rig.world);
    expect(rig.boatState.previousStatus).toBe(BoatStatus.IN_WATER);
    simulateBoatTick(rig);

    expect(rig.boatState.vel.y).toBe(-4.722175614077506e-9);
    expect(rig.boatState.pos.y).toBe(100.52326051029182);
  });
});
