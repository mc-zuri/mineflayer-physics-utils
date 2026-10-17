import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import md from "minecraft-data";
import block from "prismarine-block";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// From 1.13 a block's shape of several boxes is one VoxelShape, and a move that starts inside it collides over its
// grid (VoxelShape.collideX): the layers the box is in are passed, the first layer with a full cell under it stops it
// at that layer's face. n_piston_push_jumping on 1.19.3, tick 6: the server put the player inside the plate of a piston
// head facing east (x 0.75 - 1, the arm at y 0.375 - 0.625 splitting the grid there); falling, it stands on the grid
// line 0.375 of the plate, where the boxes alone would let it fall through.
describe("Botcraft VoxelShape grid", () => {
  for (const version of ["1.19.3", "1.20.4"]) {
    it(`stands inside a piston head's plate on its grid line (${version}, n_piston_push_jumping)`, () => {
      const Block = block(version);
      const head = Block.fromProperties("piston_head", { facing: "east", short: "false", type: "normal" }, 0);
      const data = md(version).blocksByName.piston_head;
      const world = createFlatWorld(version, 101);
      world.setOverrideBlock(new Vec3(0, 101, 2707), data.id, head.stateId! - data.minStateId!);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.810000011920929, 101.41999998688698, 2707.5), groundLevel: 101 });
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      rig.playerState.onGround = false;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(101.375);
      expect(rig.playerState.onGround).toBe(true);
    });
  }
});
