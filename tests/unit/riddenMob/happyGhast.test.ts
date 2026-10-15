import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";
import { floatRadians, mthFor } from "../../../src/util/mth";

const f32 = Math.fround;

// A harnessed happy ghast (1.21.6+) its rider steers: HappyGhast.getRiddenInput takes the rider's strafe, its pitch for
// a forward or back input (half and reversed backwards) and 0.5 up while it jumps, scaled by 3.9F * FLYING_SPEED (0.05);
// tickRidden turns it 0.08F of the way to its rider's yaw; HappyGhast.travel flies (travelFlying) at
// FLYING_SPEED * 5.0F / 3.0F, without gravity, keeping 0.91F of the motion in the air.
const SCALE = 3.9000000953674316 * 0.05;
const SPEED = f32(f32(f32(0.05) * 5) / 3);
const AIR_DRAG = 0.9100000262260437;

// play.mcraft.fun (26.3, packets-replay-2026-10-15T17_09_13): where the ridden ghast was (the vehicle_move the client
// kept sending) and the rider's look when it pressed forward and jump
const LOGGED = {
  pos: [116.820556640625, 70.53369140625, 173.854736328125] as [number, number, number],
  ghastYaw: 4.21875,
  riderYaw: 341.8500061035156,
  riderPitch: 32.55000305175781,
};

// the version's Mth (a float table argument before 1.21.11, a double since)
function mthOf(version: string) {
  return mthFor(!["1.21.6", "1.21.8"].includes(version));
}

describe("RiddenMobPhysics happy ghast", () => {
  for (const version of ["1.21.6", "1.21.8", "1.21.11", "26.1", "26.3"]) {
    const rig = (yawDegrees = 0) =>
      createRiddenMobRig({ version, type: "happy_ghast", pos: [0.5, 80, 0.5], vel: [0, 0, 0], yawDegrees, onGround: false });

    it(`rises on the rider's jump and does not fall (${version})`, () => {
      const world = createFlatWorld(version, 60);
      const { physics, ctx, state } = rig();
      physics.simulateRidden(ctx, world as any, { yawDegrees: 0, pitchDegrees: 0, jumping: true });
      const vy = f32(0.5) * SCALE * SPEED;
      expect(state.pos.y).toBe(80 + vy);
      expect(state.vel.y).toBe(vy * AIR_DRAG);
      expect([state.pos.x, state.pos.z]).toEqual([0.5, 0.5]);
      // no input: it keeps 0.91F of its motion, no gravity
      physics.simulateRidden(ctx, world as any, { yawDegrees: 0, pitchDegrees: 0 });
      expect(state.vel.y).toBe(vy * AIR_DRAG * AIR_DRAG);
      expect(state.pos.y).toBe(80 + vy + vy * AIR_DRAG);
    });

    it(`flies forward along its rider's pitch: looking down it descends (${version})`, () => {
      const world = createFlatWorld(version, 60);
      const { physics, ctx, state } = rig();
      const mth = mthOf(version);
      const pitch = floatRadians(45);
      physics.simulateRidden(ctx, world as any, { yawDegrees: 0, pitchDegrees: 45, zza: f32(0.98) });
      // facing south (yaw 0): forward is +z
      const vz = mth.cos(pitch) * SCALE * SPEED;
      const vy = -mth.sin(pitch) * SCALE * SPEED;
      expect(state.pos.z).toBe(0.5 + vz);
      expect(state.pos.y).toBe(80 + vy);
      expect(state.vel.y).toBeLessThan(0);
      expect(state.pitchDegrees).toBe(22.5);
    });

    it(`backs off at half the speed, reversed along the pitch (${version})`, () => {
      const world = createFlatWorld(version, 60);
      const { physics, ctx, state } = rig();
      const mth = mthOf(version);
      const pitch = floatRadians(-30);
      physics.simulateRidden(ctx, world as any, { yawDegrees: 0, pitchDegrees: -30, zza: f32(-0.98) });
      const vz = f32(mth.cos(pitch) * f32(-0.5)) * SCALE * SPEED;
      const vy = f32(-mth.sin(pitch) * f32(-0.5)) * SCALE * SPEED;
      expect(state.pos.z).toBe(0.5 + vz);
      expect(state.pos.y).toBe(80 + vy);
      expect(state.vel.z).toBeLessThan(0);
      expect(state.vel.y).toBeLessThan(0);
    });

    it(`strafes on the rider's xxa as it is (${version})`, () => {
      const world = createFlatWorld(version, 60);
      const { physics, ctx, state } = rig();
      physics.simulateRidden(ctx, world as any, { yawDegrees: 0, pitchDegrees: 0, xxa: f32(0.98) });
      // left of facing south is +x
      expect(state.pos.x).toBe(0.5 + f32(0.98) * SCALE * SPEED);
      expect(state.pos.z).toBe(0.5);
    });

    it(`turns 0.08F of the way to its rider's yaw each tick (${version})`, () => {
      const world = createFlatWorld(version, 60);
      const { physics, ctx, state } = rig(350);
      physics.simulateRidden(ctx, world as any, { yawDegrees: 10, pitchDegrees: 0 });
      // Mth.wrapDegrees(10 - 350) = 20
      expect(state.yawDegrees).toBe(f32(350 + f32(20 * f32(0.08))));
      physics.simulateRidden(ctx, world as any, { yawDegrees: -90, pitchDegrees: 0 });
      const before = f32(350 + f32(20 * f32(0.08)));
      expect(state.yawDegrees).toBe(f32(f32(before + f32(f32(-90 - before + 360) * f32(0.08))) % 360));
    });

    it(`goes forward and up as its rider asked in the logged ride (${version}, packets-replay-2026-10-15T17_09_13)`, () => {
      const world = createFlatWorld(version, 60);
      const { physics, ctx, state } = createRiddenMobRig({
        version,
        type: "happy_ghast",
        pos: LOGGED.pos,
        vel: [0, 0, 0],
        yawDegrees: LOGGED.ghastYaw,
        onGround: false,
      });
      const mth = mthOf(version);
      physics.simulateRidden(ctx, world as any, {
        yawDegrees: LOGGED.riderYaw,
        pitchDegrees: LOGGED.riderPitch,
        zza: f32(0.98),
        jumping: true,
      });
      // tickRidden turns first: wrapDegrees(341.85 - 4.21875) = -22.37, 0.08F of it
      const yaw = f32(LOGGED.ghastYaw + f32(f32(f32(f32(LOGGED.riderYaw) - LOGGED.ghastYaw) - 360) * f32(0.08)));
      expect(state.yawDegrees).toBe(yaw);
      const pitch = floatRadians(LOGGED.riderPitch);
      const forward = mth.cos(pitch) * SCALE * SPEED;
      const up = f32(-mth.sin(pitch) + f32(0.5)) * SCALE * SPEED;
      const sin = mth.sin(floatRadians(yaw));
      const cos = mth.cos(floatRadians(yaw));
      expect(state.pos.x).toBe(LOGGED.pos[0] + (0 * cos - forward * sin));
      expect(state.pos.y).toBe(LOGGED.pos[1] + up);
      expect(state.pos.z).toBe(LOGGED.pos[2] + (forward * cos + 0 * sin));
      // it moved (the client the log came from kept the ghast where it was): south, and a little down, the jump's 0.5 up
      // short of the -sin of a 32.55 degree look down
      expect(state.pos.z).toBeGreaterThan(LOGGED.pos[2]);
      expect(state.pos.y).toBeLessThan(LOGGED.pos[1]);
    });

    it(`stops rising under a block (${version})`, () => {
      const world = createFlatWorld(version, 60);
      const { mcData, physics, ctx, state } = rig();
      // a stone ceiling just above its 4-high box
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) world.setOverrideBlock(new Vec3(x, 84, z), mcData.blocksByName.stone.id);
      for (let t = 0; t < 40; t++) physics.simulateRidden(ctx, world as any, { yawDegrees: 0, pitchDegrees: 0, jumping: true });
      expect(state.pos.y).toBe(80);
      // from 26.2 Entity.restituteMovementAfterCollisions leaves -vy * 0
      expect(state.vel.y).toBe(["26.3"].includes(version) ? -0 : 0);
    });
  }
});
