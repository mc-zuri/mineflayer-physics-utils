import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// 1.21.4's Entity.move runs checkFallDamage only for an entity the client does not control (isControlledByClient): the
// player's fall distance stays 0 on the client, so powder snow never takes it for a fall (PowderSnowBlock's falling
// shape needs fallDistance > 2.5) and it falls into the snow. 1.21.3 and 1.21.5 count the fall and land on the snow's
// 0.9 high falling shape.
// Recorded as b_land_3_powder_snow, ticks 7 - 10: falling from y 102.85 (tick 6) onto powder snow topped at y 101.
const recorded: Record<string, { fallDistance: number; ticks: [number, number][] }> = {
  "1.21.3": {
    fallDistance: 1.1451066732406616,
    ticks: [
      [102.40739540236494, -0.5169479491049732],
      [101.89044745325997, -0.5850090015087522],
      [101.30543845175121, -0.6517088341626173],
      [100.89999997615814, -0.0784000015258789],
    ],
  },
  "1.21.4": {
    fallDistance: 0,
    ticks: [
      [102.40739540236494, -0.5169479491049732],
      [101.89044745325997, -0.5850090015087522],
      [101.30543845175121, -0.6517088341626173],
      [100.6537296175886, -0.7170746714356033],
    ],
  },
};

describe("Botcraft falling on powder snow in 1.21.4", () => {
  for (const [version, { fallDistance, ticks }] of Object.entries(recorded)) {
    it(`${version === "1.21.4" ? "falls into" : "lands on"} the powder snow (${version}, b_land_3_powder_snow)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(4.5, 102.85489329934836, 1557.5), groundLevel: 99 });
      const world = createFlatWorld(version, 99);
      for (let x = 3; x <= 5; x++) {
        for (let z = 1556; z <= 1558; z++) {
          for (let y = 99; y <= 100; y++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.powder_snow.id);
        }
      }
      const state = rig.playerState;
      state.vel.set(0, -0.44749789698341763, 0);
      state.onGround = false;
      state.fallDistance = fallDistance;

      for (const [y, velY] of ticks) {
        rig.physics.simulate(rig.playerCtx, world as any);
        expect(state.pos.y).toBe(y);
        expect(state.vel.y).toBe(velY);
      }
      // (the client keeps no fall distance in 1.21.4)
      if (version === "1.21.4") expect(state.fallDistance).toBe(0);
    });
  }
});
