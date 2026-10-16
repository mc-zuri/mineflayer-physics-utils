import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// c_ride_nautilus_forward, c_ride_nautilus_dash, c_ride_nautilus_up_look: a saddled nautilus (1.21.11+) ridden east
// (rider yaw 270, the nautilus -90) from rest at (0.5, 97, 3301.5) under water. It takes its rider's input of the tick
// before (the vehicle ticks first). AbstractNautilus.getRiddenInput goes along the rider's pitch (cos forward, -sin up);
// travelInWater moves at 0.0325F * MOVEMENT_SPEED (1) and keeps 0.9 of the motion, without gravity; tickRidden takes
// half the rider's pitch; a released jump dashes along the rider's look the next tick (executeRidersJump: 1.2F * the
// charge in water, 0.4 for a jump let go at once). The numbers are the recorded vanilla nautilus's, the same in 1.21.11,
// 26.1 and 26.3.
const FORWARD = 0.9800000190734863;

function ride(version: string, ticks: number, rider: (t: number) => { zza: number; pitchDegrees?: number }, jumpAfter?: number) {
  const world = createFlatWorld(version, 95);
  const rig = createRiddenMobRig({ version, type: "nautilus", pos: [0.5, 97, 3301.5], vel: [0, 0, 0], yawDegrees: -90, onGround: false });
  for (let x = -2; x <= 8; x++) {
    for (let y = 95; y <= 99; y++) {
      for (let z = 3299; z <= 3304; z++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.water.id);
    }
  }
  for (let t = 1; t <= ticks; t++) {
    rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 0, xxa: 0, ...rider(t) });
    if (t === jumpAfter) rig.physics.riderJump(rig.state, 0);
  }
  return rig.state;
}

// forward held from the rider's tick 1: the nautilus moves from its tick 2
const forwardFrom2 = (t: number) => ({ zza: t >= 2 ? FORWARD : 0 });

describe("RiddenMobPhysics nautilus", () => {
  for (const version of ["1.21.11", "26.1", "26.3"]) {
    it(`swims forward at 0.0325F a tick, keeping 0.9 of its motion (${version}, c_ride_nautilus_forward t2-t4)`, () => {
      const t2 = ride(version, 2, forwardFrom2);
      expect([t2.pos.x, t2.vel.x]).toEqual([0.5324999988079071, 0.029249998927116393]);
      const t4 = ride(version, 4, forwardFrom2);
      expect([t4.pos.x, t4.pos.y, t4.pos.z]).toEqual([0.682324993312359, 97, 3301.5]);
      expect([t4.vel.x, t4.vel.y]).toEqual([0.07926749709248544, 0]);
    });

    it(`swims up along its rider's look and takes half its pitch (${version}, c_ride_nautilus_up_look t1, t4)`, () => {
      // the rider looks 40 degrees up from tick 1 and holds forward from tick 3
      const look = (t: number) => ({ pitchDegrees: -40, zza: t >= 4 ? FORWARD : 0 });
      const t1 = ride(version, 1, look);
      expect([t1.pos.x, t1.pos.y, t1.pitchDegrees]).toEqual([0.5, 97, -20]);
      const t4 = ride(version, 4, look);
      expect([t4.pos.x, t4.pos.y]).toEqual([0.5248959977733723, 97.02088873965414]);
      expect([t4.vel.x, t4.vel.y]).toEqual([0.022406397996035034, 0.018799865688732355]);
    });

    it(`dashes along its rider's look the tick after the jump is let go (${version}, c_ride_nautilus_dash t13-t14)`, () => {
      // the rider presses jump at tick 11 and lets go at tick 12
      const t13 = ride(version, 13, forwardFrom2, 12);
      expect([t13.pos.x, t13.pos.y, t13.pos.z]).toEqual([2.781106347216223, 97, 3301.5]);
      expect(t13.vel.x).toBe(0.6418893700467494);
      expect(t13.dashing).toBe(true);
      const t14 = ride(version, 14, forwardFrom2, 12);
      expect([t14.pos.x, t14.vel.x]).toEqual([3.45549571607088, 0.6069504319691909]);
    });
  }
});
