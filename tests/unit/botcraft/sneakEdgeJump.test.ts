import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Player.maybeBackOffFromEdge (Entity.move before 1.14): a sneaking player on the ground does not step off an edge.
// Before 1.19 that holds for a jump too: the move is backed off whatever its height; from 1.19 only a move that does not
// go up (delta.y <= 0) is. (r_free_play on 1.13.2, tick 633: forward, sneak and jump at a ledge, 0.05 held back.)
function jumpAtLedge(version: string) {
  const start = new Vec3(1.29, 100, 0.5);
  const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
  const world = createFlatWorld(version, 100);
  // the ledge: no ground east of x 1
  for (let x = 1; x <= 4; x++) for (let z = -2; z <= 2; z++) world.setOverrideBlock(new Vec3(x, 99, z), rig.mcData.blocksByName.air.id);
  rig.playerState.yawDegrees = 270;
  rig.playerState.control.forward = true;
  rig.playerState.control.sneak = true;
  rig.playerState.control.jump = true;
  rig.playerState.vel.set(0.06, 0, 0);
  rig.physics.simulate(rig.playerCtx, world as any);
  return rig.playerState;
}

describe("Botcraft sneaking jump at a ledge", () => {
  it("is held back from the edge before 1.19 (1.13.2)", () => {
    const player = jumpAtLedge("1.13.2");
    expect(player.vel.y).toBeGreaterThan(0);
    expect(player.pos.x).toBe(1.29);
  });

  it("goes over the edge from 1.19 (1.19)", () => {
    const player = jumpAtLedge("1.19");
    expect(player.vel.y).toBeGreaterThan(0);
    expect(player.pos.x).toBeGreaterThan(1.29);
  });
});
