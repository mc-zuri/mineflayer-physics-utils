import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// x_world_border_walk: walking east (yaw 270) on flat ground from (29999976.5, 101, 0.5) into the default world border
// at x 29999984. Before 1.14 World.getCollisionBoxes (1.13: IWorldReaderBase) counts every block outside the border
// as stone, so the walk stops with the box against x 29999984 on tick 35.
function walkIntoBorder(version: string, ticks: number) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(29999976.5, 101, 0.5) });
  rig.playerState.yawDegrees = 270;
  rig.playerState.control.forward = true;
  for (let i = 0; i < ticks; i++) rig.physics.simulate(rig.playerCtx, world as any);
  return rig.playerState;
}

describe("Botcraft world border before 1.14", () => {
  for (const version of ["1.12.2", "1.13.2"]) {
    it(`stops a walk at the world border (${version}, x_world_border_walk tick 35)`, () => {
      const player = walkIntoBorder(version, 35);
      expect(player.pos.x).toBe(29999983.699999988);
      expect(player.vel.x).toBe(0);
      expect(player.isCollidedHorizontally).toBe(true);
    });
  }
});
