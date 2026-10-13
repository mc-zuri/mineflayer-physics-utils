import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// SlimeBlock.stepOn: on ground and not sneaking, a vertical speed under 0.1 scales the horizontal motion by
// 0.4 + |vy| * 0.2. Entity.move steps on the block after the landing (vy is the bounce's 0 then); from 1.21.2
// LivingEntity.aiStep does it after the whole travel (vy is gravity's -0.0784 then).
// s_walk_slime_block t2: walking east on the recorder's slime strip (y 100), landing back from the tick in the air.
const cases: Array<[string, number, number, number]> = [
  ["1.12.2", 0.5413437522947788, 0.030098253523737295, 0.018799299366045796],
  ["1.20.4", 0.5413437551856042, 0.030098255628258283, 0.01879930005276954],
  ["1.21.1", 0.5413437551856042, 0.030098255628258283, 0.01879930005276954],
  ["1.21.3", 0.5413437551856042, 0.030098255628258283, 0.018104348225971297],
  ["1.21.11", 0.5413437551856042, 0.030098255628258283, 0.018104348225971297],
];

describe("Botcraft slime block step", () => {
  for (const [version, x, speedX, expected] of cases) {
    it(`slows a walk on slime as vanilla (${version}, s_walk_slime_block t2)`, () => {
      const world = createFlatWorld(version, 100);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(x, 101, 1165.5), groundLevel: 0 });
      const slime = rig.mcData.blocksByName.slime_block ?? rig.mcData.blocksByName.slime;
      for (let blockX = -1; blockX <= 2; blockX++) {
        for (let z = 1164; z <= 1166; z++) world.setOverrideBlock(new Vec3(blockX, 100, z), slime.id);
      }
      rig.playerState.vel.set(speedX, -0.0784000015258789, 0);
      rig.playerState.lastOnGround = false;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.vel.x).toBe(expected);
    });
  }
});
