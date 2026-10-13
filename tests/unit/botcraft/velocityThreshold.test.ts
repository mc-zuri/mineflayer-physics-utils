import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// j_jump_standing, tick 6: a vanilla client at the top of a jump, rising at 0.0030162615090425808. The living entity's
// tick stops an axis slower than 0.005 before 1.9 (EntityLivingBase.onLivingUpdate), slower than 0.003 since
// (LivingEntity.aiStep), so the 1.8 client does not rise this tick.
describe("Botcraft velocity threshold", () => {
  for (const { version, y, velY } of [
    { version: "1.8.8", y: 102.24918707874468, velY: -0.0784000015258789 },
    { version: "1.9.4", y: 102.25220334025373, velY: -0.07544406518948656 },
  ]) {
    it(`stops a slow axis by each version's threshold (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 102.24918707874468, 38.5), groundLevel });
      rig.playerState.vel.set(0, 0.0030162615090425808, 0);
      rig.playerState.yawDegrees = 0;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.pos.y).toBe(y);
      expect(rig.playerState.vel.y).toBe(velY);
    });
  }
});
