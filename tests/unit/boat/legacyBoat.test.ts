import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBoatRig } from "../../helpers/unit/botcraftTestSupport";
import { fastAtan2 } from "../../../src/util/mth";

// m_c_mount_click_oak_boat on 1.8.8: the boat (yaw 90) rests on the stone; its rider (yaw 270) holds forward from tick
// 50, so the boat's tick 51 takes the walk input 0.98F that tick left. The client runs EntityBoat.onUpdate for the boat
// its player rides: the push along the rider's yaw by 0.07 * 0.98F * 0.05F, halved on the ground, then 0.99F kept.
describe("1.8 boat ridden by its player (EntityBoat.onUpdate)", () => {
  const rider = { yaw: 270, forward: Math.fround(0.98), strafe: 0 };
  function onStone() {
    const rig = createBoatRig({ version: "1.8.8", position: new Vec3(2.5, 101, 3175.5), floorY: 101, entityName: "Boat" });
    rig.boatState.setYawDegrees(90);
    rig.boatState.onGround = true;
    return rig;
  }

  it("is pushed along its rider's yaw, halved on the ground (1.8.8, m_c_mount_click_oak_boat ticks 51 - 52)", () => {
    const rig = onStone();
    rig.physics.simulateLegacy(rig.boatCtx, rig.world, rider);
    expect(rig.boatState.pos.x).toBe(2.501715000058934);
    expect(rig.boatState.vel.x).toBe(0.001697850074700267);
    expect(rig.boatState.pos.y).toBe(101);
    expect(rig.boatState.vel.y).toBe(0);
    expect(rig.boatState.onGround).toBe(true);
    // (speeding up, its speed multiplier grows by a 35th toward 0.35)
    expect(rig.boatState.speedMultiplier).toBe(0.07 + (0.35 - 0.07) / 35);
    rig.physics.simulateLegacy(rig.boatCtx, rig.world, rider);
    expect(rig.boatState.pos.x).toBe(2.504474925161954);
    expect(rig.boatState.vel.x).toBe(0.0027323258783100526);
    // (it went less than 0.001 squared: its yaw stays)
    expect(rig.boatState.yawDegrees).toBe(90);
  });

  it("drifts without a rider's input, its multiplier back toward 0.07", () => {
    const rig = onStone();
    rig.boatState.speedMultiplier = 0.1;
    rig.physics.simulateLegacy(rig.boatCtx, rig.world, { yaw: 270, forward: 0, strafe: 0 });
    expect(rig.boatState.pos.x).toBe(2.5);
    expect(rig.boatState.speedMultiplier).toBe(0.1 - (0.1 - 0.07) / 35);
  });
});

// MathHelper.atan2 of 1.8.8 - 1.12.2 (the arcsine table and its correction), as the 1.8.8 client computes it
describe("MathHelper.atan2 (1.8.8)", () => {
  const cases: Array<[number, number, number]> = [
    [0.1, -0.2, 2.677945576658694],
    [-0.03, 0.0004, -1.5574658909046806],
    [-1e-3, -2e-3, -2.6779459999828576],
    [0, -0.05, 3.141592653589793],
    [0.00001, -0.07, 3.1414498221881564],
  ];
  for (const [y, x, expected] of cases) {
    it(`atan2(${y}, ${x})`, () => expect(fastAtan2(y, x)).toBe(expected));
  }
});
