import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Holding sneak in water sinks the player by 0.04F each tick (LocalPlayer.goDownInWater) since 1.13; before 1.13
// sneaking does nothing to the vertical motion in water.
// The first tick of holding sneak at rest in a pool of still water, recorded as b_water_sneak_sink.
const recorded: { version: string; y: number; velY: number }[] = [
  { version: "1.12.2", y: 100, velY: -0.02 },
  { version: "1.13.2", y: 99.96000000089407, velY: -0.03699999976158141 },
];

describe("Botcraft sneaking in water", () => {
  for (const { version, y, velY } of recorded) {
    it(`sinks by 0.04F only from 1.13 (${version}, b_water_sneak_sink)`, () => {
      const start = new Vec3(4.5, 100, 1833.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 98);
      for (let x = 2; x <= 6; x++) {
        for (let wy = 98; wy <= 100; wy++) {
          for (let z = 1831; z <= 1835; z++) world.setOverrideBlock(new Vec3(x, wy, z), rig.mcData.blocksByName.water.id);
        }
      }
      rig.playerState.control.sneak = true;
      rig.playerState.vel.set(0, 0, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(y);
      expect(rig.playerState.vel.y).toBe(velY);
    });
  }
});
