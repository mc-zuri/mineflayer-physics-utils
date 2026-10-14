import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// TridentItem.releaseUsing (1.13+): letting go of a riptide trident used for 10 ticks or more, in water, pushes the
// player along the float look vector by 3 * (1 + level) / 4 (1.5 + 0.75 per level above the first from 1.21), before
// the player's tick.
// Recorded as q_riptide_<level>_*: in a pool of still water facing east (yaw 270), the use key held 15 ticks, released
// on tick 16.
const recorded: { recording: string; level: number; pitch: number; start: Vec3; startVelY: number; pos: [number, number]; vel: [number, number] }[] = [
  {
    recording: "q_riptide_1_surface",
    level: 1,
    pitch: -30,
    start: new Vec3(0.5, 99.50934976026788, 1833.5),
    startVelY: -0.039123737159862414,
    pos: [1.799044132232666, 100.22021565189982],
    vel: [1.0392353212719456, 0.5636927217797392],
  },
  {
    recording: "q_riptide_3_underwater_level",
    level: 3,
    pitch: 0,
    start: new Vec3(0.5, 98.745601944531, 1833.5),
    startVelY: -0.024120391938858576,
    pos: [3.5, 98.72148155259214],
    vel: [2.400000035762787, -0.02429631383862434],
  },
];

describe("Botcraft riptide", () => {
  for (const version of ["1.13.2", "1.21.11"]) {
    for (const { recording, level, pitch, start, startVelY, pos, vel } of recorded) {
      it(`launches by riptide ${level} on release (${version}, ${recording})`, () => {
        const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: 97 });
        const world = createFlatWorld(version, 97);
        for (let x = -3; x <= 5; x++) {
          for (let y = 97; y <= 100; y++) {
            for (let z = 1831; z <= 1835; z++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.water.id);
          }
        }
        const state = rig.playerState;
        state.vel.set(0, startVelY, 0);
        state.onGround = false;
        state.isInWater = true;
        state.isUnderWater = pitch === 0;
        state.eyeInWater = pitch === 0;
        state.yawDegrees = 270;
        state.pitch = (-pitch * Math.PI) / 180;
        state.riptide = level;
        state.itemUseTicks = 15;
        state.isUsingItem = false; // released this tick

        rig.physics.simulate(rig.playerCtx, world as any);

        expect(state.pos.x).toBe(pos[0]);
        expect(state.pos.y).toBe(pos[1]);
        expect(state.vel.x).toBe(vel[0]);
        expect(state.vel.y).toBe(vel[1]);
        expect(state.autoSpinAttackTicks).toBe(19);
      });
    }
  }

  it("does not launch a trident used for less than 10 ticks", () => {
    const version = "1.21.11";
    const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 98.745601944531, 1833.5), groundLevel: 97 });
    const world = createFlatWorld(version, 97);
    for (let x = -3; x <= 5; x++) {
      for (let y = 97; y <= 100; y++) {
        for (let z = 1831; z <= 1835; z++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.water.id);
      }
    }
    const state = rig.playerState;
    state.vel.set(0, 0, 0);
    state.onGround = false;
    state.isInWater = true;
    state.yawDegrees = 270;
    state.riptide = 3;
    state.itemUseTicks = 9;
    state.isUsingItem = false;

    rig.physics.simulate(rig.playerCtx, world as any);

    expect(state.vel.x).toBe(0);
    expect(state.itemUseTicks).toBe(0);
  });
});
