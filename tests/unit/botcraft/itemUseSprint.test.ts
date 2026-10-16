import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// q_eat_sprint: a vanilla client on stone sprints south for 10 ticks, then starts eating with forward and sprint still
// held. Only 1.21.4 ends the sprint the tick the use starts (LocalPlayer.shouldStopSprinting, right after the input's
// tick); 1.21.3 and 1.21.5 sprint on at the item-use speed.
const recorded: Record<string, { sprinting: boolean; z: number }> = {
  "1.21.3": { sprinting: true, z: 41.14781677153684 },
  "1.21.4": { sprinting: false, z: 41.14193676954962 },
  "1.21.5": { sprinting: true, z: 41.14781677153684 },
};

describe("Botcraft item use while sprinting", () => {
  for (const [version, { sprinting, z }] of Object.entries(recorded)) {
    it(`${sprinting ? "keeps" : "ends"} a sprint when an item starts being used (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      const world = createFlatWorld(version, groundLevel) as any;
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;
      for (let tick = 0; tick < 10; tick++) rig.physics.simulate(rig.playerCtx, world);
      expect(rig.playerState.sprinting).toBe(true);

      rig.playerState.isUsingItem = true;
      rig.playerState.isUsingMainHand = true;
      rig.physics.simulate(rig.playerCtx, world);

      expect(rig.playerState.sprinting).toBe(sprinting);
      expect(rig.playerState.pos.z).toBe(z);
    });
  }
});
