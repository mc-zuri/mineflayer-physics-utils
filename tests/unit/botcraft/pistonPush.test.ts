import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// The recorder's "n_piston_push": a piston at x -1 (y 101, z 2707) facing east extends its head into the cell where the
// player stands (x 0.5). The moving head ticks after the player and pushes it: 0.31000001 (to the head's far face plus
// 0.01) on the first tick, 0.5 on the second, leaving it off the ground.
describe("Botcraft piston push", () => {
  const headEast = [[0.75, 0, 0, 1, 1, 1], [-0.25, 0.375, 0.375, 0.75, 0.625, 0.625]];
  const head = (progress: number) => ({
    pos: [0, 101, 2707] as [number, number, number],
    direction: [1, 0, 0] as [number, number, number],
    extending: true,
    source: true,
    progress,
    shapes: headEast,
  });

  for (const version of ["1.12.2", "1.13.2", "1.20.4", "1.21.11"]) {
    it(`is pushed by an extending piston head (${version}, n_piston_push)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 2707.5) });
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      rig.playerState.onGround = true;

      rig.physics.simulate(rig.playerCtx, world as any);
      rig.physics.pushByMovingPiston(rig.playerCtx, world as any, head(0));
      expect(rig.playerState.pos.x).toBe(0.810000011920929);
      expect(rig.playerState.onGround).toBe(false);
      expect(rig.playerState.isCollidedVertically).toBe(false);

      rig.physics.simulate(rig.playerCtx, world as any);
      rig.physics.pushByMovingPiston(rig.playerCtx, world as any, head(0.5));
      expect(rig.playerState.pos.x).toBe(1.310000011920929);
    });
  }
});
