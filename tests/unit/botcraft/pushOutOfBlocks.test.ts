import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// The recorder's "g_pushout_*": a stone column at x 0, z 2787 (y 101 - 103) on a stone floor, the player standing with
// a corner of its box inside it. The first tick pushes it 0.1 toward the nearest open side.
function standIn(version: string, x: number, z: number) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(x, 101, z) });
  for (let y = 101; y <= 103; y++) world.setOverrideBlock(new Vec3(0, y, 2787), rig.mcData.blocksByName.stone.id);
  rig.playerState.vel.set(0, 0, 0);
  rig.playerState.onGround = true;

  rig.physics.simulate(rig.playerCtx, world as any);

  return rig.playerState;
}

describe("Botcraft push out of blocks", () => {
  // Before 1.16 (EntityPlayerSP.pushOutOfBlocks) the push is 0.1F, before 1.14 the velocity set to it.
  for (const version of ["1.12.2", "1.13.2"]) {
    it(`pushes west out of the column (${version}, g_pushout_x)`, () => {
      const player = standIn(version, -0.2, 2787.5);
      expect(player.pos.x).toBe(-0.3000000014901161);
      expect(player.vel.x).toBe(-0.0546000071555377);
    });

    it(`pushes east out of the column's corner (${version}, g_pushout_corner)`, () => {
      const player = standIn(version, 1.2, 2788.2);
      expect(player.pos.x).toBe(1.300000001490116);
      expect(player.vel.x).toBe(0.0546000071555377);
    });
  }

  // Since 1.16 LocalPlayer.moveTowardsClosestSpace sets the motion to 0.1.
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`pushes west out of the column (${version}, g_pushout_x)`, () => {
      const player = standIn(version, -0.2, 2787.5);
      expect(player.pos.x).toBe(-0.30000000000000004);
      expect(player.vel.x).toBe(-0.05460000634193421);
    });

    it(`pushes east out of the column's corner (${version}, g_pushout_corner)`, () => {
      const player = standIn(version, 1.2, 2788.2);
      expect(player.pos.x).toBe(1.3);
      expect(player.vel.x).toBe(0.05460000634193421);
    });
  }
});
