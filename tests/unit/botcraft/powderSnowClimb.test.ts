import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// LivingEntity.travel (1.17+): a player in leather boots that collides horizontally or jumps climbs powder snow
// (vy = 0.2) like a ladder: when the block at its feet after the move is powder snow, from 1.21.5 when the tick before
// was in powder snow (Entity.wasInPowderSnow). b_powder_snow_boots_climb_out: holding jump at the bottom of a column of
// powder snow (y 97..105), 1.20.4 climbs from the first tick, 1.21.11 jumps first and climbs from the second.
describe("Botcraft powder snow climbing", () => {
  for (const [version, firstSpeed] of [
    ["1.20.4", 0.11760000228881837],
    ["1.21.11", 0.33319999363422365],
  ] as const) {
    it(`climbs powder snow in leather boots (${version}, b_powder_snow_boots_climb_out t1 - t2)`, () => {
      const world = createFlatWorld(version, 97);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 98, 920.5), groundLevel: 98 });
      for (let x = -1; x <= 1; x++) {
        for (let z = 919; z <= 921; z++) {
          for (let y = 97; y <= 105; y++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.powder_snow.id);
        }
      }
      rig.playerState.canWalkOnPowderSnow = true;
      rig.playerState.vel.set(0, 0, 0);
      rig.playerState.control.jump = true;

      rig.physics.simulate(rig.playerCtx, world as any);
      expect(rig.playerState.pos.y).toBe(98.41999998688698);
      expect(rig.playerState.vel.y).toBe(firstSpeed);

      rig.physics.simulate(rig.playerCtx, world as any);
      expect(rig.playerState.vel.y).toBe(0.11760000228881837);
    });
  }
});
