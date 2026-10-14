import { describe, it } from "mocha";
import expect from "expect";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// v_horse_walk, v_horse_jump_full_charge: a saddled horse (MOVEMENT_SPEED 0.225, JUMP_STRENGTH 0.7) ridden east
// (yaw 270) from rest at (0.5, 101, 2173.5) on stone. It takes its rider's input of the tick before (the vehicle
// ticks first: zza 0.98 while forward is held, xxa * 0.5F); a jump the rider charged to 90% and let go of lifts it at
// its next tick on the ground by JUMP_STRENGTH * the charge (AbstractHorse.travel before 1.19.4, executeRidersJump
// since).
const LEGACY_BOX: [number, number, number, number, number, number] = [-0.1982421875, 101, 2172.8017578125, 1.1982421875, 102.60000002384186, 2174.1982421875];

function horse(version: string) {
  const world = createFlatWorld(version, 101);
  const rig = createRiddenMobRig({
    version,
    type: "horse",
    pos: [0.5, 101, 2173.5],
    vel: [0, -0.0784000015258789, 0],
    yawDegrees: 270,
    box: version < "1.17" ? LEGACY_BOX : undefined,
  });
  rig.state.movementSpeed = 0.225;
  rig.state.jumpStrength = 0.7;
  return { world, ...rig };
}

// the recorded horse after its first tick of walking, and after the tick it jumped
const EXPECTED: Record<string, { walk: [number, number]; jump: [number, number] }> = {
  "1.12.2": { walk: [0.7204999476671219, 0.12039298541021015], jump: [101.7, 0.6076000118255616] },
  "1.13.2": { walk: [0.7204999625682831, 0.12039299354624511], jump: [101.7, 0.6076000118255616] },
  "1.20.4": { walk: [0.7204999984502791, 0.12039301313781722], jump: [101.7, 0.6076000118255616] },
  "1.21.11": { walk: [0.7204999984502791, 0.12039301313781722], jump: [101.69999998807907, 0.6076000001430509] },
};

describe("RiddenMobPhysics horse", () => {
  for (const [version, expected] of Object.entries(EXPECTED)) {
    it(`walks on its rider's input at its movement speed (${version}, v_horse_walk tick 2)`, () => {
      const { world, physics, state, ctx } = horse(version);
      physics.simulateRidden(ctx, world as any, { yawDegrees: 270, pitchDegrees: 0, xxa: 0, zza: 0.9800000190734863 });
      expect(state.pos.x).toBe(expected.walk[0]);
      expect(state.vel.x).toBe(expected.walk[1]);
    });

    it(`jumps the tick after the rider lets go of a full charge (${version}, v_horse_jump_full_charge tick 14)`, () => {
      const { world, physics, state, ctx } = horse(version);
      physics.riderJump(state, 90);
      physics.simulateRidden(ctx, world as any, { yawDegrees: 270, pitchDegrees: 0, xxa: 0, zza: 0 });
      expect(state.pos.y).toBe(expected.jump[0]);
      expect(state.vel.y).toBe(expected.jump[1]);
      expect(state.vel.x).toBe(0);
    });
  }
});
