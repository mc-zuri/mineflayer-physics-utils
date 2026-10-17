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

      // (the tick it ends, it turns into the head: no push from 1.11)
      rig.physics.simulate(rig.playerCtx, world as any);
      const x = rig.playerState.pos.x;
      rig.physics.pushByMovingPiston(rig.playerCtx, world as any, head(1));
      expect(rig.playerState.pos.x).toBe(x);
    });
  }

  // Before 1.11 TileEntityPiston.update moves the player by Entity.move. 1.8 (updatePushedObjects): the head's box, a
  // full cube drawn in on its east side by what is left to go (1 - progress), meets the player: it moves by the
  // progress gone plus 0.0625F (0.5625). 1.9 - 1.10 (moveCollidedEntities): the plate's box at the progress before and
  // after, joined, pushes the player out of it plus 0.01 (0.31, then 0.5). Recorded: n_piston_push tick 4 on 1.8.8,
  // tick 4 on 1.9.4, tick 6 on 1.10.2, and the server's own pushes after (its position corrections).
  for (const [version, first, second] of [["1.8.8", 1.0625, 1.625], ["1.9.4", 0.810000011920929, 1.310000011920929], ["1.10.2", 0.810000011920929, 1.310000011920929]] as const) {
    it(`is moved by an extending piston head before 1.11 (${version}, n_piston_push)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 2707.5) });
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      rig.playerState.onGround = true;

      rig.physics.simulate(rig.playerCtx, world as any);
      rig.physics.pushByMovingPiston(rig.playerCtx, world as any, head(0));
      expect(rig.playerState.pos.x).toBe(first);
      expect(rig.playerState.pos.y).toBe(101);
      expect(rig.playerState.onGround).toBe(false);
      expect(rig.playerState.isCollidedVertically).toBe(false);

      rig.physics.simulate(rig.playerCtx, world as any);
      rig.physics.pushByMovingPiston(rig.playerCtx, world as any, head(0.5));
      expect(rig.playerState.pos.x).toBe(second);

      // the end pushes again where the block is whole: the player is past it
      rig.physics.simulate(rig.playerCtx, world as any);
      const x = rig.playerState.pos.x;
      rig.physics.pushByMovingPiston(rig.playerCtx, world as any, head(1));
      expect(rig.playerState.pos.x).toBe(x);
    });
  }

  // 1.8's end of a moving block pushes what its whole box meets by 0.25F along the piston's facing, a retracting one too
  it("is moved by 0.25 at the end of a moving block on 1.8 (1.8.8)", () => {
    const version = "1.8.8";
    const world = createFlatWorld(version, 101);
    const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 2707.5) });
    rig.playerState.vel.set(0, -0.0784000015258789, 0);
    rig.playerState.onGround = true;
    rig.physics.simulate(rig.playerCtx, world as any);
    rig.physics.pushByMovingPiston(rig.playerCtx, world as any, { ...head(1), extending: false });
    expect(rig.playerState.pos.x).toBe(0.75);
  });
});
