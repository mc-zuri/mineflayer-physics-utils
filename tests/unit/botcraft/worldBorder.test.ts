import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Entity.collectColliders (1.18+): a player inside and close to the world border collides with it (the default
// border, centre 0, 0 and size 5.9999968E7, ends at x 29999984). x_world_border_walk t35: walking east along the
// floor the player stops 0.3 short of the border.
describe("Botcraft world border", () => {
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`stops a player at the world border (${version}, x_world_border_walk t35)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(29999983.57960683, 101, 0.5), groundLevel: 101 });
      rig.playerState.vel.set(0.11785906490374695, -0.0784000015258789, 0);
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.x).toBe(29999983.699999988);
      expect(rig.playerState.vel.x).toBe(0);
      expect(rig.playerState.isCollidedHorizontally).toBe(true);
    });
  }
});
