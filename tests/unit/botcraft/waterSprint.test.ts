import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Sprinting changes water movement only since 1.13's sprint swimming: LivingEntity.travel takes the slowdown
// `isSprinting() ? 0.9F : getWaterSlowDown()` and skips the sinking while sprinting. Before 1.13 the slowdown is
// always 0.8F and the player sinks by 0.02 whether sprinting or not.
// The first tick of sprinting forward (yaw 270, east) from rest in a pool of still water, recorded as b_water_sprint_swim.
const recorded: { version: string; vel: [number, number] }[] = [
  { version: "1.12.2", vel: [0.015680000419616702, -0.02] },
  { version: "1.13.2", vel: [0.017639999741911883, 0] },
];

describe("Botcraft sprinting in water", () => {
  for (const { version, vel } of recorded) {
    it(`sprint swims only from 1.13 (${version}, b_water_sprint_swim)`, () => {
      const start = new Vec3(0.5, 99, 1833.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, start.y - 2);
      for (let x = -2; x <= 2; x++) {
        for (let y = 97; y <= 100; y++) {
          for (let z = 1831; z <= 1835; z++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.water.id);
        }
      }
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;
      rig.playerState.vel.set(0, 0, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.sprinting).toBe(true);
      expect(rig.playerState.vel.x).toBe(vel[0]);
      expect(rig.playerState.vel.y).toBe(vel[1]);
    });
  }
});
