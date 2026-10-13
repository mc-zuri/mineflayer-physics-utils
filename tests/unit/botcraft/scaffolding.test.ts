import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld, loadMcData } from "../../helpers/unit/botcraftTestSupport";

// A scaffolding tower over x minX..maxX, y 101..topY, z minZ..maxZ on flat ground (y 100).
function scaffoldingRig(version: string, position: Vec3, tower: { x: [number, number]; z: [number, number]; topY: number }) {
  const { Block } = loadMcData(version);
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position, groundLevel: position.y });
  const scaffolding = Block.fromProperties("scaffolding", { distance: "7", bottom: "false", waterlogged: "false" }, 0);
  for (let x = tower.x[0]; x <= tower.x[1]; x++) {
    for (let z = tower.z[0]; z <= tower.z[1]; z++) {
      for (let y = 101; y <= tower.topY; y++) world.setOverrideBlock(new Vec3(x, y, z), scaffolding.type, scaffolding.metadata);
    }
  }
  return { world, rig, state: rig.playerState, tick: () => rig.physics.simulate(rig.playerCtx, world as any) };
}

describe("Botcraft scaffolding", () => {
  // ScaffoldingBlock.getCollisionShape depends on the player: its top holds a player above the block unless the player
  // is descending (sneaking); from inside, a block that is not a hanging bottom piece has no collision at all.
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`lets a sneaking player down through the top it stands on (${version}, pb_climb_scaffolding_down)`, () => {
      const { state, tick } = scaffoldingRig(version, new Vec3(0.5, 109, 673.5), { x: [-1, 1], z: [672, 674], topY: 110 });
      state.yawDegrees = 0;
      state.vel.set(0, -0.0784000015258789, 0);
      state.control.sneak = true;
      tick();
      expect(state.pos.y).toBe(108.92159999847412);
      expect(state.vel.y).toBe(-0.1552320045166016);
      expect(state.onGround).toBe(false);
    });

    it(`lets a player jump up inside it (${version}, b_climb_jump_up_scaffolding)`, () => {
      const { world, rig, state, tick } = scaffoldingRig(version, new Vec3(5.5, 101, 1765.5), { x: [5, 5], z: [1765, 1765], topY: 105 });
      for (let y = 101; y <= 105; y++) world.setOverrideBlock(new Vec3(6, y, 1765), rig.mcData.blocksByName.stone.id);
      state.yawDegrees = 270;
      state.control.jump = true;
      tick();
      expect(state.pos.y).toBe(101.41999998688698);
      expect(state.vel.y).toBe(0.11760000228881837);
    });
  }
});
