import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Before 1.14 Entity.isInLava is any lava block in the box shrunk by 0.1F sideways and 0.4F vertically
// (World.containsMaterial), asked live: a player falling into lava travels through the air until its shrunk box
// reaches a lava block, and the tick it does reports being in lava after the move.
// Recorded as b_lava_walk_in: walking east (yaw 270) off a stone ledge into a pool of source lava (y 99 - 100),
// tick 13, the feet at 100.77 going down to 100.54.
const recorded = ["1.12.2", "1.13.2"];

describe("Botcraft lava before 1.14", () => {
  for (const version of recorded) {
    it(`finds lava in the shrunk box, live (${version}, b_lava_walk_in)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(-4.247510758384318, 100.76636799395752, 1937.5), groundLevel: 99 });
      const world = createFlatWorld(version, 99);
      const { lava, stone } = rig.mcData.blocksByName;
      for (let z = 1932; z <= 1942; z++) {
        for (let y = 99; y <= 100; y++) {
          for (let bx = -10; bx <= -6; bx++) world.setOverrideBlock(new Vec3(bx, y, z), stone.id);
          for (let bx = -5; bx <= -2; bx++) world.setOverrideBlock(new Vec3(bx, y, z), lava.id);
        }
      }
      const state = rig.playerState;
      state.vel.set(0.12494985115601355, -0.230527368912964, 0);
      state.onGround = false;
      state.yawDegrees = 270;
      state.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.x).toBe(-4.102960906995847);
      expect(state.pos.y).toBe(100.53584062504456);
      expect(state.vel.x).toBe(0.13154036855447993);
      expect(state.vel.y).toBe(-0.30431682745754424);
      expect(state.isInLava).toBe(true);
    });
  }

  // flowing lava (flowing_lava before 1.13, BlockDynamicLiquid) is of lava's material, whatever its level: the same
  // pool of it is found alike, and the player moves as the recording's (lava's current does not push before 1.14)
  it("finds flowing lava as lava (1.12.2, b_lava_walk_in's pool as flowing lava)", () => {
    const version = "1.12.2";
    const rig = createBotcraftPlayerRig({ version, position: new Vec3(-4.247510758384318, 100.76636799395752, 1937.5), groundLevel: 99 });
    const world = createFlatWorld(version, 99);
    const { flowing_lava, stone } = rig.mcData.blocksByName;
    for (let z = 1932; z <= 1942; z++) {
      for (let y = 99; y <= 100; y++) {
        for (let bx = -10; bx <= -6; bx++) world.setOverrideBlock(new Vec3(bx, y, z), stone.id);
        for (let bx = -5; bx <= -2; bx++) world.setOverrideBlock(new Vec3(bx, y, z), flowing_lava.id, -2 - bx);
      }
    }
    const state = rig.playerState;
    state.vel.set(0.12494985115601355, -0.230527368912964, 0);
    state.onGround = false;
    state.yawDegrees = 270;
    state.control.forward = true;

    rig.physics.simulate(rig.playerCtx, world as any);

    expect(state.pos.x).toBe(-4.102960906995847);
    expect(state.pos.y).toBe(100.53584062504456);
    expect(state.vel.x).toBe(0.13154036855447993);
    expect(state.vel.y).toBe(-0.30431682745754424);
    expect(state.isInLava).toBe(true);
  });
});
