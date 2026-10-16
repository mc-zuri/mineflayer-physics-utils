import { describe, it } from "mocha";
import expect from "expect";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// c_ride_llama_keys_ignored on 1.21.5, the one version whose client steers a llama it rides (it counts the saddle in its
// saddle slot): the llama (MOVEMENT_SPEED 0.175, JUMP_STRENGTH 0.5, 0.9 x 1.87) ridden east (yaw 270) from rest at
// (0.5, 101, 3245.5) on stone, forward and jump held from tick 1 to 30. It walks as a horse on its rider's input of the
// tick before, and jumps the tick after the rider lets go of the jump at 81% (tick 31); a llama never rears
// (Llama.canPerformRearing), so it does not stand up as a horse would on 1.21.5.
function ride(ticks: number) {
  const version = "1.21.5";
  const world = createFlatWorld(version, 101);
  const rig = createRiddenMobRig({ version, type: "llama", pos: [0.5, 101, 3245.5], vel: [0, -0.0784000015258789, 0], yawDegrees: 270 });
  rig.state.jumpStrength = 0.5;
  for (let t = 1; t <= ticks; t++) {
    const zza = t >= 2 && t <= 31 ? 0.9800000190734863 : 0;
    rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 0, xxa: 0, zza });
    if (t === 31) rig.physics.riderJump(rig.state, 81);
  }
  return rig.state;
}

describe("RiddenMobPhysics llama", () => {
  it("walks as a horse at its movement speed (1.21.5, c_ride_llama_keys_ignored tick 2)", () => {
    const llama = ride(2);
    expect(llama.movementSpeed).toBe(0.17499999701976776);
    expect(llama.pos.x).toBe(0.6715000004172325);
    expect(llama.vel.x).toBe(0.09363901110422611);
  });

  it("jumps the tick after its rider lets go, without rearing (1.21.5, c_ride_llama_keys_ignored ticks 32 and 36)", () => {
    const jumped = ride(32);
    expect(jumped.standing).toBe(false);
    expect(jumped.pos.y).toBe(101.37999999523163);
    expect(jumped.vel.y).toBe(0.2940000010490416);
    expect(jumped.vel.x).toBe(0.11261434466055462);
    const later = ride(36);
    expect(later.pos.x).toBe(11.977763734703299);
    expect(later.pos.y).toBe(102.05702870510328);
  });
});
