import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;
const f32 = Math.fround;

// LivingEntity.travel keeps the horizontal motion by a float: f * 0.91F on a block of friction f, 0.91F in the air.
function coast(version: string, y: number, velocityX: number) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, y, 0.5), groundLevel });
  rig.playerState.vel.set(velocityX, 0, 0);
  rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);
  return rig.playerState.vel.x;
}

describe("Botcraft inertia", () => {
  for (const version of ["1.8.8", "1.12.2", "1.21.11"]) {
    describe(version, () => {
      it("keeps f * 0.91F of the motion on stone", () => {
        expect(coast(version, groundLevel, 0.2)).toBe(0.2 * f32(f32(0.6) * f32(0.91)));
      });

      it("keeps 0.91F of the motion in the air", () => {
        expect(coast(version, groundLevel + 10, 0.2)).toBe(0.2 * f32(0.91));
      });
    });
  }

  // pb_walk_backward: after the first tick of walking backwards on stone, facing south, vanilla moves at
  // z = -0.053508008053839436 on 1.14.4 - 1.21.11.
  for (const version of ["1.14.4", "1.20.4", "1.21.11"]) {
    it(`slows the first step on stone as vanilla (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      rig.playerState.yaw = Math.PI; // vanilla yaw 0
      rig.playerState.control.back = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.vel.z).toBe(-0.053508008053839436);
    });
  }
});
