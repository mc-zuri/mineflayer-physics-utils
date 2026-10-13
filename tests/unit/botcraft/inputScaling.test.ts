import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 67;

// LivingEntity.applyInput scales the float inputs by 0.98F; recorded vanilla clients hold
// zza = -0.9800000190734863 after a tick of walking backwards (pb_walk_backward) on every version.
const vanillaImpulse = 0.9800000190734863;

function tickWith(version: string, keys: { forward?: boolean; back?: boolean; left?: boolean; right?: boolean }) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 0.5), groundLevel });
  Object.assign(rig.playerState.control, keys);
  rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);
  return rig.playerState.heading;
}

describe("Botcraft input scaling", () => {
  for (const version of ["1.8.8", "1.12.2", "1.21.11"]) {
    describe(version, () => {
      it("scales a held key by 0.98F in float precision", () => {
        expect(tickWith(version, { forward: true }).forward).toBe(vanillaImpulse);
        expect(tickWith(version, { back: true }).forward).toBe(-vanillaImpulse);
        expect(tickWith(version, { left: true }).strafe).toBe(vanillaImpulse);
        expect(tickWith(version, { right: true }).strafe).toBe(-vanillaImpulse);
      });
    });
  }
});
