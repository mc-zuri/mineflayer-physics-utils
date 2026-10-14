import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// v_camel_walk, v_camel_sprint, v_camel_dash: a saddled camel ridden east (yaw 270) from rest at (0.5, 101, 2173.5) on
// stone, a row of stone at x 20. It takes its rider's input of the tick before (the vehicle ticks first: zza 0.98
// while forward is held), MOVEMENT_SPEED 0.09 (+ 0.1F while the rider sprints), and steps 1.5. The rider charges its
// jump from tick 11 and lets go at tick 21 at 90%: the camel dashes the next tick (Camel.executeRidersJump).
const RIDER = { yawDegrees: 270, pitchDegrees: 0 };

function ride(version: string, ticks: number, rider: (t: number) => { zza: number; sprinting?: boolean }, jumpAt?: number) {
  const world = createFlatWorld(version, 101);
  const rig = createRiddenMobRig({ version, type: "camel", pos: [0.5, 101, 2173.5], vel: [0, -0.0784000015258789, 0], yawDegrees: 270 });
  for (let z = 2161; z <= 2185; z++) world.setOverrideBlock(new Vec3(20, 101, z), rig.mcData.blocksByName.stone.id);
  for (let t = 1; t <= ticks; t++) {
    rig.physics.simulateRidden(rig.ctx, world as any, { ...RIDER, xxa: 0, ...rider(t - 1) });
    if (t === jumpAt) rig.physics.riderJump(rig.state, 90);
  }
  return rig.state;
}

const forwardFrom1 = (t: number) => ({ zza: t >= 1 ? 0.9800000190734863 : 0 });

// the recorded camel at each check; 1.20.4 also damps its mount by 0.98 a tick (before 1.21.5)
const EXPECTED = {
  "1.20.4": {
    walk10: { x: 1.9898370433365662, vx: 0.10320928714189949 },
    sprint10: { x: 3.6452113714860763, vx: 0.21788626146298665 },
    dash22: { x: 6.265571666736474, y: 101.52313800340474, vx: 1.1955806159072044, vy: 0.43427525178882775 },
    step: { t: 54, x: 19.26598102713873 },
  },
  "1.21.11": {
    walk10: { x: 2.015824730980999, vx: 0.10561571525953584 },
    sprint10: { x: 3.70007426475583, vx: 0.22296649833459983 },
    dash22: { x: 6.346093959624992, y: 101.52157000337422, vx: 1.1980719376380815, vy: 0.43273861172901323 },
    step: { t: 47, x: 19.33582792832608 },
  },
};

describe("RiddenMobPhysics camel", () => {
  for (const version of ["1.20.4", "1.21.11"] as const) {
    const expected = EXPECTED[version];
    it(`walks at its speed after the rider's input of the tick before (${version}, v_camel_walk tick 10)`, () => {
      const camel = ride(version, 10, forwardFrom1);
      expect(camel.pos.x).toBe(expected.walk10.x);
      expect(camel.vel.x).toBe(expected.walk10.vx);
    });

    it(`goes faster while the rider sprints (${version}, v_camel_sprint tick 10)`, () => {
      const camel = ride(version, 10, (t) => ({ ...forwardFrom1(t), sprinting: t >= 1 }));
      expect(camel.pos.x).toBe(expected.sprint10.x);
      expect(camel.vel.x).toBe(expected.sprint10.vx);
    });

    it(`dashes the tick after the rider lets go of the jump and steps 1.5 (${version}, v_camel_dash)`, () => {
      const dash = ride(version, 22, forwardFrom1, 21);
      expect(dash.pos.x).toBe(expected.dash22.x);
      expect(dash.pos.y).toBe(expected.dash22.y);
      expect(dash.vel.x).toBe(expected.dash22.vx);
      expect(dash.vel.y).toBe(expected.dash22.vy);
      const stepped = ride(version, expected.step.t, forwardFrom1, 21);
      expect(stepped.pos.x).toBe(expected.step.x);
      expect(stepped.pos.y).toBe(102);
    });
  }
});
