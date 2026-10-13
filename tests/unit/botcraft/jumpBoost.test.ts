import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// e_jump_boost_2: a vanilla client with Jump Boost II jumps from rest on stone. LivingEntity.jumpFromGround adds the
// boost (0.1F per level, in float) to the jump power 0.42F: in double before 1.14 and 1.17.1 - 1.19.4, in float
// 1.14 - 1.17 and since 1.20.
describe("Botcraft jump boost", () => {
  for (const { version, y, velY } of [
    { version: "1.13.2", y: 101.61999998986721, velY: 0.5292000003695486 },
    { version: "1.20.4", y: 101.62000000476837, velY: 0.5292000149726869 },
  ]) {
    it(`adds the jump boost to the jump power as vanilla does (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      const jumpBoost = rig.mcData.effectsByName.JumpBoost.id;
      rig.playerState.effects = { [jumpBoost]: { id: jumpBoost, amplifier: 1, duration: 200 } } as any;
      rig.playerState.jumpBoost = 2;
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.jump = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.pos.y).toBe(y);
      expect(rig.playerState.vel.y).toBe(velY);
    });
  }
});
