import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Vanilla moves the input by the float 0.02F in water and in lava (travel: `float f = 0.02F`, moveRelative(0.02F)).
// Since 1.14 getInputVector scales the double input by (double)0.02F, so the step is a hair under 0.0196;
// before 1.14 moveRelative was float arithmetic throughout.
// The first tick of swimming forward (yaw 270, east) from rest in a pool of still fluid, as recorded vanilla clients had it.
const recorded: { version: string; fluid: "water" | "lava"; start: Vec3; x: number; velX: number; recording: string }[] = [
  { version: "1.13.2", fluid: "water", start: new Vec3(4.5, 99, 1833.5), x: 4.519600000232458, velX: 0.015680000419616702, recording: "b_water_swim_f" },
  { version: "1.20.4", fluid: "water", start: new Vec3(4.5, 99, 1833.5), x: 4.519599999943376, velX: 0.01568000018835067, recording: "b_water_swim_f" },
  { version: "1.21.11", fluid: "water", start: new Vec3(4.5, 99, 1833.5), x: 4.519599999943376, velX: 0.01568000018835067, recording: "b_water_swim_f" },
  { version: "1.13.2", fluid: "lava", start: new Vec3(0.5, 99, 1937.5), x: 0.5196000002324581, velX: 0.009800000116229057, recording: "b_lava_swim_forward" },
  { version: "1.20.4", fluid: "lava", start: new Vec3(0.5, 99, 1937.5), x: 0.5195999999433756, velX: 0.00979999997168779, recording: "b_lava_swim_forward" },
  { version: "1.21.11", fluid: "lava", start: new Vec3(0.5, 99, 1937.5), x: 0.5195999999433756, velX: 0.00979999997168779, recording: "b_lava_swim_forward" },
];

describe("Botcraft fluid input speed", () => {
  for (const { version, fluid, start, x, velX, recording } of recorded) {
    it(`moves the input by 0.02F in ${fluid} (${version}, ${recording})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, start.y - 2);
      const fluidId = rig.mcData.blocksByName[fluid].id;
      for (let bx = start.x - 4; bx <= start.x + 4; bx++) {
        for (let by = start.y - 2; by <= start.y + 1; by++) {
          for (let bz = start.z - 4; bz <= start.z + 4; bz++) world.setOverrideBlock(new Vec3(bx, by, bz), fluidId);
        }
      }
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.x).toBe(x);
      expect(rig.playerState.vel.x).toBe(velX);
    });
  }
});
