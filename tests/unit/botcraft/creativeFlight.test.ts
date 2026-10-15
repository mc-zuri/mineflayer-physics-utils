import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 64;

// f_fly_forward tick 1: flying from rest facing east (yaw 270) with the forward key. Vanilla's air speed while flying
// is the abilities' flying speed (Player.getFlyingSpeed, the jump movement factor before 1.13), 0.05F here.
const recorded: { version: string; posX: number; velX: number }[] = [
  { version: "1.12.2", posX: 0.5490000024437904, velX: 0.0445900035089255 },
  { version: "1.21.11", posX: 0.5490000016838312, velX: 0.044590002817362605 },
];

// f_fly_up / f_fly_down_to_ground tick 1: jump or sneak while flying adds the float flyingSpeed * 3.0F
// (0.15000000596046448), kept at 0.6 of it after the move.
const vertical: { version: string; key: "jump" | "sneak"; posY: number; velY: number; recording: string }[] = [
  { version: "1.12.2", key: "jump", posY: 105.15000000596046, velY: 0.09000000357627869, recording: "f_fly_up" },
  { version: "1.21.11", key: "jump", posY: 105.15000000596046, velY: 0.09000000357627869, recording: "f_fly_up" },
  { version: "1.12.2", key: "sneak", posY: 104.84999999403954, velY: -0.09000000357627869, recording: "f_fly_down_to_ground" },
  { version: "1.21.11", key: "sneak", posY: 104.84999999403954, velY: -0.09000000357627869, recording: "f_fly_down_to_ground" },
];

function flyingRig(version: string) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 105, 2619.5), groundLevel });
  const state = rig.playerState;
  state.vel = new Vec3(0, 0, 0);
  state.onGround = false;
  state.gameMode = "creative";
  state.mayFly = true;
  state.flying = true;
  state.flySpeed = 0.05000000074505806;
  state.yawDegrees = 270;
  return rig;
}

describe("Botcraft creative flight", () => {
  for (const { version, key, posY, velY, recording } of vertical) {
    it(`flies ${key === "jump" ? "up" : "down"} by the float flying speed (${version}, ${recording})`, () => {
      const rig = flyingRig(version);
      rig.playerState.control[key] = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.vel.y).toBe(velY);
      expect(rig.playerState.pos.y).toBe(posY);
    });
  }

  // f_fly_toggle_on: jump from the ground (tick 1), press jump again within 7 ticks (tick 5) and flying starts, the
  // tick's motion then 0.6 of the falling jump's plus the float flying impulse
  for (const version of ["1.12.2", "1.21.11"]) {
    it(`toggles flying on a second press of jump (${version}, f_fly_toggle_on)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 2619.5), groundLevel: 101 });
      const state = rig.playerState;
      const world = createFlatWorld(version, 101) as any;
      state.gameMode = "creative";
      state.mayFly = true;
      state.flySpeed = 0.05000000074505806;
      state.yawDegrees = 270;

      for (let tick = 1; tick <= 5; tick++) {
        state.control.jump = tick === 1 || tick === 5;
        rig.physics.simulate(rig.playerCtx, world);
        expect(state.flying).toBe(tick === 5);
      }

      expect(state.vel.y).toBe(0.13984669426015903);
      expect(state.pos.y).toBe(102.39918708470515);
    });
  }

  // LocalPlayer.aiStep since 1.20.5: the second press of jump that starts flying on the ground also jumps from it
  // (jumpFromGround, 0.42 up), then the flying impulse; before, only the flying impulse lifts the player
  for (const [version, velY, posY] of [["1.20.4", 0.04296000266075134, 101.07160000443459], ["1.20.5", 0.34199999570846557, 101.56999999284744], ["1.21.11", 0.34199999570846557, 101.56999999284744]] as const) {
    it(`starting to fly on the ground jumps from it since 1.20.5 (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 2619.5), groundLevel: 101 });
      const state = rig.playerState;
      state.gameMode = "creative";
      state.mayFly = true;
      state.flySpeed = 0.05000000074505806;
      state.onGround = true;
      state.vel.set(0, -0.0784000015258789, 0);
      state.flyJumpTriggerTime = 3; // the first press, a few ticks before
      state.control.jump = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, 101) as never);

      expect(state.flying).toBe(true);
      expect(state.vel.y).toBe(velY);
      expect(state.pos.y).toBe(posY);
    });
  }

  for (const { version, posX, velX } of recorded) {
    it(`flies forward at the flying speed (${version}, f_fly_forward)`, () => {
      const rig = flyingRig(version);
      const state = rig.playerState;
      state.control.forward = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(state.vel.x).toBe(velX);
      expect(state.pos.x).toBe(posX);
      expect(state.pos.y).toBe(105);
      expect(state.vel.y).toBe(0);
    });
  }
});
