import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Entity.getOnPosLegacy: the block landed on, 0.2F under the feet; from 1.20 in the supporting block's column.
// g_step_walk_white_bed_part_foot_facing_east t12: walking east up onto the beds at x 3..5 (y 101), the feet at
// x 2.83 are over the air at x 2. Before 1.20 that air is landed on (no bounce); from 1.20 the bed supporting the
// player is, and stepping up onto it bounces the -0.0784 left by gravity.
describe("Botcraft landing block", () => {
  for (const [version, x, speedX, speedY] of [
    ["1.13.2", 2.615181716829988, 0.11770752455323462, -0.0784000015258789],
    ["1.20.4", 2.615182005643896, 0.11770754062540936, -0.027690877537002466],
    ["1.21.11", 2.615182005643896, 0.11770754062540936, -0.027690877537002466],
  ] as const) {
    it(`lands on the block under the feet as vanilla (${version}, g_step_walk_white_bed_part_foot_facing_east t12)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(x, 101, 1333.5), groundLevel: 101 });
      const bed = rig.mcData.blocksByName.white_bed ?? rig.mcData.blocksByName.bed;
      for (let bedX = 3; bedX <= 5; bedX++) {
        for (let z = 1332; z <= 1334; z++) world.setOverrideBlock(new Vec3(bedX, 101, z), bed.id);
      }
      rig.playerState.vel.set(speedX, -0.0784000015258789, 0);
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(101.5625);
      expect(rig.playerState.vel.y).toBe(speedY);
    });
  }
});
