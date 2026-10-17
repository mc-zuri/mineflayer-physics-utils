import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import type { NearbyEntity } from "../../../src/physics/states";

// Boats and shulkers are solid like blocks (Level.getEntityCollisions). The recorder's "n_fall_onto_boat": the
// player falls from y 106 onto a boat floating on nothing at y 101 (x 0.5, z 38.5) and lands on its top, 0.5625 up.
function fallOnto(version: string, name: string, boundingBox: AABB) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101.936654946153, 38.5), groundLevel: 101 });
  rig.playerState.vel.set(0, -0.7811331932098841, 0);
  rig.playerState.onGround = false;
  rig.playerState.yawDegrees = 270;
  rig.playerState.nearbyEntities = [{ name, living: false, position: new Vec3(0.5, 101, 38.5), boundingBox }];

  rig.physics.simulate(rig.playerCtx, world as any);

  return rig.playerState;
}

describe("Botcraft entity collision", () => {
  const boatBox = new AABB(-0.1875, 101, 37.8125, 1.1875, 101.5625, 39.1875);

  for (const [version, name] of [["1.12.2", "boat"], ["1.13.2", "boat"], ["1.20.4", "boat"], ["1.21.11", "oak_boat"]]) {
    it(`lands on a boat (${version}, n_fall_onto_boat)`, () => {
      const player = fallOnto(version, name, boatBox);
      expect(player.pos.y).toBe(101.5625);
      expect(player.vel.y).toBe(-0.0784000015258789);
      expect(player.onGround).toBe(true);
    });
  }

  // n_stand_on_shulker: standing still on a shulker (no AI) at x 2.5, y 101, z 38.5.
  for (const version of ["1.12.2", "1.21.11"]) {
    it(`stands on a shulker (${version}, n_stand_on_shulker)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(2.5, 102, 38.5) });
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      rig.playerState.onGround = true;
      rig.playerState.nearbyEntities = [
        { name: "shulker", living: true, position: new Vec3(2.5, 101, 38.5), boundingBox: new AABB(2, 101, 38, 3, 102, 39) },
      ];

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(102);
      expect(rig.playerState.vel.y).toBe(-0.0784000015258789);
      expect(rig.playerState.onGround).toBe(true);
    });
  }

  // 1.14 - 1.16 tick an entity whose slot comes after the player's first (Int2ObjectOpenHashMap): the player moves
  // against it where its tick left it (afterTick), here a shulker moved 0.003 out of the way (as the boat pushed before
  // the player's move in n_walk_into_boat on 1.15.2, tick 11); before 1.14 (the player first) it stops at its box (its float half width)
  for (const [version, x] of [["1.15.2", 2.514], ["1.12.2", 2.512499988079071]] as const) {
    it(`meets an entity ticked before it where its tick left it (${version})`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(2.5, 101, 38.5) });
      rig.playerState.vel.set(0.014, -0.0784000015258789, 0);
      rig.playerState.onGround = true;
      const at = (minX: number) => new AABB(minX, 101, 38, minX + 1, 102, 39);
      rig.playerState.nearbyEntities = [{
        name: "shulker", living: true, position: new Vec3(3.3125, 101, 38.5), boundingBox: at(2.8125),
        ticksBeforePlayer: version === "1.15.2", afterTick: { position: new Vec3(3.315478515625, 101, 38.5), boundingBox: at(2.815478515625) },
      }];

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.x).toBe(x);
    });
  }

  // A grown happy ghast (1.21.6+, HappyGhast.canBeCollidedWith) is solid on its still timeout, and on the client to a
  // player whose feet are at or above its top. A player's packet log on 26.3: getting off the ghast at 126.998,
  // 65.191, 166.449 (4 by 4), the server put the rider on its top, y 69.19112078830571; the client fell into the ghast
  // and the server put it back, every tick it moved.
  const ghastAt = new Vec3(126.99812078563461, 65.19112078830571, 166.44904435881574);
  const ghast = (extra: Partial<NearbyEntity> = {}): NearbyEntity => ({
    name: "happy_ghast", living: true, position: ghastAt.clone(),
    boundingBox: new AABB(ghastAt.x - 2, ghastAt.y, ghastAt.z - 2, ghastAt.x + 2, ghastAt.y + 4, ghastAt.z + 2), ...extra,
  });
  function onGhast(version: string, position: Vec3, entity: NearbyEntity, ticks = 3, forward = false) {
    const world = createFlatWorld(version, 0);
    const rig = createBotcraftPlayerRig({ version, position, groundLevel: 0 });
    rig.playerState.vel.set(0, -0.0784000015258789, 0);
    rig.playerState.onGround = false;
    rig.playerState.yawDegrees = 270; // facing +x
    rig.playerState.nearbyEntities = [entity];
    rig.playerState.control.forward = forward;
    for (let i = 0; i < ticks; i++) rig.physics.simulate(rig.playerCtx, world as never);
    return rig.playerState;
  }

  for (const version of ["1.21.6", "1.21.11", "26.3"]) {
    it(`stands on the happy ghast it got off (${version})`, () => {
      const player = onGhast(version, new Vec3(ghastAt.x, ghastAt.y + 4, ghastAt.z), ghast({ staysStill: true }));
      expect(player.pos.y).toBe(69.19112078830571);
      expect(player.onGround).toBe(true);
      expect(player.vel.y).toBe(-0.0784000015258789);
    });

    it(`stands on the top of a happy ghast that is not on its still timeout (${version})`, () => {
      const player = onGhast(version, new Vec3(ghastAt.x, ghastAt.y + 4, ghastAt.z), ghast({ staysStill: false }));
      expect(player.pos.y).toBe(69.19112078830571);
      expect(player.onGround).toBe(true);
    });
  }

  it("falls through a baby happy ghast", () => {
    const player = onGhast("26.3", new Vec3(ghastAt.x, ghastAt.y + 4, ghastAt.z), ghast({ baby: true, staysStill: true }));
    expect(player.pos.y).toBeLessThan(69.19112078830571);
    expect(player.onGround).toBe(false);
  });

  // from the side, below its top: solid only on its still timeout
  it("walks into the side of a happy ghast only while it stays still", () => {
    // the ghast on the ground at x 3 - 7, the player walking east from x 2.5
    const walkInto = (staysStill: boolean) => {
      const world = createFlatWorld("26.3", 101);
      const rig = createBotcraftPlayerRig({ version: "26.3", position: new Vec3(2.5, 101, 38.5), groundLevel: 101 });
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      rig.playerState.onGround = true;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.nearbyEntities = [{
        name: "happy_ghast", living: true, staysStill, position: new Vec3(5, 101, 38.5), boundingBox: new AABB(3, 101, 36.5, 7, 105, 40.5),
      }];
      for (let i = 0; i < 10; i++) rig.physics.simulate(rig.playerCtx, world as never);
      return rig.playerState;
    };
    expect(walkInto(true).pos.x).toBe(3 - 0.30000001192092896); // against its side, half the float player width off
    expect(walkInto(false).pos.x).toBeGreaterThan(2.7);
  });

  it("falls through an entity that is not solid, such as a cow", () => {
    const player = fallOnto("1.21.11", "cow", boatBox);
    expect(player.pos.y).toBeLessThan(101.5625);
    expect(player.onGround).toBe(false);
  });
});
