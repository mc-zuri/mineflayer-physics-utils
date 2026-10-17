import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// 1.14 - 1.15 keep Entity.isInLava from the last move: Entity.move clears it and checkInsideBlocks sets it again for
// a lava block the box is in (LiquidBlock.entityInside), and nothing else looks at lava (updateInWaterState: water
// alone). 1.16 finds it at the tick's start (updateFluidHeightAndDoFluidPushing).
// Recorded as b_lava_sneak_sink: the player starts in a pool of source lava (y 97 - 100), its feet at the bottom of
// the top block, not in lava yet to the client, and sneaks.
const recorded = [
  { version: "1.14.4", ticks: [[100, -0.0784000015258789], [99.92159999847412, -0.05920000076293945]] },
  { version: "1.15.2", ticks: [[100, -0.0784000015258789], [99.92159999847412, -0.05920000076293945]] },
  { version: "1.16.5", ticks: [[100, -0.02], [99.98, -0.03]] },
];

describe("Botcraft lava inside blocks", () => {
  for (const { version, ticks } of recorded) {
    it(`${version < "1.16" ? "falls as out of lava the tick before its move found lava" : "is in lava at the tick's start"} (${version}, b_lava_sneak_sink)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 100, 1937.5), groundLevel: 96 });
      const world = createFlatWorld(version, 96);
      const { lava } = rig.mcData.blocksByName;
      for (let x = -5; x <= 10; x++) {
        for (let z = 1927; z <= 1947; z++) for (let y = 97; y <= 100; y++) world.setOverrideBlock(new Vec3(x, y, z), lava.id);
      }
      const state = rig.playerState;
      state.vel.set(0, 0, 0);
      state.onGround = true;
      state.isInLava = false;
      state.control.sneak = true;

      for (const [y, velY] of ticks) {
        rig.physics.simulate(rig.playerCtx, world as any);
        expect(state.pos.y).toBe(y);
        expect(state.vel.y).toBe(velY);
        expect(state.isInLava).toBe(true);
      }
    });
  }
});
