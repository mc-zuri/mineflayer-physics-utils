import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// The recorder's cobweb area: a block of cobwebs over x -1..1, y 101..105, z 845..851 on flat ground (y 100), the
// player starting inside it at (0.5, 101, 846.5) facing south (yaw 0).
function inCobwebs(version: string) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 846.5) });
  const cobweb = (rig.mcData.blocksByName.cobweb ?? rig.mcData.blocksByName.web).id;
  for (let x = -1; x <= 1; x++) {
    for (let y = 101; y <= 105; y++) {
      for (let z = 845; z <= 851; z++) world.setOverrideBlock(new Vec3(x, y, z), cobweb);
    }
  }
  rig.playerState.yawDegrees = 0;
  return { state: rig.playerState, tick: () => rig.physics.simulate(rig.playerCtx, world as any) };
}

describe("Botcraft stuck in a block", () => {
  // The block's entityInside (WebBlock: makeStuckInBlock) slows the move of the next tick: Entity.move scales it by
  // the stuck multiplier and stops the motion. isInWeb tells whether this tick's move was slowed.
  for (const version of ["1.12.2", "1.13.2", "1.20.4", "1.21.11"]) {
    it(`reports the move slowed by a cobweb (${version}, b_cobweb_jump_inside)`, () => {
      const { state, tick } = inCobwebs(version);
      state.control.jump = true;
      tick();
      expect(state.pos.y).toBe(101.41999998688698);
      expect(state.isInWeb).toBe(false);

      state.control.jump = false;
      tick();
      expect(state.pos.y).toBe(101.43665998681695);
      expect(state.vel.y).toBe(-0.0784000015258789);
      expect(state.isInWeb).toBe(true);
    });
  }
});
