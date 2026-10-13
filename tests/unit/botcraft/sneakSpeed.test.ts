import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// pb_sneak_forward: a vanilla client walks forward sneaking on stone from rest, facing south. From 1.15 the slowdown
// starts on the second tick (crouching follows the sneak key of the tick before); the impulse is a float,
// (float)(1 * 0.3F) * 0.98F = 0.2940000295639038, not 0.3 * 0.98F in double.
describe("Botcraft sneak speed", () => {
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`slows a sneaking walk by the float sneak factor as vanilla (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      const world = createFlatWorld(version, groundLevel) as any;
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.forward = true;
      rig.playerState.control.sneak = true;

      rig.physics.simulate(rig.playerCtx, world);
      rig.physics.simulate(rig.playerCtx, world);

      expect(rig.playerState.heading.forward).toBe(0.2940000295639038);
      expect(rig.playerState.pos.z).toBe(38.680908014815984);
      expect(rig.playerState.vel.z).toBe(0.045267779508756434);
    });
  }

  // Before 1.14 the slowdown follows the sneak key of the tick itself (MovementInputFromOptions), so the first tick
  // of the same walk is slowed already.
  for (const version of ["1.12.2", "1.13.2"]) {
    it(`slows the first tick a sneak key is held as vanilla (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.forward = true;
      rig.playerState.control.sneak = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.heading.forward).toBe(0.2940000295639038);
      expect(rig.playerState.pos.z).toBe(38.52939999848604);
      expect(rig.playerState.vel.z).toBe(0.016052401037907504);
    });
  }
});
