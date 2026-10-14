import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Entity.checkInsideBlocks takes the blocks of the box shrunk by 0.001 before 1.19.3 (1e-7 since): feet that end a
// tick 0.0002 under the top of a bubble column are out of it before 1.19.3, and still get its surface push after.
// Recorded as b_land_10_bubble_column_drag_false, tick 119: rising at 0.238 from y 100.762 to 100.9998 in an upward
// column topped at y 100.
const recorded: { version: string; velY: number }[] = [
  { version: "1.13.2", velY: 0.18533900908612824 },
  { version: "1.20.4", velY: 0.26533901027822115 },
];

describe("Botcraft blocks inside inset", () => {
  for (const { version, velY } of recorded) {
    it(`shrinks the box by ${version < "1.19.3" ? "0.001" : "1e-7"} (${version}, b_land_10_bubble_column_drag_false)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(4.5, 100.76185984470499, 1609.5), groundLevel: 0 });
      const world = createFlatWorld(version, 94);
      const { bubble_column, soul_sand } = rig.mcData.blocksByName;
      for (let x = 3; x <= 5; x++) {
        for (let z = 1608; z <= 1610; z++) {
          world.setOverrideBlock(new Vec3(x, 94, z), soul_sand.id);
          for (let y = 95; y <= 100; y++) world.setOverrideBlock(new Vec3(x, y, z), bubble_column.id, 1); // drag=false
        }
      }
      const state = rig.playerState;
      state.vel.set(0, 0.23792375781232003, 0);
      state.onGround = false;
      state.isInWater = true;
      state.isUnderWater = false;
      state.eyeInWater = false;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.y).toBe(100.99978360251731);
      expect(state.vel.y).toBe(velY);
    });
  }
});
