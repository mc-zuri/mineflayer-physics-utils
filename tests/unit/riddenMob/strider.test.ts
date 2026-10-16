import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// v_strider_on_lava: a saddled strider ridden east (yaw 270) with a warped fungus on a stick over still lava (y 99 and
// 100, x -5..10) and on to the stone beyond, from where the recording starts. It stands on the lava's lower half
// (LiquidBlock's SHAPE_STABLE for LivingEntity.canStandOnFluid) at y 100.5, goes straight on at MOVEMENT_SPEED * 0.55F,
// and off the lava suffocates: 34% of its base speed less, at 0.35F.
const CASES = [
  {
    version: "1.20.4",
    start: { pos: [0.8751405047688666, 100.5, 1937.5], vel: [0.08918944062723595, -0.0784000015258789, 0] },
    tick10: { x: 2.8952210018706555, vx: 0.1129897232757167 },
    tick52: { x: 11.120984157646845, vx: 0.052855234962880936 },
  },
  {
    version: "1.21.11",
    start: { pos: [0.7148029706227044, 100.5, 1937.5], vel: [0.06925064745860512, -0.0784000015258789, 0] },
    tick10: { x: 2.7326571993314204, vx: 0.11564493175397741 },
    tick52: { x: 11.15932996664043, vx: 0.054594078687730016 },
  },
  // 26.1 looks at lava again after the move (LivingEntity.checkFallDamage), but not for a strider already in lava
  // (Strider.checkFallDamage): stepping onto the stone at tick 47 it still floats up out of the lava it starts in
  {
    version: "26.1",
    start: { pos: [0.8364921539914629, 100.5, 1937.5], vel: [0.08839569507498411, -0.0784000015258789, 0] },
    tick10: { x: 2.896416801948984, vx: 0.1156900116994773 },
    tick52: { x: 11.323188864305992, vx: 0.054594078687730356 },
  },
] as const;

function lavaPool(version: string, lavaType: number) {
  const world = createFlatWorld(version, 101);
  for (let x = -5; x <= 10; x++) {
    for (let z = 1927; z <= 1947; z++) {
      world.setOverrideBlock(new Vec3(x, 99, z), lavaType);
      world.setOverrideBlock(new Vec3(x, 100, z), lavaType);
    }
  }
  return world;
}

describe("RiddenMobPhysics strider", () => {
  for (const { version, start, tick10, tick52 } of CASES) {
    it(`walks on lava, then slower off it (${version}, v_strider_on_lava ticks 10 and 52)`, () => {
      const rig = createRiddenMobRig({ version, type: "strider", pos: [...start.pos], vel: [...start.vel], yawDegrees: 270 });
      const world = lavaPool(version, rig.mcData.blocksByName.lava.id);
      for (let t = 1; t <= 52; t++) {
        rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 0 });
        if (t === 10) {
          expect(rig.state.pos.y).toBe(100.5);
          expect(rig.state.pos.x).toBe(tick10.x);
          expect(rig.state.vel.x).toBe(tick10.vx);
        }
      }
      expect(rig.state.pos.y).toBe(101);
      expect(rig.state.pos.x).toBe(tick52.x);
      expect(rig.state.vel.x).toBe(tick52.vx);
    });
  }

  // Strider.tick sets DATA_SUFFOCATING from the warm blocks only when !isNoAi(): a strider without AI keeps what the
  // server synced, and getRiddenSpeed follows that (MOVEMENT_SPEED * 0.55F, or less 34% of the base * 0.35F).
  const f32 = Math.fround;
  const SPEED = 0.17499999701976776;
  for (const version of ["1.21.11", "26.3"]) {
    it(`keeps the suffocating the server synced without AI (${version}, Strider.tick isNoAi)`, () => {
      const onStone = () => createRiddenMobRig({ version, type: "strider", pos: [0.5, 101, 0.5], vel: [0, -0.0784000015258789, 0], yawDegrees: 270 });
      const stone = createFlatWorld(version, 101);
      // with AI, off the warm blocks it suffocates
      const ai = onStone();
      ai.physics.simulateRidden(ai.ctx, stone as any, { yawDegrees: 270, pitchDegrees: 0 });
      expect(ai.state.suffocating).toBe(true);
      expect(ai.state.riddenSpeed).toBe(f32((SPEED + SPEED * -0.3400000035762787) * f32(0.35)));
      // without AI, it stays as synced (not suffocating) on stone ...
      const noAi = onStone();
      noAi.state.noAi = true;
      noAi.physics.simulateRidden(noAi.ctx, stone as any, { yawDegrees: 270, pitchDegrees: 0 });
      expect(noAi.state.suffocating).toBe(false);
      expect(noAi.state.riddenSpeed).toBe(f32(SPEED * f32(0.55)));
      // ... and suffocating on lava
      const onLava = createRiddenMobRig({ version, type: "strider", pos: [0.5, 100.5, 1937.5], vel: [0, -0.0784000015258789, 0], yawDegrees: 270 });
      onLava.state.noAi = true;
      onLava.state.suffocating = true;
      onLava.physics.simulateRidden(onLava.ctx, lavaPool(version, onLava.mcData.blocksByName.lava.id) as any, { yawDegrees: 270, pitchDegrees: 0 });
      expect(onLava.state.suffocating).toBe(true);
    });
  }
});
