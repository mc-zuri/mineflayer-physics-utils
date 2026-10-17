import { describe, it } from "mocha";
import expect from "expect";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// 1.21.4's Entity.move counts a fall (checkFallDamage) only for an entity the client does not control: the pig its
// rider steers keeps no fall distance on the 1.21.4 client, as the player does not; 1.21.3 and 1.21.5 count it
describe("RiddenMobPhysics fall distance (Entity.move, 1.21.4)", () => {
  for (const [version, counts] of [["1.21.3", true], ["1.21.4", false], ["1.21.5", true]] as const) {
    it(`a steered pig falling ${counts ? "counts" : "keeps no"} fall distance (${version})`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createRiddenMobRig({ version, type: "pig", pos: [0.5, 110, 0.5], vel: [0, -0.5, 0], yawDegrees: 270, onGround: false });
      rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 0 });
      expect(rig.state.fallDistance > 0).toBe(counts);
    });
  }
});
