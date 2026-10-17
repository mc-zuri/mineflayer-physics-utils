import { describe, it } from "mocha";
import expect from "expect";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// c_ride_pig_dismount (1.9.4, 1.10.2): before 1.11 a pig is its first passenger's to move (canPassengerSteer), stick
// or not; without the stick it is not steered (EntityPig.moveEntityWithHeading: canBeSteered) and goes on its own
// input: it stands where it is, falling into the ground at -0.0784 a tick (not damped by 0.98 as one the server moves).
// Once steered, its own input is the speed it was steered at (setAIMoveSpeed), which it keeps going on.
function pig() {
  const version = "1.10.2";
  const world = createFlatWorld(version, 101);
  const rig = createRiddenMobRig({ version, type: "pig", pos: [0.5, 101, 3245.5], vel: [0, -0.0784000015258789, 0], yawDegrees: 270 });
  rig.state.saddled = false;
  const tick = () => rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 0 });
  return { ...rig, tick };
}

describe("RiddenMobPhysics unsteered pig", () => {
  it("stands on its own input without its rider's stick (1.10.2, c_ride_pig_dismount)", () => {
    const { state, tick } = pig();
    for (let t = 0; t < 3; t++) tick();
    expect([state.pos.x, state.pos.y, state.pos.z]).toEqual([0.5, 101, 3245.5]);
    expect(state.vel.y).toBe(-0.0784000015258789);
    expect(state.yawDegrees).toBe(270);
  });

  it("goes on the speed it was steered at once the stick is gone", () => {
    const { state, tick } = pig();
    state.saddled = true;
    tick();
    const steered = state.riddenSpeed;
    expect(state.ownForward).toBe(steered);
    state.saddled = false;
    tick();
    expect(state.ownForward).toBe(Math.fround(steered * Math.fround(0.98)));
  });
});
