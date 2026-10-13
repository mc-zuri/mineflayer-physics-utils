import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Before 1.21.2 Entity.checkInsideBlocks walks the blocks of the box x by x, then y, then z innermost. A player
// rising across two columns of an upward bubble column meets column x 5 bottom to top (the surface push last) before
// column x 6, whose inside pushes then clamp the motion to 0.7 again before its surface push.
// Recorded as b_bubble_up_swim_out, tick 6: rising at 0.555 through y 98 - 100 (top y 100) while strafing east
// across x 5 and 6.
const recorded: { version: string; x: number; velX: number }[] = [
  { version: "1.13.2", x: 5.726450566117582, velX: 0.05270989063827521 },
  { version: "1.21.1", x: 5.726450562777638, velX: 0.052709889860851296 },
];

describe("Botcraft blocks inside order", () => {
  for (const { version, x, velX } of recorded) {
    it(`walks the blocks inside x by x (${version}, b_bubble_up_swim_out)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(x, 97.8798720231023, 959.5), groundLevel: 0 });
      const world = createFlatWorld(version, 92);
      const { bubble_column, soul_sand, stone } = rig.mcData.blocksByName;
      for (let z = 957; z <= 961; z++) {
        for (let bx = 3; bx <= 9; bx++) {
          world.setOverrideBlock(new Vec3(bx, 92, z), soul_sand.id);
          for (let y = 93; y <= 100; y++) world.setOverrideBlock(new Vec3(bx, y, z), bubble_column.id, 1); // drag=false
        }
        for (let y = 92; y <= 100; y++) world.setOverrideBlock(new Vec3(10, y, z), stone.id);
      }
      const state = rig.playerState;
      state.vel.set(velX, 0.5550000083446502, 0);
      state.onGround = false;
      state.isInWater = true;
      state.isUnderWater = true;
      state.eyeInWater = true;
      state.yawDegrees = 0;
      state.control.left = true;
      state.prevControl.left = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.y).toBe(98.43487203144694);
      expect(state.vel.y).toBe(0.6350000095367431);
    });
  }
});
