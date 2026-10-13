import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// q_eat_sprint: a vanilla client sprints south on stone and starts eating (tick 11, from tick 10's state). Eating
// slows the forward impulse to 0.2: before 1.14 a forward impulse below 0.8 stops the sprint
// (EntityPlayerSP.onLivingUpdate); since, any forward impulse keeps it (ClientInput.hasForwardImpulse).
const recorded: Record<string, { before: [number, number]; after: [number, number]; sprinting: boolean }> = {
  "1.12.2": { before: [40.969480138054706, 0.15285598415478233], after: [41.1419361205793, 0.09416097739547397], sprinting: false },
  "1.13.2": { before: [40.969480426894, 0.15285600203336944], after: [41.14193642729718, 0.09416098715718367], sprinting: false },
  "1.20.4": { before: [40.969480746465806, 0.1528560218142385], after: [41.14781677153684, 0.09737148099873924], sprinting: true },
};

describe("Botcraft sprint stop before 1.14", () => {
  for (const [version, { before, after, sprinting }] of Object.entries(recorded)) {
    it(`${sprinting ? "keeps" : "stops"} a sprint when eating slows the input (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, before[0]), groundLevel });
      rig.playerState.vel.set(0, -0.0784000015258789, before[1]);
      rig.playerState.yawDegrees = 0;
      rig.physics.setSprinting(rig.playerCtx, true);
      rig.playerState.prevForwardImpulse = 1;
      Object.assign(rig.playerState.control, { forward: true, sprint: true });
      rig.playerState.isUsingItem = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.sprinting).toBe(sprinting);
      expect(rig.playerState.pos.z).toBe(after[0]);
      expect(rig.playerState.vel.z).toBe(after[1]);
    });
  }
});
