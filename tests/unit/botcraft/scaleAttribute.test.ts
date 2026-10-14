import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// LivingEntity.getDimensions (1.20.5+): the pose's size scaled by the scale attribute. e_attr_scale_2_step t11: at
// scale 2 the player is 1.2 wide, so walking east into the stone at x 3 (y 101) stops it 0.6 short of the block.
describe("Botcraft scale attribute", () => {
  for (const version of ["1.20.6", "1.21.11"]) {
    it(`sizes the box by the scale attribute (${version}, e_attr_scale_2_step t11)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(2.399600454447249, 101, 1381.5), groundLevel: 101 });
      for (let z = 1380; z <= 1383; z++) world.setOverrideBlock(new Vec3(3, 101, z), rig.mcData.blocksByName.stone.id);
      rig.playerState.attributes = { [rig.physics.scaleAttribute]: { value: 2, modifiers: [] } } as any;
      rig.playerState.vel.set(0.11758154782898447, -0.0784000015258789, 0);
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.isCollidedHorizontally).toBe(true);
      expect(rig.playerState.pos.x).toBe(2.399999976158142);
      expect(rig.playerState.vel.x).toBe(0);
    });
  }
});
