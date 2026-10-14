import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig } from "../../helpers/unit/botcraftTestSupport";

// Entity.moveRelative without input: from 1.14 getInputVector gives Vec3.ZERO and moveRelative still adds it, which
// turns a -0 motion into 0; before 1.14 moveRelative returns before adding. b_water_swim_fl t31 (26.2): swimming
// north-east into the wall at x 6 leaves vel.x -0 (Entity.restituteMovementAfterCollisions); releasing the keys, the
// next tick vanilla has vel.x 0.
const cases: Array<[string, number]> = [
  ["1.13.2", -0],
  ["1.14.4", 0],
  ["26.2", 0],
];

describe("Botcraft moveRelative without input", () => {
  for (const [version, expected] of cases) {
    it(`adds the zero input vector as vanilla (${version}, b_water_swim_fl t31)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(5.699999988079071, 98.37484522760518, 1831.6611723654569), groundLevel: 0 });
      rig.playerState.vel.set(-0, -0.024969052973454343, -0.05649851121712762);

      rig.physics.applyInputs(0.02, rig.playerState);

      expect(rig.playerState.vel.x).toBe(expected);
      expect(rig.playerState.vel.y).toBe(-0.024969052973454343);
      expect(rig.playerState.vel.z).toBe(-0.05649851121712762);
    });
  }
});
