import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

function sprintSneakForward(version: string) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
  const world = createFlatWorld(version, groundLevel) as any;
  rig.playerState.yawDegrees = 0;
  Object.assign(rig.playerState.control, { forward: true, sprint: true, sneak: true });
  rig.physics.simulate(rig.playerCtx, world);
  rig.physics.simulate(rig.playerCtx, world);
  return rig;
}

// j_sprint_sneak_f: a vanilla client holds forward, sprint and sneak on stone from rest, facing south. It starts
// sprinting on the first tick and keeps sprinting once crouched on the second.
describe("Botcraft sprinting while sneaking", () => {
  for (const version of ["1.21.3", "1.21.5", "1.21.11"]) {
    it(`keeps a sprint while crouching (${version})`, () => {
      const rig = sprintSneakForward(version);

      expect(rig.playerState.sprinting).toBe(true);
      expect(rig.playerState.pos.z).toBe(38.73518043408735);
      expect(rig.playerState.vel.z).toBe(0.05884811707136695);
    });
  }

  // 1.21.4 alone stops it: LocalPlayer.shouldStopSprinting (isMovingSlowly), dropped again in 1.21.5
  it("stops a sprint once crouching (1.21.4)", () => {
    expect(sprintSneakForward("1.21.4").playerState.sprinting).toBe(false);
  });
});
