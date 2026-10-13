import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// b_water_jump_out_sprint, tick 10: a vanilla client swimming east out of a water pool (y 99 - 100) with forward,
// jump and sprint held starts to sprint as it leaves the water. Before 1.19.4 Player.aiStep sets the air speed after
// travel, so this tick still moves by the 0.02F of the tick before; since 1.19.4 Player.getFlyingSpeed reads the
// sprint of the tick itself (0.025999999F).
describe("Botcraft air speed sprint timing", () => {
  for (const { version, start, x, velX } of [
    {
      version: "1.13.2",
      start: { x: 11.042613369923453, velX: 0.06787733457588781 },
      x: 11.1300907047318,
      velX: 0.07960437696977919,
    },
    {
      version: "1.20.4",
      start: { x: 11.042613361920388, velX: 0.06787733357475761 },
      x: 11.135970694691377,
      velX: 0.08495517526999344,
    },
  ]) {
    it(`moves by the air speed of each version's sprint timing (${version})`, () => {
      const rig = createBotcraftPlayerRig({
        version,
        position: new Vec3(start.x, 100.99059696768838, 1826.5),
        groundLevel: 99,
      });
      const world = createFlatWorld(version, 99);
      for (let x = 8; x <= 13; x++) {
        for (let y = 99; y <= 100; y++) {
          for (let z = 1825; z <= 1827; z++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.water.id);
        }
      }
      rig.playerState.vel.set(start.velX, 0.11688061022453416, 0);
      rig.playerState.isInWater = true;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.control.jump = true;
      rig.playerState.control.sprint = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.sprinting).toBe(true);
      expect(rig.playerState.pos.x).toBe(x);
      expect(rig.playerState.vel.x).toBe(velX);
    });
  }
});
