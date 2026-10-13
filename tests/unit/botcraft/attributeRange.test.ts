import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// e_slowness_10_walk: a vanilla client with Slowness X walks forward on stone from rest, facing south. The synced
// movement speed is 0.1 with the effect's -1.5 total multiplier: 0.1 * (1 - 1.5) is clamped to the attribute's
// minimum, 0 (RangedAttribute.sanitizeValue), so the player stays put.
const slownessModifier: Record<string, { key: string; uuid: string }> = {
  "1.12.2": { key: "generic.movementSpeed", uuid: "7107de5e-7ce8-4030-940e-514c1f160890" },
  "1.21.3": { key: "minecraft:movement_speed", uuid: "minecraft:effect.slowness" },
  "1.21.11": { key: "minecraft:movement_speed", uuid: "minecraft:effect.slowness" },
};

describe("Botcraft attribute range", () => {
  for (const [version, { key, uuid }] of Object.entries(slownessModifier)) {
    it(`clamps a movement speed below zero to zero (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      rig.playerState.yawDegrees = 0;
      rig.playerState.control.forward = true;
      rig.playerState.attributes[key] = {
        value: 0.10000000149011612,
        modifiers: [{ uuid, amount: -1.5000000596046448, operation: 2 }],
      } as any;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.pos.z).toBe(38.5);
      expect(rig.playerState.vel.z).toBe(0);
    });
  }
});
