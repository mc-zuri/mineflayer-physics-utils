import { afterEach, describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const version = "1.12.2";
const groundLevel = 67;

// Recorded vanilla 1.12.2 clients: the cases start where the recorder put them (the world's floor at y 101, facing
// south), since the double additions of a position depend on where it starts.
const recordedFloor = 101;

// (standing where it starts, as the recorded clients were)
function recordedRig(position: Vec3, keys: { forward?: boolean; sprint?: boolean }) {
  const rig = createBotcraftPlayerRig({ version, position, groundLevel: position.y });
  rig.playerState.yawDegrees = 0;
  Object.assign(rig.playerState.control, keys);
  return rig;
}

describe("World movement simulation", () => {
  const fakeWorld = createFlatWorld(version, groundLevel);

  afterEach(() => {
    fakeWorld.clearOverrides();
  });

  it("sprints on stone as vanilla (j_sprint_f)", () => {
    const world = createFlatWorld(version, recordedFloor);
    const rig = recordedRig(new Vec3(0.5, recordedFloor, 38.5), { forward: true, sprint: true });

    for (let tick = 1; tick <= 40; tick++) {
      rig.physics.simulate(rig.playerCtx, world as any);
      if (tick === 10) {
        expect(rig.playerState.pos.z).toBe(40.969480138054706);
        expect(rig.playerState.vel.z).toBe(0.15285598415478233);
      }
    }

    expect(rig.playerState.pos).toEqual(new Vec3(0.5, recordedFloor, 49.38718760985601));
    expect(rig.playerState.vel.z).toBe(0.15321675645889346);
  });

  it("supports sprint-jumping", () => {
    const rig = createBotcraftPlayerRig({
      version,
      position: new Vec3(0, groundLevel, 0),
      groundLevel,
    });

    rig.playerState.control.forward = true;
    rig.playerState.control.sprint = true;

    for (let i = 0; i < 4; i++) {
      rig.physics.simulate(rig.playerCtx, fakeWorld as any);
      rig.playerState.apply(rig.fakePlayer);
    }

    rig.playerState.control.jump = true;

    for (let i = 0; i < 12; i++) {
      rig.physics.simulate(rig.playerCtx, fakeWorld as any);
      rig.playerState.apply(rig.fakePlayer);
    }

    expect(rig.fakePlayer.entity.position.y).toEqual(groundLevel);
    expect(rig.fakePlayer.entity.position.z).toBeCloseTo(-4.377196331671886, 8);
  });

  // pb_walk_off_edge / pb_sprint_off_edge: off the south edge of a stone platform (y 105, x -5..5, z 148..158) onto
  // the floor at 101, the keys held for the first 20 / 25 ticks.
  for (const { recording, sprint, heldTicks, landingTick, z, velocityZ } of [
    { recording: "pb_walk_off_edge", sprint: false, heldTicks: 20, landingTick: 22, z: 161.3764334931624, velocityZ: 0.13559491296610499 },
    { recording: "pb_sprint_off_edge", sprint: true, heldTicks: 25, landingTick: 20, z: 162.04997115972765, velocityZ: 0.2203958157680558 },
  ]) {
    it(`walks off a ledge and lands as vanilla (${recording})`, () => {
      const world = createFlatWorld(version, recordedFloor);
      for (let x = -5; x <= 5; x++) {
        for (let platformZ = 148; platformZ <= 158; platformZ++) world.setOverrideBlock(new Vec3(x, 105, platformZ), 1);
      }
      const rig = recordedRig(new Vec3(0.5, 106, 157.5), { forward: true, sprint });

      for (let tick = 1; tick <= landingTick; tick++) {
        if (tick > heldTicks) rig.playerState.control.forward = rig.playerState.control.sprint = false;
        rig.physics.simulate(rig.playerCtx, world as any);
        if (tick === landingTick - 1) expect(rig.playerState.pos.y).toBeGreaterThan(recordedFloor);
      }

      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.pos).toEqual(new Vec3(0.5, recordedFloor, z));
      expect(rig.playerState.vel.z).toBe(velocityZ);
    });
  }

  it("jumps and falls back to the ground", () => {
    const rig = createBotcraftPlayerRig({
      version,
      position: new Vec3(0, groundLevel, 0),
      groundLevel,
    });

    rig.playerState.control.jump = true;

    for (let i = 0; i < 3; i++) {
      rig.physics.simulate(rig.playerCtx, fakeWorld as any);
      rig.playerState.apply(rig.fakePlayer);
    }

    expect(rig.fakePlayer.entity.position.y).toEqual(groundLevel + 1.001335979112147);

    for (let i = 0; i < 9; i++) {
      rig.physics.simulate(rig.playerCtx, fakeWorld as any);
      rig.playerState.apply(rig.fakePlayer);
    }

    expect(rig.fakePlayer.entity.position.y).toEqual(groundLevel);
  });
});
