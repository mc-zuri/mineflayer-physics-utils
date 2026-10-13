import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// From 1.21.9 Entity.checkInsideBlocks visits the blocks of the tick's move with
// BlockGetter.forEachBlockIntersectedBetween: those of the box where the move started, those swept, then those of
// the box where it ended, each once and in the direction of the move. Before, the blocks of the final box, from the
// bottom up. From 1.21.10 a bubble column acts only when the final box overlaps it (or the move was a block or more).

function bubbleColumn(version: string, x0: number, z0: number, y0: number, y1: number, dragDown: boolean) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0, 200, 0), groundLevel: 0 });
  const world = createFlatWorld(version, y0 - 1);
  const { bubble_column, soul_sand } = rig.mcData.blocksByName;
  for (let x = x0; x <= x0 + 2; x++) {
    for (let z = z0; z <= z0 + 2; z++) {
      if (!dragDown) world.setOverrideBlock(new Vec3(x, y0 - 1, z), soul_sand.id);
      for (let y = y0; y <= y1; y++) world.setOverrideBlock(new Vec3(x, y, z), bubble_column.id, dragDown ? 0 : 1);
    }
  }
  return { rig, world };
}

describe("Botcraft blocks inside along the move", () => {
  // b_bubble_down_fall_in, tick 17: falling at -0.9 from y 100.42 into a downward column topped at y 100. 1.21.9+
  // meet the top (surface) block first, then the one below; before, the lower (inside) block first.
  for (const { version, velY } of [
    { version: "1.21.8", velY: -0.32999999999999996 },
    { version: "1.21.9", velY: -0.3 },
    { version: "1.21.11", velY: -0.3 },
  ]) {
    it(`meets the column blocks along the fall (${version}, b_bubble_down_fall_in)`, () => {
      const { rig, world } = bubbleColumn(version, 4, 1002, 95, 100, true);
      const state = rig.playerState;
      state.pos.set(5.5, 100.41564586078748, 1003.5);
      state.vel.set(0, -0.9, 0);
      state.onGround = false;
      state.isInWater = true;
      state.isUnderWater = false;
      state.eyeInWater = false;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.y).toBe(99.51564586078747);
      expect(state.vel.y).toBe(velY);
    });
  }

  // b_bubble_up_from_bottom, tick 5: rising from y 94.66 to 95.11 in an upward column. 1.21.9 also pushes for
  // block 94, left behind; 1.21.10+ only for blocks the final box overlaps, as the final box alone did before.
  for (const { version, velY } of [
    { version: "1.21.8", velY: 0.4729840108637811 },
    { version: "1.21.9", velY: 0.5329840108637811 },
    { version: "1.21.11", velY: 0.4729840108637811 },
  ]) {
    it(`pushes for the column blocks ${version === "1.21.9" ? "met" : "overlapped"} (${version}, b_bubble_up_from_bottom)`, () => {
      const { rig, world } = bubbleColumn(version, 4, 958, 93, 97, false);
      const state = rig.playerState;
      state.pos.set(5.5, 94.66260000493526, 959.5);
      state.vel.set(0, 0.44748000691175466, 0);
      state.onGround = false;
      state.isInWater = true;
      state.isUnderWater = true;
      state.eyeInWater = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.y).toBe(95.11008001184702);
      expect(state.vel.y).toBe(velY);
    });
  }
});
