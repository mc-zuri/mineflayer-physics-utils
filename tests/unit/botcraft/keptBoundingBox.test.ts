import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// j_walk_l: walking left (east at yaw 0) on flat ground from (0.5, 101, 38.5). Before 1.17 Entity.move moves the
// bounding box it keeps across ticks and takes the position from its centre (setLocationFromBoundingbox), which is an
// ulp off the position plus the movement by tick 8; since 1.17 it adds the movement to the position.
const START = new Vec3(0.5, 101, 38.5);

function walkLeft(version: string, ticks: number) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: START });
  rig.playerState.yawDegrees = 0;
  rig.playerState.control.left = true;
  const walk = () => {
    for (let i = 0; i < ticks; i++) rig.physics.simulate(rig.playerCtx, world as any);
    return rig.playerState.pos.x;
  };
  return { rig, walk };
}

describe("Botcraft kept bounding box", () => {
  for (const version of ["1.12.2", "1.13.2"]) {
    it(`takes the position from the kept box after each move (${version}, j_walk_l tick 8)`, () => {
      expect(walkLeft(version, 8).walk()).toBe(1.9693212934561402);
    });

    it(`builds the box anew when the position was set elsewhere (${version}, j_walk_l tick 8)`, () => {
      const { rig, walk } = walkLeft(version, 8);
      walk();
      // the bot is put back where the recording starts, as mineflayer's PlayerState.update does after a teleport
      rig.playerState.pos.set(START.x, START.y, START.z);
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      expect(walk()).toBe(1.9693212934561402);
    });
  }

  for (const version of ["1.20.4", "1.21.11"]) {
    it(`adds the movement to the position (${version}, j_walk_l tick 8)`, () => {
      expect(walkLeft(version, 8).walk()).toBe(1.9693214940821298);
    });
  }
});
