import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// q_shield_sneak: a vanilla client walks forward sneaking with a raised shield on stone from rest, facing south.
// LocalPlayer.aiStep slows the float input by 0.2F while an item is in use (with the sneak slowdown, before the
// 0.98F of LivingEntity.aiStep; 1.21.5+ in modifyInput), not the movement speed.
const recorded: Record<string, [number, number][]> = {
  // before 1.14 the sneak key slows the first tick already
  "1.12.2": [
    [38.505879999604076, 0.0032104801567312824],
    [38.514970479364884, 0.004963402525913102],
  ],
  "1.21.3": [
    [38.51960000126958, 0.01070160193620929],
    [38.53618160373568, 0.009053555998081964],
  ],
  "1.21.5": [
    [38.51960000126958, 0.01070160193620929],
    [38.53618160373568, 0.009053555998081964],
  ],
  "1.21.11": [
    [38.51960000126958, 0.01070160193620929],
    [38.53618160373568, 0.009053555998081964],
  ],
};

describe("Botcraft item use slowdown", () => {
  for (const [version, ticks] of Object.entries(recorded)) {
    it(`slows the input of a player using an item as vanilla (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      const world = createFlatWorld(version, groundLevel) as any;
      rig.playerState.yawDegrees = 0;
      rig.playerState.isUsingItem = true;
      Object.assign(rig.playerState.control, { forward: true, sneak: true });

      for (const [posZ, velZ] of ticks) {
        rig.physics.simulate(rig.playerCtx, world);
        expect(rig.playerState.pos.z).toBe(posZ);
        expect(rig.playerState.vel.z).toBe(velZ);
      }
    });
  }
});
