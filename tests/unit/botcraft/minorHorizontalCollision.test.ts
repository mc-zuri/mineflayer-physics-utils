import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

type Vec = [number, number, number];

// LocalPlayer.isHorizontalCollisionMinor (1.18+): after a horizontal collision, the collided movement turned less
// than 8 degrees (Math.acos) from the input (xxa, zza turned by Mth.sin/cos of the float yaw). A sprint that only
// grazes a wall goes on.
//   g_wall_sprint_5deg, tick 27: sprinting at yaw 275 into the wall at x 16, the move cut short along the input: minor.
//   g_wall_inner_corner, tick 16: walking at yaw 45 into an inner corner, cut short on both axes exactly along the
//   input; the cosine rounds above 1, Math.acos gives NaN, so not minor.
const recorded: {
  name: string;
  yaw: number;
  sprint: boolean;
  walls: Vec[];
  pos: Vec;
  vel: Vec;
  nextPos: Vec;
  nextVel: Vec;
  minor: boolean;
}[] = [
  {
    name: "g_wall_sprint_5deg",
    yaw: 275,
    sprint: true,
    walls: [16, 17, 18, 19, 20].flatMap((z): Vec[] => [[16, 101, 1700 + z], [16, 102, 1700 + z]]),
    pos: [15.432088658155235, 101, 1718.1063303382882],
    vel: [0.15263402213444235, -0.0784000015258789, 0.01335046951055333],
    nextPos: [15.699999988079071, 101, 1718.1307817464387],
    nextVel: [0, -0.0784000015258789, 0.013350470400906722],
    minor: true,
  },
  {
    name: "g_wall_inner_corner",
    yaw: 45,
    sprint: false,
    walls: [
      ...[1708, 1709, 1710, 1711].flatMap((z): Vec[] => [[5, 101, z], [5, 102, z]]),
      ...[6, 7, 8].flatMap((x): Vec[] => [[x, 101, 1711], [x, 102, 1711]]),
    ],
    pos: [6.394013878039246, 101, 1710.6059861219605],
    vel: [-0.08332942046437326, -0.0784000015258789, 0.08332942046437326],
    nextPos: [6.300000011920929, 101, 1710.699999988079],
    nextVel: [0, -0.0784000015258789, 0],
    minor: false,
  },
];

describe("Botcraft minor horizontal collision", () => {
  for (const version of ["1.20.4", "1.21.11"]) {
    for (const { name, yaw, sprint, walls, pos, vel, nextPos, nextVel, minor } of recorded) {
      it(`is ${minor ? "" : "not "}minor as vanilla (${version}, ${name})`, () => {
        const rig = createBotcraftPlayerRig({ version, position: new Vec3(...pos), groundLevel });
        const world = createFlatWorld(version, groundLevel);
        for (const wall of walls) world.setOverrideBlock(new Vec3(...wall), rig.mcData.blocksByName.stone.id);
        const state = rig.playerState;
        state.vel = new Vec3(...vel);
        state.onGround = true;
        state.yawDegrees = yaw;
        state.sprinting = sprint;
        state.control.forward = true;
        state.control.sprint = sprint;

        rig.physics.simulate(rig.playerCtx, world as any);

        expect(state.isCollidedHorizontally).toBe(true);
        expect(state.isCollidedHorizontallyMinor).toBe(minor);
        expect(state.pos.x).toBe(nextPos[0]);
        expect(state.pos.z).toBe(nextPos[2]);
        expect(state.vel.x).toBe(nextVel[0]);
        expect(state.vel.z).toBe(nextVel[2]);
      });
    }
  }
});
