import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Lava is as high as its level, like water (FlowingFluid.getOwnHeight: amount / 9), so a lava source under air tops
// out at y + 0.8888889 and a player falling in is not in lava until its feet go below that.
// Recorded as b_lava_walk_in: walking east (yaw 270) off a stone ledge into a pool of source lava (y 99 - 100),
// tick 12, the feet at 100.9216 above the 100.8889 lava top.
const recorded: { version: string; x: number; velX: number; velY: number; start: Vec3; startVelX: number }[] = [
  {
    version: "1.12.2",
    start: new Vec3(-4.384818283170011, 100.92159999847412, 1937.5),
    startVelX: 0.11770752455323462,
    x: -4.247510758384318,
    velX: 0.12494985115601355,
    velY: -0.230527368912964,
  },
  {
    version: "1.21.11",
    start: new Vec3(-4.384817994356104, 100.92159999847412, 1937.5),
    startVelX: 0.11770754062540936,
    x: -4.247510453787319,
    velX: 0.12494986551862786,
    velY: -0.230527368912964,
  },
];

describe("Botcraft lava height", () => {
  for (const { version, start, startVelX, x, velX, velY } of recorded) {
    it(`tops a lava source at 8/9 of the block (${version}, b_lava_walk_in)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: 99 });
      const world = createFlatWorld(version, 99);
      const { lava, stone } = rig.mcData.blocksByName;
      for (let z = 1932; z <= 1942; z++) {
        for (let y = 99; y <= 100; y++) {
          for (let bx = -10; bx <= -6; bx++) world.setOverrideBlock(new Vec3(bx, y, z), stone.id);
          for (let bx = -5; bx <= -2; bx++) world.setOverrideBlock(new Vec3(bx, y, z), lava.id);
        }
      }
      const state = rig.playerState;
      state.vel.set(startVelX, -0.1552320045166016, 0);
      state.onGround = false;
      state.yawDegrees = 270;
      state.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.isInLava).toBe(false);
      expect(state.pos.x).toBe(x);
      expect(state.vel.x).toBe(velX);
      expect(state.vel.y).toBe(velY);
    });
  }
});
