import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// j_sneak_fr: sneaking forward and right (yaw 0) on flat ground from (0.5, 101, 38.5). Before tick 4 the server
// echoes the player's crouching pose (set_entity_data); on 1.14 - 1.16 setting the pose from synced data runs
// Entity.refreshDimensions, which refits the kept box on its lower corner although its size is unchanged, so the
// position (the box centre) moves by an ulp from then on. From 1.17 the box follows the position and the call does
// nothing.
const EXPECTED: Record<string, [number, number]> = {
  "1.16.5": [0.2290221918551861, 0.1637354082452381],
  "1.20.4": [0.22902218898974205, 0.16373540525290048],
};

function sneakForwardRight(version: string) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 38.5) });
  rig.playerState.yawDegrees = 0;
  rig.playerState.control.forward = true;
  rig.playerState.control.right = true;
  rig.playerState.control.sneak = true;
  const xs: number[] = [];
  for (let t = 1; t <= 5; t++) {
    if (t === 4) rig.physics.refreshDimensions(rig.playerState);
    rig.physics.simulate(rig.playerCtx, world as any);
    xs.push(rig.playerState.pos.x);
  }
  return xs;
}

describe("Botcraft refreshDimensions", () => {
  for (const version of ["1.16.5", "1.20.4"]) {
    it(`refits the kept box when the pose is synced (${version}, j_sneak_fr ticks 4 and 5)`, () => {
      const xs = sneakForwardRight(version);
      expect(xs[3]).toBe(EXPECTED[version][0]);
      expect(xs[4]).toBe(EXPECTED[version][1]);
    });
  }
});
