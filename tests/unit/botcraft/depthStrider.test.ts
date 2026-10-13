import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// LivingEntity.travel before 1.21, in float: `f2 = min(depthStrider, 3)`, halved off the ground, then
// `slowDown += (0.54600006F - slowDown) * f2 / 3.0F` and `speed += (getSpeed() - speed) * f2 / 3.0F`,
// divided by 3 after the multiplication.
// The first tick of walking forward (yaw 270, east) from rest in still water wearing depth strider boots, recorded
// as q_depth_strider_<level>_walk_bottom.
const recorded: { version: string; level: number; x: number; velX: number }[] = [
  { version: "1.12.2", level: 1, x: 0.5457333326339722, velX: 0.03271457769911024 },
  { version: "1.12.2", level: 2, x: 0.5718666687607765, velX: 0.04532391718372253 },
  { version: "1.12.2", level: 3, x: 0.5979999974370003, velX: 0.05350800481569751 },
  { version: "1.20.4", level: 1, x: 0.5457333344181379, velX: 0.032714578975383456 },
  { version: "1.20.4", level: 2, x: 0.5718666652421156, velX: 0.04532391496462014 },
  { version: "1.20.4", level: 3, x: 0.5979999960660933, velX: 0.05350800406718223 },
];

describe("Botcraft depth strider", () => {
  for (const { version, level, x, velX } of recorded) {
    it(`speeds water movement by level ${level} in float (${version}, q_depth_strider_${level}_walk_bottom)`, () => {
      const start = new Vec3(0.5, 98, 1833.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 97);
      for (let bx = -2; bx <= 2; bx++) {
        for (let by = 97; by <= 100; by++) {
          for (let bz = 1831; bz <= 1835; bz++) world.setOverrideBlock(new Vec3(bx, by, bz), rig.mcData.blocksByName.water.id);
        }
      }
      rig.playerState.depthStrider = level;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.vel.set(0, 0, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.x).toBe(x);
      expect(rig.playerState.vel.x).toBe(velX);
    });
  }
});
