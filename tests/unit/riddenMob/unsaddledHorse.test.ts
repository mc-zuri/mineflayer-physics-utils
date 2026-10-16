import { describe, it } from "mocha";
import expect from "expect";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// m_c_mount_click_horse (1.14.4): a horse (MOVEMENT_SPEED 0.2253205) ridden with no keys at (2.5, 101, 3095.5) loses
// its saddle at tick 47 (its flags: tame, not saddled). Before 1.19 its rider still controls it (canPassengerSteer is
// its first passenger's), and AbstractHorse.travel without a saddle moves it on its own input: the zza the last
// Mob.setSpeed left at its speed, 0.98F of it each aiStep, at that speed on the ground. A horse that rears is immobile:
// its input goes to 0 (m_c_open_horse_riding).
function horse() {
  const version = "1.14.4";
  const world = createFlatWorld(version, 101);
  const rig = createRiddenMobRig({ version, type: "horse", pos: [2.5, 101, 3095.5], vel: [0, -0.0784000015258789, 0], yawDegrees: 270 });
  rig.state.movementSpeed = 0.2253204976009042;
  const tick = () => rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 22.29400062561035, xxa: 0, zza: 0 });
  return { ...rig, tick };
}

describe("RiddenMobPhysics unsaddled horse", () => {
  it("goes on the input its last speed left once its saddle is gone (1.14.4, m_c_mount_click_horse ticks 47 and 48)", () => {
    const { state, tick } = horse();
    tick(); // saddled, no keys: it stands, its own input is its speed
    expect(state.pos.x).toBe(2.5);
    state.saddled = false;
    tick();
    expect(state.pos.x).toBe(2.5497539427432576);
    expect(state.vel.x).toBe(0.027165655893181092);
    tick();
    expect(state.pos.x).toBe(2.6251351516229424);
    expect(state.vel.x).toBe(0.0411581448289345);
  });

  it("stops its own input while it rears", () => {
    const { state, tick } = horse();
    tick();
    state.saddled = false;
    tick();
    const x = state.pos.x;
    const vx = state.vel.x;
    state.standing = true;
    tick();
    expect(state.ownForward).toBe(0);
    expect(state.pos.x).toBe(x + vx * 0.98);
  });
});
