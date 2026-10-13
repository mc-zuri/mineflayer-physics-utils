import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// j_double_tap_forward: a vanilla client on stone, facing south, taps forward, lets go for two ticks and presses it
// again: LocalPlayer.aiStep's first press opens a 7-tick window (sprintTriggerTime), the second one sprints.
const recorded: Record<string, [number, number]> = {
  "1.12.2": [38.82407493841419, 0.07826996952087753],
  "1.20.4": [38.82407499665664, 0.07826998784785542],
  // 1.21.5+ by ClientInput.hasForwardImpulse, without the ground check
  "1.21.11": [38.82407499665664, 0.07826998784785542],
};

describe("Botcraft double-tap sprint", () => {
  for (const [version, [posZ, velZ]] of Object.entries(recorded)) {
    it(`sprints on a double tap of forward (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      const world = createFlatWorld(version, groundLevel) as any;
      rig.playerState.yawDegrees = 0;

      for (const forward of [true, false, false, true]) {
        rig.playerState.control.forward = forward;
        rig.physics.simulate(rig.playerCtx, world);
      }

      expect(rig.playerState.sprinting).toBe(true);
      expect(rig.playerState.pos.z).toBe(posZ);
      expect(rig.playerState.vel.z).toBe(velZ);
    });
  }

  it("does not sprint when the second tap comes after the window (1.21.11)", () => {
    const rig = createBotcraftPlayerRig({ version: "1.21.11", position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
    const world = createFlatWorld("1.21.11", groundLevel) as any;

    for (const forward of [true, false, false, false, false, false, false, false, true]) {
      rig.playerState.control.forward = forward;
      rig.physics.simulate(rig.playerCtx, world);
    }

    expect(rig.playerState.sprinting).toBe(false);
  });
});
