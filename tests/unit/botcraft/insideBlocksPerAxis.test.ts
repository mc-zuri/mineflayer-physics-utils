import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// From 1.21.5 Entity.move records its move split per axis (axisStepOrder: Y first), and checkInsideBlocks visits the
// blocks of the box at the end of each step, each block once: a player falling and strafing across the edge of a
// column is also pushed by the column it leaves sideways. 1.21.2 - 1.21.4 take the box at the end of the tick only.
// Recorded as b_bubble_up_swim_out, tick 30: falling at -0.62 into an upward column (top y 100) while strafing east
// (left, yaw 0) from the column x 8 into the column x 9.
const recorded: { version: string; velY: number }[] = [
  { version: "1.21.3", velY: -0.33910064944485707 },
  { version: "1.21.5", velY: -0.17910064944485712 },
  { version: "1.21.8", velY: -0.17910064944485712 },
];

describe("Botcraft blocks inside per axis step", () => {
  for (const { version, velY } of recorded) {
    it(`pushes for the columns of each axis step (${version}, b_bubble_up_swim_out)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(9.169935520267291, 100.24935249766295, 959.5), groundLevel: 0 });
      const world = createFlatWorld(version, 92);
      const { bubble_column, soul_sand, stone } = rig.mcData.blocksByName;
      for (let z = 957; z <= 961; z++) {
        for (let x = 3; x <= 9; x++) {
          world.setOverrideBlock(new Vec3(x, 92, z), soul_sand.id);
          for (let y = 93; y <= 100; y++) world.setOverrideBlock(new Vec3(x, y, z), bubble_column.id, 1); // drag=false
        }
        for (let y = 92; y <= 100; y++) world.setOverrideBlock(new Vec3(10, y, z), stone.id);
      }
      const state = rig.playerState;
      state.vel.set(0.17841842020833532, -0.6176258026027297, 0);
      state.onGround = false;
      state.isInWater = true;
      state.isUnderWater = false;
      state.eyeInWater = false;
      state.yawDegrees = 0;
      state.control.left = true;
      state.prevControl.left = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.x).toBe(9.367953940419001);
      expect(state.pos.y).toBe(99.63172669506022);
      expect(state.vel.y).toBe(velY);
    });
  }
});
