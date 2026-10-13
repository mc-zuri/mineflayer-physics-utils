import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { PlayerPoses } from "../../../src/physics/states";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

function diagonalSneak(version: string) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
  const world = createFlatWorld(version, groundLevel) as any;
  rig.playerState.yawDegrees = 0;
  Object.assign(rig.playerState.control, { forward: true, left: true, sneak: true });
  return { ...rig, world };
}

// j_sneak_fl: a vanilla client walks forward-left sneaking on stone from rest, facing south. The first tick is a plain
// diagonal walk (crouching follows the sneak key of the tick before), the second a crouched one.
describe("Botcraft square input", () => {
  // 1.21.5+ KeyboardInput normalizes the move vector and LocalPlayer.modifyInput scales it by 0.98F and the sneak
  // factor, then stretches it to the unit square (modifyInputSpeedForSquareMovement), all in float.
  for (const version of ["1.21.5", "1.21.11"]) {
    it(`moves diagonally by the normalized, square-stretched input (${version})`, () => {
      const rig = diagonalSneak(version);

      rig.physics.simulate(rig.playerCtx, rig.world);
      expect(rig.playerState.pos.x).toBe(0.5707106720016997);
      expect(rig.playerState.vel.x).toBe(0.03860803139735231);

      rig.physics.simulate(rig.playerCtx, rig.world);
      expect(rig.playerState.pos.x).toBe(0.6387187067935365);
      expect(rig.playerState.vel.x).toBe(0.03713239130936775);
    });
  }

  // Before, the keys' impulses are 1 and Entity.getInputVector normalizes the scaled vector in double.
  for (const version of ["1.21.1", "1.21.3"]) {
    it(`moves diagonally by the unit key impulses (${version})`, () => {
      const rig = diagonalSneak(version);

      rig.physics.simulate(rig.playerCtx, rig.world);
      expect(rig.playerState.pos.x).toBe(0.570710679172326);
      expect(rig.playerState.vel.x).toBe(0.03860803531251473);

      rig.physics.simulate(rig.playerCtx, rig.world);
      expect(rig.playerState.pos.x).toBe(0.6387187178793252);
      expect(rig.playerState.vel.x).toBe(0.03713239344704668);
    });
  }

  // g_crawl_tunnel_sprint: crawling east in a one-block tunnel, a vanilla 1.21.5 client holding forward and sprint does
  // not start sprinting: canStartSprinting checks isMovingSlowly now that the impulse it reads is not slowed yet.
  for (const version of ["1.21.5", "1.21.11"]) {
    it(`does not start sprinting while crawling (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(2.5, groundLevel, 2028.5), groundLevel });
      const world = createFlatWorld(version, groundLevel) as any;
      for (let x = 0; x <= 5; x++) world.setOverrideBlock(new Vec3(x, groundLevel + 1, 2028), rig.mcData.blocksByName.stone.id);
      rig.playerState.yawDegrees = 270;
      rig.playerState.pose = PlayerPoses.SWIMMING;
      Object.assign(rig.playerState.control, { forward: true, sprint: true });

      rig.physics.simulate(rig.playerCtx, world);

      expect(rig.playerState.sprinting).toBe(false);
      expect(rig.playerState.pos.x).toBe(2.5294000033944846);
      expect(rig.playerState.vel.x).toBe(0.016052403717917444);
    });
  }
});
