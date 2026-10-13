import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Entity.checkSupportingBlock (1.20+): the block under the box's underside whose centre is closest to the position,
// a tie going to the greater position. s_straddle_center: sprinting east along the seam of stone (z 2746) and ice
// (z 2747) at z 2747, both 0.5 from the position: the ice is the supporting block, so its friction carries the walk.
describe("Botcraft supporting block", () => {
  for (const [version, firstSpeed, secondSpeed] of [
    ["1.20.4", 0.026074288584128563, 0.0493273403420139],
    ["1.21.11", 0.026074288584128563, 0.0493273403420139],
  ] as const) {
    it(`breaks a tie toward the greater block (${version}, s_straddle_center t1 - t2)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 2747), groundLevel: 101 });
      for (let x = -1; x <= 2; x++) world.setOverrideBlock(new Vec3(x, 100, 2747), rig.mcData.blocksByName.ice.id);
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;

      rig.physics.simulate(rig.playerCtx, world as any);
      expect(rig.playerState.vel.x).toBe(firstSpeed);
      rig.physics.simulate(rig.playerCtx, world as any);
      expect(rig.playerState.vel.x).toBe(secondSpeed);
    });
  }
});
