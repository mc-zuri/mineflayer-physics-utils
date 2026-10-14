import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// 26.2 replaced the velocity reset and the blocks' fall-on bounce (SlimeBlock and BedBlock.bounceUp) with
// Entity.restituteMovementAfterCollisions: landing without sneaking from a fall at least a gravity step fast takes the
// block's restitution (slime 1, a bed 0.75F) after undoing the part of the tick's gravity and drag the move did not
// use; a slower fall stops without a bounce.

// b_bounce_bed_20_to_rest and b_bounce_slime_20_to_rest t25: falling 20 blocks onto the recorder's white beds (foot
// part, y 101) and slime blocks (y 100). Before 26.2 the bed keeps 0.66F of the speed and the slime all of it.
const bounces: Array<[string, string, number, number, number]> = [
  ["26.1", "bed", 1541.5, 101.5625, 0.8957723259785367],
  ["26.2", "bed", 1541.5, 101.5625, 1.04456030912012],
  ["26.3", "bed", 1541.5, 101.5625, 1.04456030912012],
  ["26.1", "slime", 1537.5, 101, 1.397618617859404],
  ["26.2", "slime", 1537.5, 101, 1.436400069879538],
  ["26.3", "slime", 1537.5, 101, 1.436400069879538],
];

describe("Botcraft collision restitution", () => {
  for (const [version, surface, z, landedY, expected] of bounces) {
    it(`bounces a fall off a ${surface} as vanilla (${version}, b_bounce_${surface}_20_to_rest t25)`, () => {
      const world = createFlatWorld(version, 99);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(4.5, 102.22705121760067, z), groundLevel: 0 });
      const block = surface === "bed" ? rig.mcData.blocksByName.white_bed : rig.mcData.blocksByName.slime_block;
      const y = surface === "bed" ? 101 : 100;
      for (let x = 3; x <= 5; x++) {
        for (let blockZ = Math.floor(z) - 1; blockZ <= Math.floor(z) + 1; blockZ++) world.setOverrideBlock(new Vec3(x, y, blockZ), block.id);
      }
      rig.playerState.vel.set(0, -1.506141419038689, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(landedY);
      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.vel.y).toBe(expected);
    });
  }

  // s_strafe_slime_block t1: standing on the recorder's slime strip (y 100) and strafing left. The fall of a tick on
  // the ground (-0.0784) is slower than gravity, so it does not bounce, and SlimeBlock.stepOn scales the strafe by
  // 0.4 + 0.0784 * 0.2.
  for (const version of ["26.2", "26.3"]) {
    it(`does not bounce a fall slower than gravity (${version}, s_strafe_slime_block t1)`, () => {
      const world = createFlatWorld(version, 100);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 1165.5), groundLevel: 0 });
      for (let x = -1; x <= 2; x++) {
        for (let z = 1164; z <= 1166; z++) world.setOverrideBlock(new Vec3(x, 100, z), rig.mcData.blocksByName.slime_block.id);
      }
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      rig.playerState.onGround = true;
      rig.playerState.lastOnGround = true;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.left = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.vel.y).toBe(-0.0784000015258789);
      expect(rig.playerState.vel.z).toBe(-0.012511242908739662);
    });
  }
});
