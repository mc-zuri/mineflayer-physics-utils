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

  // c_ride_strider_boost (1.16.5): before 1.19.4 ItemBasedSteering.travel boosts the float steering speed (f += f *
  // 1.15F * sin) and Strider.getSteeringSpeed is MOVEMENT_SPEED, which the client gives no suffocating modifier, * 0.55F,
  // or 0.23F suffocating: the recorded speed at ticks 36 (boost tick 14 of 171, warm) and 37 (15 of 171, off the lava)
  it("boosts its float steering speed, 0.23F of it suffocating (1.16.5, c_ride_strider_boost ticks 36 and 37)", () => {
    const boosted = (suffocating: boolean, boostTime: number) => {
      const rig = createRiddenMobRig({ version: "1.16.5", type: "strider", pos: [0.5, 101, 0.5], vel: [0, -0.0784000015258789, 0], yawDegrees: 270 });
      rig.state.noAi = true;
      rig.state.suffocating = suffocating;
      rig.state.startBoost(171);
      rig.state.boostTime = boostTime;
      rig.physics.simulateRidden(rig.ctx, createFlatWorld("1.16.5", 101) as any, { yawDegrees: 270, pitchDegrees: 0 });
      return rig.state.riddenSpeed;
    };
    expect(boosted(false, 13)).toBe(0.1243988648056984);
    expect(boosted(true, 14)).toBe(0.05284333974123001);
  });

  // c_ride_strider_boost (1.19.3, tick 22): stepping off the lava the strider is in the air for a tick; before 1.19.4
  // Strider.travel sets its speed to its move speed (MOVEMENT_SPEED, not suffocating) before ItemSteerable.travel takes
  // the air speed from it (flyingSpeed = getSpeed() * 0.1F), not the steering speed of the tick before
  it("flies at a tenth of its move speed in the air (1.19.3, c_ride_strider_boost tick 22)", () => {
    const rig = createRiddenMobRig({ version: "1.19.3", type: "strider", pos: [10.828667124307021, 101.01058399925232, 1937.5], vel: [0.08279405312776682, -0.06802768205673218, 0], yawDegrees: 270, onGround: false });
    rig.state.noAi = true;
    rig.state.riddenSpeed = 0.09624999761581421;
    rig.physics.simulateRidden(rig.ctx, createFlatWorld("1.19.3", 101) as any, { yawDegrees: 270, pitchDegrees: 0 });
    expect(rig.state.pos.x).toBe(10.927305296446738);
    expect(rig.state.vel.x).toBe(0.08976073923403174);
  });
});
