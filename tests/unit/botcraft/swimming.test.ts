import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Swimming came with 1.13 (Entity.updateSwimming): a player sprinting under water starts swimming the tick after
// the sprint starts. Before 1.13 there is no swimming, so nothing steers a sprinting player vertically and it sinks.
// Two ticks of sprinting forward (yaw 270, east) from rest in a pool of still water, recorded as b_water_sprint_swim.
const recorded: { version: string; swimming: boolean; vel: [number, number] }[] = [
  { version: "1.12.2", swimming: false, vel: [0.028224000942230234, -0.03600000023841858] },
  { version: "1.13.2", swimming: true, vel: [0.03351599908906221, 0] },
];

describe("Botcraft swimming", () => {
  for (const { version, swimming, vel } of recorded) {
    it(`swims only from 1.13 (${version}, b_water_sprint_swim)`, () => {
      const start = new Vec3(0.5, 99, 1833.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 97);
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
      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.swimming).toBe(swimming);
      expect(rig.playerState.vel.x).toBe(vel[0]);
      expect(rig.playerState.vel.y).toBe(vel[1]);
    });
  }
});
