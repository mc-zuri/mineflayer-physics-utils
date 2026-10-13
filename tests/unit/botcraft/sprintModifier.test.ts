import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// b_berry_sprint_in tick 5: a vanilla client sprints south on stone. The server has synced the movement speed with its
// own sprint modifier (0.30000001192092896, multiply total): under LivingEntity's sprint UUID before 1.21, as
// minecraft:sprinting since. The client's sprint modifier has the same id and replaces it, so sprinting counts once.
describe("Botcraft sprint modifier", () => {
  for (const { version, modifierId } of [
    { version: "1.20.6", modifierId: "662a6b8d-da3e-4c1c-8813-96ea6097278d" },
    { version: "1.21.1", modifierId: "minecraft:sprinting" },
    { version: "1.21.11", modifierId: "minecraft:sprinting" },
  ]) {
    it(`counts the server's sprint modifier as its own (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 876.314978353502), groundLevel });
      rig.playerState.attributes = {
        [rig.physics.movementSpeedAttribute]: {
          value: 0.10000000149011612,
          modifiers: [{ uuid: modifierId, amount: 0.30000001192092896, operation: 2 }],
        },
      } as any;
      rig.playerState.vel.set(0, -0.0784000015258789, 0.13959992883423883);
      rig.playerState.onGround = true;
      rig.playerState.sprinting = true;
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.pos.z).toBe(876.581978294746);
      expect(rig.playerState.vel.z).toBe(0.14578198485214422);
    });
  }
});
