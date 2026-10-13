import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// PowderSnowBlock.getCollisionShape (1.17+): 0.9F tall under an entity whose fall distance is over 2.5, else nothing
// (for a player without leather boots). Entity.checkFallDamage adds each move down to the fall distance (a float
// before 1.21.5) and ends it on landing. b_land_3_powder_snow: falling from y 104 onto powder snow (y 99..100), the
// player lands on the 0.9 shape (t10), then, its fall over, sinks into the snow (t11).
describe("Botcraft powder snow landing", () => {
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`lands on powder snow after a fall, then sinks (${version}, b_land_3_powder_snow t1 - t11)`, () => {
      const world = createFlatWorld(version, 99);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(4.5, 104, 1557.5), groundLevel: 0 });
      for (let x = 3; x <= 5; x++) {
        for (let z = 1556; z <= 1558; z++) {
          for (let y = 99; y <= 100; y++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.powder_snow.id);
        }
      }
      rig.playerState.vel.set(0, 0, 0);

      for (let tick = 1; tick <= 9; tick++) rig.physics.simulate(rig.playerCtx, world as any);
      expect(rig.playerState.pos.y).toBe(101.30543845175121);
      expect(rig.playerState.fallDistance).toBe(2.69456148147583);

      rig.physics.simulate(rig.playerCtx, world as any);
      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.pos.y).toBe(100.89999997615814);
      expect(rig.playerState.fallDistance).toBe(0);

      rig.physics.simulate(rig.playerCtx, world as any);
      expect(rig.playerState.onGround).toBe(false);
      expect(rig.playerState.pos.y).toBe(100.78239997386932);
    });
  }
});
