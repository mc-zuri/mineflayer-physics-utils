import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// f_elytra_rocket_straight_down: gliding straight down (pitch 90, yaw 0) onto the ground at y 101; the look vector
// leaves a z motion far under 1e-7, which the ground's shape drops on the landing tick. Entity.move resets the motion
// of an axis whose move differs at all before 1.18.2 and only by more than Mth.equal's 1e-5F since, and the horizontal
// collision flag is Mth.equal's from 1.14.
function landStraightDown(version: string, pos: [number, number, number], vel: [number, number, number]) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(...pos), groundLevel: 101 });
  const player = rig.playerState;
  player.vel.set(...vel);
  player.onGround = false;
  player.yawDegrees = 0;
  player.yaw = Math.PI; // mineflayer's radians for yaw 0
  player.pitch = -Math.PI / 2;
  player.validElytraEquipped = true;
  player.fallFlying = true;
  player.fireworkRocketDuration = 0;
  rig.physics.simulate(rig.playerCtx, world as any);
  return player;
}

describe("Botcraft collision flags and motion reset", () => {
  it("resets the motion of any move that differs (1.16.5, f_elytra_rocket_straight_down tick 26)", () => {
    const player = landStraightDown("1.16.5", [0.5, 102.54338477364168, 2220.869638710299], [0, -1.8714603313269682, 0]);
    expect(player.pos.y).toBe(101);
    expect(player.isCollidedHorizontally).toBe(false);
    expect(player.vel.z).toBe(0);
  });

  it("keeps the motion of a move within 1e-5 (1.20.4, f_elytra_rocket_straight_down tick 27)", () => {
    const player = landStraightDown(
      "1.20.4",
      [0.5, 102.17204509948797, 2220.944369343927],
      [0, -1.7435219517293232, 2.5931441265052616e-16],
    );
    expect(player.pos.y).toBe(101);
    expect(player.isCollidedHorizontally).toBe(false);
    expect(player.vel.z).toBe(3.104401882528051e-16);
  });
});
