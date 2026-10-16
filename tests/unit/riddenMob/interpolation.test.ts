import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import { createRiddenMobRig } from "../../helpers/unit/riddenMobSupport";

// m_c_mount_click_strider: a strider summoned without AI facing west (yaw 90, pitch 0) at
// (2.5, 101, 3159.5), mounted by a player looking east (yaw 270, pitch 21.057) with a warped fungus on a stick. The
// server's move of it (dX 0) came just before the mount, so the strider is still easing to (2.5, 101, 3159.5) when its
// rider takes control: on 1.21.4 one step of it is gone (2 left), on 1.21.9 none (3 left). The interpolation goes on
// under the rider (LivingEntity.aiStep) and the vehicle move reports its target (Entity.lerpTargetX): on 1.21.4 the
// position only, from 1.21.5 the rotation too, the mob's own move and turn since its last step carried into it
// (InterpolationHandler.interpolate).
const RIDER = { yawDegrees: 270, pitchDegrees: 21.05699920654297 };

function mounted(version: string, steps: number) {
  const world = createFlatWorld(version, 101);
  const rig = createRiddenMobRig({ version, type: "strider", pos: [2.5, 101, 3159.5], vel: [0, 0, 0], yawDegrees: 90, onGround: false });
  rig.state.noAi = true;
  rig.physics.interpolateRidden(rig.state, new Vec3(2.5, 101, 3159.5), steps);
  const tick = () => {
    rig.physics.simulateRidden(rig.ctx, world as any, RIDER);
    return { pos: rig.physics.lerpTargetOf(rig.state), rotation: rig.physics.lerpTargetRotationOf(rig.state), x: rig.state.pos.x };
  };
  return tick;
}

describe("RiddenMobPhysics interpolation under a rider", () => {
  it("steps on to the target and reports it, with the mob's own rotation (1.21.4, ticks 42 and 43)", () => {
    const tick = mounted("1.21.4", 2);
    const first = tick();
    expect(first.x).toBe(2.509624999947846);
    expect(first.pos.x).toBe(2.5);
    expect(first.rotation).toEqual({ yaw: 270, pitch: 10.528499603271484 });
    const second = tick();
    expect(second.x).toBe(2.5183837501528115);
    expect(second.pos.x).toBe(2.5183837501528115);
  });

  it("reports the target's rotation, its own move and turn carried into it (1.21.9, ticks 42 to 44)", () => {
    const tick = mounted("1.21.9", 3);
    const first = tick();
    expect(first.x).toBe(2.509624999947846);
    expect(first.pos.x).toBe(2.5);
    expect(first.rotation).toEqual({ yaw: 90, pitch: 0 });
    const second = tick();
    expect(second.x).toBe(2.5280087501006574);
    expect(second.pos.x).toBe(2.509624999947846);
    expect(second.rotation).toEqual({ yaw: 270, pitch: 10.528499603271484 });
    const third = tick();
    expect(third.pos.x).toBe(third.x);
  });

  // m_c_open_horse_riding (1.21.6): the server's position sync turned the unsaddled horse to yaw -90 while it faced 270;
  // saddled again a tick later, the horse its rider steers reports -90 until the interpolation ends
  it("reports the rotation a sync sent while the interpolation runs (1.21.6, m_c_open_horse_riding tick 51)", () => {
    const world = createFlatWorld("1.21.6", 101);
    const rig = createRiddenMobRig({ version: "1.21.6", type: "horse", pos: [0.5, 101, 2907.5], vel: [0, -0.0784000015258789, 0], yawDegrees: 270 });
    rig.physics.interpolateRidden(rig.state, new Vec3(0.5, 101, 2907.5), 2, { yaw: -90, pitch: 0 });
    rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 0, xxa: 0, zza: 0 });
    expect(rig.physics.lerpTargetRotationOf(rig.state)).toEqual({ yaw: -90, pitch: 0 });
    rig.physics.simulateRidden(rig.ctx, world as any, { yawDegrees: 270, pitchDegrees: 0, xxa: 0, zza: 0 });
    expect(rig.physics.lerpTargetRotationOf(rig.state)).toEqual({ yaw: 270, pitch: 0 });
  });
});
