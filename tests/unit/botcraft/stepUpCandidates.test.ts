import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { loadMcData, createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Entity.collide's step up. Before 1.21 the player rises the whole step height, moves across and settles down; from
// 1.21 it tries the faces of the colliders within the step height, lowest first, and keeps the first that goes
// further. g_step_sprint_lantern t11: sprinting east into standing lanterns (x 3..5, y 101; a 7/16 base under a
// narrower 9/16 top). 1.20.6 steps onto the top; 1.21 stops on the base's face, against the top.
describe("Botcraft step up", () => {
  for (const [version, x, y, speedX] of [
    ["1.20.6", 3.2497367806897364, 101.5625, 0.15301981245991675],
    ["1.21.1", 3.074999988079071, 101.4375, 0],
    ["1.21.11", 3.074999988079071, 101.4375, 0],
  ] as const) {
    it(`steps to the height vanilla picks (${version}, g_step_sprint_lantern t11)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(2.969480746465811, 101, 1421.5), groundLevel: 101 });
      const lantern = loadMcData(version).Block.fromProperties("lantern", { hanging: "false", waterlogged: "false" }, 0);
      for (let blockX = 3; blockX <= 5; blockX++) {
        for (let z = 1420; z <= 1422; z++) world.setOverrideBlock(new Vec3(blockX, 101, z), lantern.type, lantern.metadata);
      }
      rig.playerState.vel.set(0.1528560218142385, -0.0784000015258789, 0);
      rig.playerState.sprinting = true;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.x).toBe(x);
      expect(rig.playerState.pos.y).toBe(y);
      expect(rig.playerState.vel.x).toBe(speedX);
    });
  }
});
