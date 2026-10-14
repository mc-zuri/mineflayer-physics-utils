import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Entity.updateFluidHeightAndDoFluidPushing adds a fluid's current only when there is one: out of any fluid the motion
// is left as the move made it, so a -0 stays -0. e_attr_scale_2_step t11: walking east into the stone at x 3 at scale
// 2 stops the player; from 26.2 the wall restitutes the speed to -vx * 0 = -0 (Entity.restituteMovementAfterCollisions),
// before it the collision reset writes 0.
const cases: Array<[string, number]> = [
  ["26.1", 0],
  ["26.2", -0],
  ["26.3", -0],
];

describe("Botcraft fluid current out of fluids", () => {
  for (const [version, expected] of cases) {
    it(`leaves the motion untouched without a current (${version}, e_attr_scale_2_step t11)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(2.399600454447249, 101, 1381.5), groundLevel: 101 });
      for (let z = 1380; z <= 1383; z++) world.setOverrideBlock(new Vec3(3, 101, z), rig.mcData.blocksByName.stone.id);
      rig.playerState.attributes = { [rig.physics.scaleAttribute]: { value: 2, modifiers: [] } } as any;
      rig.playerState.vel.set(0.11758154782898447, -0.0784000015258789, 0);
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.x).toBe(2.399999976158142);
      expect(rig.playerState.vel.x).toBe(expected);
    });
  }
});
