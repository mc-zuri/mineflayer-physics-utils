import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// e_speed_5_walk: a vanilla client with Speed V walks forward on stone from rest, facing south. The server adds the
// effect's modifier (1.0000000149011612, multiply total) to the movement speed it syncs: under its UUID before 1.21,
// as minecraft:effect.speed since. The client applies nothing of its own for the effect.
describe("Botcraft speed effect", () => {
  for (const { version, modifierId } of [
    { version: "1.20.4", modifierId: "91aeaa56-376b-4498-935b-2f7f68070635" },
    { version: "1.21.11", modifierId: "minecraft:effect.speed" },
  ]) {
    it(`takes the speed effect from the synced movement speed only (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      const speed = rig.mcData.effectsByName.Speed.id;
      rig.playerState.effects = { [speed]: { id: speed, amplifier: 4, duration: 200 } } as any;
      rig.playerState.speed = 5;
      rig.playerState.attributes = {
        [rig.physics.movementSpeedAttribute]: {
          value: 0.10000000149011612,
          modifiers: [{ uuid: modifierId, amount: 1.0000000149011612, operation: 2 }],
        },
      } as any;
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.pos.z).toBe(38.696000006735325);
      expect(rig.playerState.vel.z).toBe(0.10701601610767887);
    });
  }
});
