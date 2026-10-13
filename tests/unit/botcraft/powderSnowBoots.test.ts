import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// PowderSnowBlock.getCollisionShape (1.17+): a full block to a player in leather boots (canEntityWalkOnPowderSnow)
// whose feet are above it and that is not sneaking. b_powder_snow_boots_walk_on t6: walking south in leather boots
// off a ledge onto powder snow (y 104..105), the player lands on top of it.
describe("Botcraft powder snow with leather boots", () => {
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`lets a player in leather boots land on powder snow (${version}, b_powder_snow_boots_walk_on t6)`, () => {
      const world = createFlatWorld(version, 104);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 106.23152379758702, 915.9639718865733), groundLevel: 0 });
      for (let x = -1; x <= 1; x++) {
        for (let z = 914; z <= 918; z++) {
          for (let y = 104; y <= 105; y++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.powder_snow.id);
        }
      }
      rig.playerState.canWalkOnPowderSnow = true;
      rig.playerState.vel.set(0, -0.37663049823865513, 0.09897054793683834);
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.pos.y).toBe(106);
      expect(rig.playerState.pos.z).toBe(916.0825424344536);
    });
  }
});
