import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// LivingEntity.aiStep from 1.13 jumps from the ground, not swimming up by 0.04F, when the player stands in water no
// deeper than 0.4 (getFluidJumpThreshold); only deeper water or being off the ground swims up.
// Recorded as b_water_jump_out_on_ledge: standing at y 100.7 (on ground) in source water whose top is 100.8889,
// pressing forward and jump east (yaw 270), first tick.
const recorded: { version: string; x: number; y: number; velY: number }[] = [
  { version: "1.13.2", x: 12.519600000232458, y: 101.11999998688698, velY: 0.3309999945163725 },
  { version: "1.20.4", x: 12.519599999943376, y: 101.11999998688698, velY: 0.3309999945163725 },
  { version: "1.21.11", x: 12.519599999943376, y: 101.11999998688698, velY: 0.3309999945163725 },
];

describe("Botcraft jumping in shallow water", () => {
  for (const { version, x, y, velY } of recorded) {
    it(`jumps from the ground in water up to 0.4 deep (${version}, b_water_jump_out_on_ledge)`, () => {
      const start = new Vec3(12.5, 100.7, 1826.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 98);
      const { water, stone } = rig.mcData.blocksByName;
      for (let z = 1824; z <= 1828; z++) {
        for (let wy = 98; wy <= 100; wy++) {
          for (let wx = 10; wx <= 13; wx++) world.setOverrideBlock(new Vec3(wx, wy, z), water.id);
        }
        for (let wy = 98; wy <= 101; wy++) world.setOverrideBlock(new Vec3(14, wy, z), stone.id);
      }
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.control.jump = true;
      rig.playerState.vel.set(0, 0, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.x).toBe(x);
      expect(rig.playerState.pos.y).toBe(y);
      expect(rig.playerState.vel.y).toBe(velY);
    });
  }
});
