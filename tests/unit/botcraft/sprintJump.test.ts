import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// pb_sprint_jump_yaw_rotate, tick 17: a vanilla client sprinting on stone at yaw 210 jumps. LivingEntity.jumpFromGround
// adds Mth.sin/cos of the float yaw (yaw * 0.017453292F) times 0.2: times 0.2F in float before 1.20.5, times 0.2 in
// double since.
describe("Botcraft sprint jump", () => {
  for (const { version, start, pos, vel } of [
    {
      version: "1.20.4",
      start: { z: 39.82593815338772, velZ: -0.1246441611883294 },
      pos: [-0.44325291023730873, 101.41999998688698, 39.41775203049908],
      vel: [0.10592104207133043, 0.33319999363422365, -0.22286964898409198],
    },
    {
      version: "1.20.6",
      start: { z: 39.82593813757718, velZ: -0.12464416123957645 },
      pos: [-0.44325291321754096, 101.41999998688698, 39.417752023578],
      vel: [0.10592104044412345, 0.33319999363422365, -0.22286964413045193],
    },
  ]) {
    it(`adds the sprint boost by the float yaw as vanilla does (${version})`, () => {
      const rig = createBotcraftPlayerRig({
        version,
        position: new Vec3(-0.6372474702525525, groundLevel, start.z),
        groundLevel,
      });
      rig.playerState.vel.set(0.03030361534395634, -0.0784000015258789, start.velZ);
      rig.physics.setSprinting(rig.playerCtx, true); // (with its speed modifier)
      rig.playerState.yawDegrees = 210;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = true;
      rig.playerState.control.jump = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      const { pos: p, vel: v } = rig.playerState;
      [p.x, p.y, p.z].forEach((value, i) => expect(value).toBe(pos[i]));
      [v.x, v.y, v.z].forEach((value, i) => expect(value).toBe(vel[i]));
    });
  }
});
