import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// j_sprint_then_release_sprint: a vanilla client sprints south on stone, then lets go of the sprint key and keeps
// walking forward. LocalPlayer.aiStep never stops a sprint for the key: it goes on (tick 21 from tick 20's state).
const recorded: Record<string, { before: [number, number]; after: [number, number] }> = {
  "1.12.2": { before: [43.77485473126755, 0.15321590696997217], after: [44.0554706192594, 0.15321629264002687] },
  "1.21.11": { before: [43.77485603084479, 0.15321594471810326], after: [44.05547198797258, 0.153216330388253] },
};

describe("Botcraft sprint key release", () => {
  for (const [version, { before, after }] of Object.entries(recorded)) {
    it(`keeps sprinting after the sprint key is released (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, before[0]), groundLevel });
      rig.playerState.vel.set(0, -0.0784000015258789, before[1]);
      rig.playerState.yawDegrees = 0;
      rig.physics.setSprinting(rig.playerCtx, true);
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.sprinting).toBe(true);
      expect(rig.playerState.pos.z).toBe(after[0]);
      expect(rig.playerState.vel.z).toBe(after[1]);
    });
  }
});
