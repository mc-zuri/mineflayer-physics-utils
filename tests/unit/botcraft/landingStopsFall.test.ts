import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// Block.updateEntityAfterFallOn stops a landing's vertical motion: from 1.14 by multiplying it by 0, so a fall keeps
// its sign as -0 (0 before 1.14); from 26.2 Entity.restituteMovementAfterCollisions makes it (0 - vy) * 0 = 0.
// e_attr_gravity_0_jump: standing on stone when the gravity attribute turns 0, the tick's -0.0784 lands and, with no
// gravity to add, the motion stays as the landing left it (t2 on 1.20.6, t3 since).
const cases: Array<[string, number]> = [
  ["1.20.6", -0],
  ["1.21.11", -0],
  ["26.1", -0],
  ["26.2", 0],
];

describe("Botcraft landing stops the fall", () => {
  for (const [version, expected] of cases) {
    it(`stops the vertical motion as vanilla (${version}, e_attr_gravity_0_jump)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      const gravity: string = (rig.mcData.attributesByName as any).gravity.resource;
      rig.playerState.attributes = { [gravity]: { value: 0, modifiers: [] } } as any;
      rig.playerState.yawDegrees = 0;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.pos.y).toBe(groundLevel);
      expect(rig.playerState.vel.y).toBe(expected);
    });
  }
});
