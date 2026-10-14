import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// FlowingFluid.getFlow (1.13+) pushes toward each neighbour by the float difference of the fluids' own heights
// (amount / 9F), normalized as Vec3.normalize (a float square root before 1.17).
// Recorded as b_flow_walk_around_bend, tick 27: pressing forward (yaw 0, south) against the south wall of a one-wide
// stone channel whose water drops a level per block east, x -4 (source) to x 0 (level 4), then turns south (levels
// 5, 6); the current carries the player east.
// Before 1.13 BlockLiquid.getFlow sums the integer level differences instead, normalized with Vec3d.normalize's
// float square root (MathHelper.sqrt), as is the sum of the flows Entity.handleWaterMovement pushes by.
const recorded: { version: string; start: Vec3; startVelX: number; startVelY?: number; velX: number }[] = [
  {
    version: "1.12.2",
    start: new Vec3(-0.25973551071639034, 101, 1887.699999988079),
    startVelX: 0.06874714495448689,
    startVelY: -0.02,
    velX: 0.06534516742425936,
  },
  {
    version: "1.13.2",
    start: new Vec3(-0.25973551071639034, 101, 1887.699999988079),
    startVelX: 0.06874714495448689,
    velX: 0.06455751558544712,
  },
  {
    version: "1.21.11",
    start: new Vec3(-0.2597355357812939, 101, 1887.699999988079),
    startVelX: 0.06874714476398164,
    velX: 0.06455751527886212,
  },
];

describe("Botcraft fluid flow", () => {
  for (const { version, start, startVelX, startVelY, velX } of recorded) {
    it(`pushes by the ${version < "1.13" ? "level" : "float height"} differences (${version}, b_flow_walk_around_bend)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 101);
      const { stone, water, air } = rig.mcData.blocksByName;
      for (let bx = -7; bx <= 3; bx++) {
        for (let z = 1884; z <= 1891; z++) {
          for (let y = 101; y <= 102; y++) world.setOverrideBlock(new Vec3(bx, y, z), stone.id);
        }
      }
      const channel: [number, number, number][] = [
        [-4, 1887, 0],
        [-3, 1887, 1],
        [-2, 1887, 2],
        [-1, 1887, 3],
        [0, 1887, 4],
        [0, 1888, 5],
        [0, 1889, 6],
      ];
      for (const [bx, z, level] of channel) {
        world.setOverrideBlock(new Vec3(bx, 101, z), water.id, level);
        world.setOverrideBlock(new Vec3(bx, 102, z), air.id);
      }
      const state = rig.playerState;
      state.vel.set(startVelX, startVelY ?? -0.005, 0);
      state.isInWater = true;
      state.yawDegrees = 0;
      state.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.vel.x).toBe(velX);
    });
  }
});
