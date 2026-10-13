import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// e_blindness_sprint: a blind vanilla client holding sprint and forward on stone does not sprint (LocalPlayer's
// sprint start requires no blindness); its first tick is a walk.
describe("Botcraft blindness", () => {
  for (const { version, z } of [
    { version: "1.12.2", z: 38.59799998998642 },
    { version: "1.21.11", z: 38.59800000336766 },
  ]) {
    it(`does not start sprinting while blind (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      const blindness = rig.mcData.effectsByName.Blindness.id;
      rig.fakePlayer.entity.effects = { [blindness]: { id: blindness, amplifier: 0, duration: 200 } };
      rig.playerState.update(rig.fakePlayer, rig.playerState.control);
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.sprinting).toBe(false);
      expect(rig.playerState.pos.z).toBe(z);
    });
  }

  // e_blindness_mid_sprint: blindness that starts during a sprint ends it only from 1.21.4 (shouldStopRunSprinting)
  for (const { version, keepsSprinting } of [
    { version: "1.20.4", keepsSprinting: true },
    { version: "1.21.11", keepsSprinting: false },
  ]) {
    it(`${keepsSprinting ? "keeps" : "stops"} a sprint when blindness starts during it (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      const world = createFlatWorld(version, groundLevel) as any;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;
      rig.physics.simulate(rig.playerCtx, world);
      expect(rig.playerState.sprinting).toBe(true);

      // the bot learns of the effect between ticks, as mineflayer hands it over
      rig.playerState.apply(rig.fakePlayer);
      const blindness = rig.mcData.effectsByName.Blindness.id;
      rig.fakePlayer.entity.effects = { [blindness]: { id: blindness, amplifier: 0, duration: 200 } };
      rig.playerState.update(rig.fakePlayer, rig.playerState.control);
      rig.physics.simulate(rig.playerCtx, world);

      expect(rig.playerState.sprinting).toBe(keepsSprinting);
    });
  }
});
