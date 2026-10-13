import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Dolphin's Grace sets the water slowdown to the float 0.96F (LivingEntity.travel, 1.13+).
// The first tick of swimming forward (yaw 270, east) from rest in still water with Dolphin's Grace, recorded as
// e_dolphins_grace_swim.
const recorded: { version: string; velX: number }[] = [
  { version: "1.13.2", velX: 0.01881599980258941 },
  { version: "1.21.11", velX: 0.018815999525070185 },
];

describe("Botcraft Dolphin's Grace", () => {
  for (const { version, velX } of recorded) {
    it(`slows water movement by 0.96F (${version}, e_dolphins_grace_swim)`, () => {
      const start = new Vec3(0.5, 99, 1833.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 97);
      for (let x = -2; x <= 2; x++) {
        for (let y = 97; y <= 100; y++) {
          for (let z = 1831; z <= 1835; z++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.water.id);
        }
      }
      rig.playerState.dolphinsGrace = 1;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.vel.set(0, 0, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.vel.x).toBe(velX);
      expect(rig.playerState.vel.y).toBe(-0.005);
    });
  }
});
