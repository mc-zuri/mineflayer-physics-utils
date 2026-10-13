import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// pb_walk_backward: a vanilla client standing on stone at (0.5, 101, 38.5), looking south (yaw 0), walks backwards.
// After its first tick it stands at z = 38.40199999663234 on every version from 1.14.4 to 1.21.11: the ground speed
// is getSpeed() * (0.21600002F / (f * f * f)) in float, 0.1F on stone.
describe("Botcraft ground speed", () => {
  for (const version of ["1.14.4", "1.20.4", "1.21.11"]) {
    it(`moves the first tick of a walk on stone as vanilla (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      rig.playerState.yaw = Math.PI; // vanilla yaw 0
      rig.playerState.control.back = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.pos.z).toBe(38.40199999663234);
    });
  }
});
