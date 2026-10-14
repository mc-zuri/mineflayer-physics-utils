import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { PlayerPoses } from "../../../src/physics/states/poses";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Entity.checkInsideBlocks walks the blocks of the player's own bounding box: before 1.14 a sneaking player is 1.65F
// tall (EntityPlayer.updateSize), not the 1.5F of the 1.14+ crouching pose, so its head reaches a bubble column's top
// block, and its surface push, sooner.
// Recorded as b_land_sneak_bubble_column_drag_false, tick 26: sneaking while rising at 0.211 from y 98.293 in an
// upward column topped at y 100.
const recorded: { version: string; velY: number }[] = [
  { version: "1.13.2", velY: 0.3081532941123012 },
  { version: "1.20.4", velY: 0.2281532929202083 },
];

describe("Botcraft blocks inside the player's box", () => {
  for (const { version, velY } of recorded) {
    it(`walks the blocks of a ${version < "1.14" ? "1.65" : "1.5"} tall sneaking box (${version}, b_land_sneak_bubble_column_drag_false)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(4.5, 98.29279202397967, 1609.5), groundLevel: 0 });
      const world = createFlatWorld(version, 97);
      const { bubble_column, soul_sand } = rig.mcData.blocksByName;
      for (let x = 3; x <= 5; x++) {
        for (let z = 1608; z <= 1610; z++) {
          world.setOverrideBlock(new Vec3(x, 97, z), soul_sand.id);
          for (let y = 98; y <= 100; y++) world.setOverrideBlock(new Vec3(x, y, z), bubble_column.id, 1); // drag=false
        }
      }
      const state = rig.playerState;
      state.vel.set(0, 0.21144161091337227, 0);
      state.onGround = false;
      state.isInWater = true;
      state.isUnderWater = true;
      state.eyeInWater = true;
      state.control.sneak = true;
      state.prevControl.sneak = true;
      state.crouching = true;
      state.pose = PlayerPoses.SNEAKING;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.y).toBe(98.46423363578711);
      expect(state.vel.y).toBe(velY);
    });
  }
});
