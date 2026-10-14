import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Entity.updateFluidHeightAndDoFluidPushing (1.13+) takes the water's top as the float y + height (the float own
// height amount / 9F), and in water shallower than 0.4 scales each block's current by that depth. 26.1's
// EntityFluidInteraction.update adds the height in double, above the box's own bottom.
// Recorded as b_flow_walk_against: walking west (yaw 90) against the current of a shallow water stream (levels 4 - 7
// down to the east), tick 2.
const recorded = [
  { version: "1.20.4", x: 9.456317099221707, velX: -0.02286632100866919 },
  { version: "1.21.11", x: 9.456317099221707, velX: -0.02286632100866919 },
  { version: "26.1", x: 9.456331111112833, velX: -0.022855111495600794 },
];

describe("Botcraft fluid height and push", () => {
  for (const { version, x, velX } of recorded) {
    it(`scales the current by the depth (${version}, b_flow_walk_against)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(9.484900000056625, 101, 1881.5), groundLevel: 101 });
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
      state.vel.set(-0.01208000013470649, -0.005, 1.9202462879198486e-18);
      state.onGround = false;
      state.isInWater = true;
      state.yawDegrees = 90;
      state.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.pos.x).toBe(x);
      expect(state.vel.x).toBe(velX);
    });
  }
});
