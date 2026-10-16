import { describe, it } from "mocha";
import expect from "expect";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// m_c_mount_click_pig: a pig summoned without AI facing west (yaw 90) at (2.5, 101, 3151.5), not yet on the ground,
// mounted by a player looking east (yaw 270) with a carrot on a stick. 1.21.5's LivingEntity.travelRidden moves the
// mob only where it runs its AI (isEffectiveAi, which a mob without AI does not): the pig turns to its rider and stops
// where it is. 1.21.6 moves it where the client simulates it (canSimulateMovement), AI or not.
function mountedPig(version: string) {
  const world = createFlatWorld(version, 101);
  const rig = createRiddenMobRig({ version, type: "pig", pos: [2.5, 101, 3151.5], vel: [0, 0, 0], yawDegrees: 90, onGround: false });
  rig.state.noAi = true;
  rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 30.327999114990234 });
  return rig.state;
}

describe("RiddenMobPhysics mob without AI", () => {
  it("turns to its rider and does not move (1.21.5, m_c_mount_click_pig tick 42)", () => {
    const pig = mountedPig("1.21.5");
    expect(pig.yawDegrees).toBe(270);
    expect([pig.pos.x, pig.pos.y, pig.pos.z]).toEqual([2.5, 101, 3151.5]);
    expect([pig.vel.x, pig.vel.y, pig.vel.z]).toEqual([0, 0, 0]);
    expect(pig.onGround).toBe(false);
  });

  it("moves as any ridden mob (1.21.6, m_c_mount_click_pig tick 42)", () => {
    const pig = mountedPig("1.21.6");
    expect(pig.pos.x).toBe(2.505624999757856);
    expect(pig.vel.x).toBe(0.005118749927170568);
    expect(pig.vel.y).toBe(-0.0784000015258789);
  });
});
