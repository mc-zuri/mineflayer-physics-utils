import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// The motion after the first tick of walking forward on stone from rest, as recorded vanilla clients had it.
// Vanilla turns the input by Mth.sin/cos of the float yaw, whole turns kept (765 is not 45). The table and its
// index changed in 1.21.11 (yaw -45 differs from 1.21.10), and before 1.14 moveRelative is float arithmetic.
const recorded: { version: string; yaw: number; vel: [number, number]; recording: string }[] = [
  { version: "1.12.2", yaw: 37.5, vel: [-0.03257089314439754, 0.04245283374062714], recording: "j_walk_yaw_37_5" },
  { version: "1.12.2", yaw: 765, vel: [-0.037832245244048046, 0.03783949851921209], recording: "j_walk_yaw_765" },
  { version: "1.12.2", yaw: -1000, vel: [-0.05269549154869546, 0.00928932198001542], recording: "j_walk_yaw_neg_1000" },
  { version: "1.21.9", yaw: 37.5, vel: [-0.032570897371626, 0.04245283842134214], recording: "j_walk_yaw_37_5" },
  { version: "1.21.9", yaw: 765, vel: [-0.03783224843167181, 0.03783950414789568], recording: "j_walk_yaw_765" },
  { version: "1.21.9", yaw: -45, vel: [0.03783587469512084, 0.03783587469512084], recording: "b_cobweb_walk_in_diagonal" },
  { version: "1.21.11", yaw: -45, vel: [0.03783587469512084, 0.03783224843167181], recording: "b_cobweb_walk_in_diagonal" },
  { version: "1.21.11", yaw: -1000, vel: [-0.052695498599124896, 0.009289322852483172], recording: "j_walk_yaw_neg_1000" },
];

describe("Botcraft moveRelative", () => {
  for (const { version, yaw, vel, recording } of recorded) {
    it(`turns the input by the float yaw ${yaw} as vanilla (${version}, ${recording})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
      rig.playerState.yawDegrees = yaw;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.vel.x).toBe(vel[0]);
      expect(rig.playerState.vel.z).toBe(vel[1]);
    });
  }

  it("leaves no motion across the walking axis (strafing left facing south)", () => {
    const version = "1.21.11";
    const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
    rig.playerState.yawDegrees = 0;
    rig.playerState.control.left = true;

    rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

    // j_walk_l: vanilla moves at x = 0.053508008053839436 and exactly 0 along z
    expect(rig.playerState.vel.x).toBe(0.053508008053839436);
    expect(rig.playerState.vel.z).toBe(0);
  });
});
