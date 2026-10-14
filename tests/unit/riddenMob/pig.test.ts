import { describe, it } from "mocha";
import expect from "expect";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// v_pig_carrot_on_a_stick: a saddled pig ridden east (yaw 270) with a carrot on a stick on the stone at y 100, from
// where the recording starts. Pig.getRiddenInput goes straight on at getRiddenSpeed (MOVEMENT_SPEED 0.25 * 0.225);
// before 1.21.5 the client also damps the mob it rides by 0.98 every tick (LivingEntity.aiStep, !isEffectiveAi).
// Before 1.17 the position is the centre of the box vanilla kept, logged by the recorder.
const CASES = [
  {
    version: "1.12.2",
    start: { pos: [0.8716506525753676, 101, 2173.5], vel: [0.06106414182178433, -0.0784000015258789, 0] },
    box: [0.4216506644962964, 101, 2173.050000011921, 1.3216506406544386, 101.89999997615814, 2173.949999988079],
    tick10: { x: 2.0710261732018305, vx: 0.06605014267158932 },
  },
  {
    version: "1.21.3",
    start: { pos: [0.9919104936705937, 101, 2173.5], vel: [0.06359980499993297, -0.0784000015258789, 0] },
    tick10: { x: 2.1966208424715634, vx: 0.06605503419196455 },
  },
  {
    version: "1.21.11",
    start: { pos: [1.0145765959604338, 101, 2173.5], vel: [0.06484047432160546, -0.0784000015258789, 0] },
    tick10: { x: 2.2473925784678035, vx: 0.0676420815464768 },
  },
] as const;

describe("RiddenMobPhysics pig", () => {
  for (const { version, start, tick10, ...rest } of CASES) {
    it(`goes straight on at the ridden speed (${version}, v_pig_carrot_on_a_stick tick 10)`, () => {
      const world = createFlatWorld(version, 101);
      const box = "box" in rest ? (rest.box as unknown as [number, number, number, number, number, number]) : undefined;
      const rig = createRiddenMobRig({ version, type: "pig", pos: [...start.pos], vel: [...start.vel], yawDegrees: 270, box });
      for (let t = 1; t <= 10; t++) rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 0 });
      expect(rig.state.pos.x).toBe(tick10.x);
      expect(rig.state.vel.x).toBe(tick10.vx);
      expect(rig.state.pos.y).toBe(101);
      expect(rig.state.onGround).toBe(true);
    });
  }
});
