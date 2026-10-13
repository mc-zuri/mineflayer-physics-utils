import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { PlayerPoses } from "../../../src/physics/states/poses";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// 1.21.2 moved the effects of the blocks the player is inside from Entity.move to LivingEntity.aiStep after the whole
// travel (applyEffectsFromBlocks), after gravity and drag. A bubble column's push is then not dragged in the tick it
// is applied; HoneyBlock was changed with it to undo travel's gravity and drag (getOldDeltaY / getNewDeltaY), so
// honey slides stay the same.

describe("Botcraft blocks inside after travel", () => {
  // b_bubble_up_from_bottom: idle at the bottom of an upward bubble column over soul sand, first tick
  for (const { version, velY } of [
    { version: "1.21.1", velY: 0.09100000143051147 },
    { version: "1.21.3", velY: 0.11499999999999999 },
  ]) {
    it(`pushes up a bubble column ${version < "1.21.2" ? "before" : "after"} travel (${version}, b_bubble_up_from_bottom)`, () => {
      const start = new Vec3(5.5, 94, 959.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 92);
      const { bubble_column, soul_sand } = rig.mcData.blocksByName;
      for (let x = 4; x <= 6; x++) {
        for (let z = 958; z <= 960; z++) {
          world.setOverrideBlock(new Vec3(x, 92, z), soul_sand.id);
          for (let y = 93; y <= 97; y++) world.setOverrideBlock(new Vec3(x, y, z), bubble_column.id, 1); // drag=false
        }
      }
      rig.playerState.vel.set(0, 0, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(94);
      expect(rig.playerState.vel.y).toBe(velY);
    });
  }

  // b_honey_slide_sneak: falling past the side of a honey wall while walking into it east (yaw 270), tick 5
  for (const version of ["1.21.1", "1.21.3"]) {
    it(`slides down honey the same (${version}, b_honey_slide_sneak)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(1.67972111199589, 117.53584062504456, 1987.5), groundLevel: 100 });
      const world = createFlatWorld(version, 100);
      const { honey_block, stone } = rig.mcData.blocksByName;
      for (let z = 1985; z <= 1989; z++) {
        for (let y = 116; y <= 120; y++) world.setOverrideBlock(new Vec3(2, y, z), honey_block.id);
      }
      for (let x = -1; x <= 1; x++) {
        for (let z = 1986; z <= 1988; z++) world.setOverrideBlock(new Vec3(x, 120, z), stone.id);
      }
      const state = rig.playerState;
      state.vel.set(0.05497311406713254, -0.30431682745754424, 0);
      state.onGround = false;
      state.yawDegrees = 270;
      state.control.forward = true;
      state.control.sneak = true;
      state.prevControl.sneak = true; // sneaking since the start
      state.crouching = true;
      state.pose = PlayerPoses.SNEAKING;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.x).toBe(1.7405742265228723);
      expect(state.pos.y).toBe(117.23152379758702);
      expect(state.vel.x).toBe(0.009098467586912531);
      expect(state.vel.y).toBe(-0.12740000247955321);
    });
  }
});
