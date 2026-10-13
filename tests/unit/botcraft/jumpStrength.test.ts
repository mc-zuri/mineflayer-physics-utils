import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// e_attr_jump_strength_2: a vanilla client whose jump strength attribute is 2 jumps from rest on stone. Since 1.20.5
// LivingEntity.getJumpPower takes getAttributeValue(JUMP_STRENGTH): the base with its modifiers. Here the value 2 is
// a base of 1 doubled by an add-multiplied-base modifier.
describe("Botcraft jump strength attribute", () => {
  for (const version of ["1.21.1", "1.21.11"]) {
    it(`jumps by the jump strength with its modifiers (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      const jumpStrength: string = (rig.mcData.attributesByName as any).jumpStrength.resource;
      rig.playerState.attributes = {
        [jumpStrength]: { value: 1, modifiers: [{ uuid: "test:double", amount: 1, operation: 1 }] },
      } as any;
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.jump = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.pos.y).toBe(103);
      expect(rig.playerState.vel.y).toBe(1.8816000366210937);
    });
  }
});
