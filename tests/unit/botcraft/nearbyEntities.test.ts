import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig } from "../../helpers/unit/botcraftTestSupport";

// PlayerState.update takes the bot's other entities near it, each box built as EntityDimensions.makeBoundingBox does
// from the position and the float dimensions. The boxes are the vanilla client's in the recorder's "n_pushed_by_cow"
// (a cow at 0.9, 101, 38.5) and "n_walk_into_boat" (an oak boat at 3.5, 101, 38.5) on 1.21.11.
describe("PlayerState nearby entities", () => {
  function stateWith(entities: object[]) {
    const rig = createBotcraftPlayerRig({ version: "1.21.11", position: new Vec3(0.5, 101, 38.5) });
    rig.fakePlayer.entity.id = 1;
    rig.fakePlayer.entities = Object.fromEntries([rig.fakePlayer.entity, ...entities].map((e: any) => [e.id, e]));
    rig.playerState.update(rig.fakePlayer);
    return rig.playerState;
  }

  it("builds the boxes of a cow and a boat as the vanilla client holds them", () => {
    const state = stateWith([
      { id: 38, name: "cow", position: new Vec3(0.9, 101, 38.5), width: 0.9, height: 1.4 },
      { id: 27, name: "oak_boat", position: new Vec3(3.5, 101, 38.5), width: 1.375, height: 0.5625 },
    ]);

    const cow = state.nearbyEntities.find((e) => e.name === "cow")!;
    const boat = state.nearbyEntities.find((e) => e.name === "oak_boat")!;
    expect(cow.living).toBe(true);
    expect(cow.boundingBox.toArray()).toEqual([0.450000011920929, 101, 38.05000001192093, 1.349999988079071, 102.39999997615814, 38.94999998807907]);
    expect(boat.living).toBe(false);
    expect(boat.boundingBox.toArray()).toEqual([2.8125, 101, 37.8125, 4.1875, 101.5625, 39.1875]);
  });

  // Before 1.13 mineflayer names the objects it spawned by their old names or display names, typed "object": the
  // fishing bobber of the recorder's "m_fishing" (1.9 - 1.12) is "Fishing Hook" and pushes no one.
  it("tells the old versions' objects and mobs apart, by mineflayer's type and the old names", () => {
    const state = stateWith([
      { id: 50, name: "Fishing Hook", type: "object", position: new Vec3(0.9, 101, 38.5), width: 0.25, height: 0.25 },
      { id: 51, name: "Boat", type: "object", position: new Vec3(3.5, 101, 38.5), width: 1.375, height: 0.5625 },
      { id: 52, name: "MushroomCow", type: "mob", position: new Vec3(0.5, 101, 39.5), width: 0.9, height: 1.4 },
      { id: 53, name: "item", type: "mob", position: new Vec3(0.5, 101, 37.5), width: 0.25, height: 0.25 },
    ]);

    const byName = Object.fromEntries(state.nearbyEntities.map((e) => [e.name, e.living]));
    expect(byName).toEqual({ fishing_hook: false, boat: false, mushroom_cow: true, item: false });
  });

  // n_walk_into_boat on 1.21.11, tick 13: the server moved the boat to x 3.530029296875 and the client shows it a third
  // of the way there (mineflayer's interpolatedPosition); the box is the shown one the client recorded
  it("builds the box where the client shows an entity, not at the server's position", () => {
    const state = stateWith([{
      id: 27, name: "oak_boat", width: 1.375, height: 0.5625,
      position: new Vec3(3.530029296875, 101, 38.5), interpolatedPosition: new Vec3(3.510009765625, 101, 38.5),
    }]);

    const [boat] = state.nearbyEntities;
    expect(boat.position.x).toBe(3.510009765625);
    expect(boat.boundingBox.toArray()).toEqual([2.822509765625, 101, 37.8125, 4.197509765625, 101.5625, 39.1875]);
  });

  it("leaves out the player itself and entities farther than 16 blocks", () => {
    const state = stateWith([{ id: 40, name: "cow", position: new Vec3(20, 101, 38.5), width: 0.9, height: 1.4 }]);
    expect(state.nearbyEntities).toEqual([]);
  });
});
