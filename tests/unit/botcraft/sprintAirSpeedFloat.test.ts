import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// s_sprint_jump_glass, tick 8: a vanilla client sprints east for 6 ticks, jumps, and moves its first tick in the air
// by the sprinting air speed. 1.18.2 - 1.19.3 add it up in floats (0.02F + 0.006F: 0.026000000536441803), the
// versions around them reach 0.025999998673796654 ((float)(0.02F + 0.006D), 0.025999999F).
const recorded: Record<string, [number, number]> = {
  "1.17.1": [2.617398066804899, 0.2599691456275678],
  "1.18.2": [2.6173980686302913, 0.2599691472886748],
  "1.19.3": [2.6173980686302913, 0.2599691472886748],
  "1.19.4": [2.617398066804899, 0.2599691456275678],
};

describe("Botcraft sprinting air speed", () => {
  for (const [version, [x, velX]] of Object.entries(recorded)) {
    it(`moves by the version's sprinting air speed on a sprint jump (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 1213.5), groundLevel });
      const world = createFlatWorld(version, groundLevel) as any;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;
      for (let tick = 1; tick <= 8; tick++) {
        rig.playerState.control.jump = tick === 7;
        rig.physics.simulate(rig.playerCtx, world);
      }

      expect(rig.playerState.pos.x).toBe(x);
      expect(rig.playerState.vel.x).toBe(velX);
    });
  }
});
