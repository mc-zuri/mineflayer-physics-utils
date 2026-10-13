import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// e_speed_5_walk: a vanilla client with Speed V walks forward on stone from rest, facing south, on the movement speed
// the server synced. mineflayer keeps a synced attribute under the name ClientboundUpdateAttributesPacket gives it:
// the namespaced registry name from 1.16 to 1.20.4, from 1.20.5 the name minecraft-data maps the attribute's id to.
describe("Botcraft synced attribute names", () => {
  for (const { version, key, modifierId } of [
    { version: "1.20.4", key: "minecraft:generic.movement_speed", modifierId: "91aeaa56-376b-4498-935b-2f7f68070635" },
    { version: "1.20.6", key: "generic.movement_speed", modifierId: "91aeaa56-376b-4498-935b-2f7f68070635" },
    { version: "1.21.11", key: "minecraft:movement_speed", modifierId: "minecraft:effect.speed" },
  ]) {
    it(`reads the movement speed synced as ${key} (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      rig.playerState.attributes = {
        [key]: {
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
