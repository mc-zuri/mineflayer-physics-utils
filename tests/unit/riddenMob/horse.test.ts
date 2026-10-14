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

// v_horse_running_jump: the rider lets go of its jump at tick 26, the horse jumps at tick 27, the server has it rear
// from tick 28 (its flags) until after it lands at tick 44. A horse that rears does not move on the ground unless the
// rider's jump let it, and once it does not rear that ends (AbstractHorse.tick): on 1.21.3 the client does not rear the
// horse itself (isEffectiveAi), so the tick it jumps ends it and the horse stops at tick 45; on 1.21.11 the rider's
// jump rears it on the client (standIfPossible) and it keeps moving.
describe("RiddenMobPhysics horse rearing", () => {
  const LANDING = {
    "1.21.3": { y: 101, at44: [18.416219133901592, 0.22711509435756969], at45: [18.63879192637201, 0.12152475880426844] },
    "1.21.11": { y: 102, at44: [19.421812636230825, 0.27539855341395597], at45: [19.917711188095062, 0.2707606407674322] },
  };

  for (const [version, { y, at44, at45 }] of Object.entries(LANDING)) {
    it(`lands rearing and ${version === "1.21.3" ? "stops" : "keeps moving"} (${version}, v_horse_running_jump tick 45)`, () => {
      const world = createFlatWorld(version, y);
      const rig = createRiddenMobRig({ version, type: "horse", pos: [at44[0], y, 2173.5], vel: [0, -0.0784000015258789, 0], yawDegrees: 270 });
      const { physics, state, ctx } = rig;
      state.movementSpeed = 0.225;
      state.jumpStrength = 0.7;
      const rider = { yawDegrees: 270, pitchDegrees: 0, xxa: 0, zza: 0.9800000190734863 };
      // the release and the jump
      physics.riderJump(state, 90);
      physics.simulateRidden(ctx, world as any, rider);
      // the landing, as recorded, with the server's rearing
      state.pos.set(at44[0], y, 2173.5);
      state.vel.set(at44[1], -0.0784000015258789, 0);
      state.onGround = true;
      state.standing = true;
      physics.simulateRidden(ctx, world as any, rider);
      expect(state.pos.x).toBe(at45[0]);
      expect(state.vel.x).toBe(at45[1]);
    });
  }
});
