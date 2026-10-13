import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Entity.updateFluidOnEyes: from 1.16 isUnderWater is the eye state of the tick before (wasEyeInWater) while in
// water, so a player whose eyes just went under cannot start sprinting in water until the next tick; 1.13 - 1.15
// take the eye state of the tick itself.
// Sprinting forward (yaw 270, east) from rest in a pool of still water, eyes under water, after a tick with the
// eyes out (start isUnderWater false), recorded as b_water_sprint_swim.
const recorded: { version: string; ticks: { sprinting: boolean; vel: [number, number] }[] }[] = [
  { version: "1.13.2", ticks: [{ sprinting: true, vel: [0.017639999741911883, 0] }] },
  {
    version: "1.20.4",
    ticks: [
      { sprinting: false, vel: [0.01568000018835067, -0.005] },
      { sprinting: true, vel: [0.03175199927741287, -0.004000000059604645] },
    ],
  },
  {
    version: "1.21.11",
    ticks: [
      { sprinting: false, vel: [0.01568000018835067, -0.005] },
      { sprinting: true, vel: [0.03175199927741287, -0.004000000059604645] },
    ],
  },
];

describe("Botcraft eyes in water", () => {
  for (const { version, ticks } of recorded) {
    it(`takes the eye state ${version < "1.16" ? "of the tick itself" : "of the tick before"} (${version}, b_water_sprint_swim)`, () => {
      const start = new Vec3(0.5, 99, 1833.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 97);
      for (let x = -2; x <= 2; x++) {
        for (let y = 97; y <= 100; y++) {
          for (let z = 1831; z <= 1835; z++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.water.id);
        }
      }
      rig.playerState.isInWater = true;
      rig.playerState.isUnderWater = false;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;
      rig.playerState.vel.set(0, 0, 0);

      for (const { sprinting, vel } of ticks) {
        rig.physics.simulate(rig.playerCtx, world as any);

        expect(rig.playerState.sprinting).toBe(sprinting);
        expect(rig.playerState.vel.x).toBe(vel[0]);
        expect(rig.playerState.vel.y).toBe(vel[1]);
      }
    });
  }
});
