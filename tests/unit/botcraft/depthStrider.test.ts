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

// From 1.21 the boots add 0.33333334 per level to the synced water_movement_efficiency attribute (base 0), which
// travel reads with its modifiers: `f = (float)getAttributeValue(WATER_MOVEMENT_EFFICIENCY)`, then the same float
// arithmetic without the division by 3.
const recordedEfficiency: { version: string; level: number; amount: number; x: number; velX: number }[] = [
  { version: "1.21.1", level: 1, amount: 0.3333333432674408, x: 0.5457333344181379, velX: 0.032714578975383456 },
  { version: "1.21.1", level: 2, amount: 0.6666666865348816, x: 0.5718666725436847, velX: 0.045323919569476886 },
  { version: "1.21.11", level: 2, amount: 0.6666666865348816, x: 0.5718666725436847, velX: 0.045323919569476886 },
  { version: "1.21.11", level: 3, amount: 1, x: 0.5979999960660933, velX: 0.05350800406718223 },
];

function walkInWater(version: string, equip: (rig: ReturnType<typeof createBotcraftPlayerRig>) => void) {
  const start = new Vec3(0.5, 98, 1833.5);
  const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
  const world = createFlatWorld(version, 97);
  for (let bx = -2; bx <= 2; bx++) {
    for (let by = 97; by <= 100; by++) {
      for (let bz = 1831; bz <= 1835; bz++) world.setOverrideBlock(new Vec3(bx, by, bz), rig.mcData.blocksByName.water.id);
    }
  }
  equip(rig);
  rig.playerState.yawDegrees = 270;
  rig.playerState.control.forward = true;
  rig.playerState.vel.set(0, 0, 0);

  rig.physics.simulate(rig.playerCtx, world as any);
  return rig.playerState;
}

describe("Botcraft depth strider", () => {
  for (const { version, level, x, velX } of recorded) {
    it(`speeds water movement by level ${level} in float (${version}, q_depth_strider_${level}_walk_bottom)`, () => {
      const state = walkInWater(version, (rig) => (rig.playerState.depthStrider = level));

      expect(state.pos.x).toBe(x);
      expect(state.vel.x).toBe(velX);
    });
  }

  for (const { version, level, amount, x, velX } of recordedEfficiency) {
    it(`reads level ${level} from the water movement efficiency modifiers (${version}, q_depth_strider_${level}_walk_bottom)`, () => {
      const state = walkInWater(version, (rig) => {
        rig.playerState.attributes[rig.physics.waterMovementEfficiencyAttribute] = {
          value: 0,
          modifiers: [{ uuid: "minecraft:enchantment.depth_strider/feet", amount, operation: 0 }],
        };
      });

      expect(state.pos.x).toBe(x);
      expect(state.vel.x).toBe(velX);
    });
  }
});
