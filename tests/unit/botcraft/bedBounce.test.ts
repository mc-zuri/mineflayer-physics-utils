import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// A player falling onto a bed bounces up at 0.66F of its speed (BedBlock.bounceUp; onLanded before 1.14).
// The recorder's bed field: white beds (foot part) on y 101, landed on from 20 blocks up.
describe("Botcraft bed bounce", () => {
  for (const version of ["1.12.2", "1.13.2", "1.21.11"]) {
    it(`bounces up at 0.66F of the landing speed (${version}, b_bounce_bed_20_to_rest t25)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(4.5, 102.22705121760067, 1541.5), groundLevel: 0 });
      const bed = rig.mcData.blocksByName.white_bed ?? rig.mcData.blocksByName.bed;
      for (let x = 3; x <= 5; x++) {
        for (let z = 1540; z <= 1542; z++) world.setOverrideBlock(new Vec3(x, 101, z), bed.id);
      }
      rig.playerState.vel.set(0, -1.506141419038689, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(101.5625);
      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.vel.y).toBe(0.8957723259785367);
    });
  }

  // Before 1.12 a bed has no onLanded and stops the fall like any block. m_bed: falling onto the foot of a bed
  // (part=foot, facing=east) at (3, 101, 2848).
  for (const version of ["1.8.8", "1.11.2"]) {
    it(`does not bounce before 1.12 (${version}, m_bed t9)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(3.9000000953674316, 101.60909999847412, 2848.5), groundLevel: 0 });
      world.setOverrideBlock(new Vec3(3, 101, 2848), rig.mcData.blocksByName.bed.id, 3);
      rig.playerState.vel.set(0, -0.1552320045166016, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(101.5625);
      expect(rig.playerState.vel.y).toBe(-0.0784000015258789);
    });
  }
});
