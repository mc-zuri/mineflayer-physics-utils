import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// From 1.16 Entity.updateFluidHeightAndDoFluidPushing raises a current weaker than 0.0045 to 0.0045 for an entity
// nearly at rest horizontally; before, a shallow current pushes by its depth-scaled strength only.
// Recorded as b_flow_walk_against: starting to walk west (yaw 90) from rest against the current of a shallow water
// stream (levels 4 - 7 down to the east, level 6 under the player, 0.22 deep), first tick.
const recorded: { version: string; x: number; velX: number }[] = [
  { version: "1.13.2", x: 9.483497099010705, velX: -0.013202320988165206 },
  { version: "1.20.4", x: 9.484900000056625, velX: -0.01208000013470649 },
];

describe("Botcraft minimum fluid push", () => {
  for (const { version, x, velX } of recorded) {
    it(`pushes a player at rest by at least 0.0045 only from 1.16 (${version}, b_flow_walk_against)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(9.5, 101, 1881.5), groundLevel: 101 });
      const world = createFlatWorld(version, 101);
      const { water, stone } = rig.mcData.blocksByName;
      const levels = [4, 5, 5, 6, 6, 7, 7];
      for (let z = 1879; z <= 1883; z++) {
        for (let y = 101; y <= 102; y++) world.setOverrideBlock(new Vec3(12, y, z), stone.id);
      }
      for (let z = 1880; z <= 1882; z++) {
        levels.forEach((level, i) => world.setOverrideBlock(new Vec3(5 + i, 101, z), water.id, level));
      }
      const state = rig.playerState;
      state.vel.set(0, 0, 0);
      state.yawDegrees = 90;
      state.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.x).toBe(x);
      expect(state.vel.x).toBe(velX);
    });
  }
});
