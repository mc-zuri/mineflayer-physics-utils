import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const EQUIPMENT_SLOTS: Record<string, number> = { head: 5, torso: 6, legs: 7, feet: 8 };

// q_soul_speed_3_walk_soul_sand tick 1: a vanilla client in Soul Speed III boots walks east from rest on soul sand
// (z 1172..1174 on y 100). The server syncs Soul Speed's movement speed modifier; the enchantment itself keeps soul
// sand from slowing the walk. mineflayer keeps the boots in the feet slot of the inventory window; prismarine-item
// reads their enchantments from the nbt as { name, lvl }, from 1.20.5 hands over the enchantments component as sent.
describe("Botcraft armour enchantments", () => {
  for (const { version, enchants } of [
    { version: "1.20.4", enchants: [{ name: "soul_speed", lvl: 3 }] },
    { version: "1.20.6", enchants: { enchantments: [{ id: 11, level: 3 }], showTooltip: true } },
  ]) {
    it(`walks on soul sand in Soul Speed boots from the feet slot (${version})`, () => {
      const y = 100.875;
      const world = createFlatWorld(version, 100);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, y, 1173.5), groundLevel: y });
      for (let x = -4; x <= 22; x++) {
        for (let z = 1172; z <= 1174; z++) world.setOverrideBlock(new Vec3(x, 100, z), rig.mcData.blocksByName.soul_sand.id);
      }
      rig.fakePlayer.inventory.slots[EQUIPMENT_SLOTS.feet] = { name: "diamond_boots", enchants };
      rig.fakePlayer.getEquipmentDestSlot = (slot: string) => EQUIPMENT_SLOTS[slot];
      rig.fakePlayer.entity.attributes = {
        [rig.physics.movementSpeedAttribute]: {
          value: 0.10000000149011612,
          modifiers: [{ uuid: "87f46a96-686f-4796-b035-22e16ee9e038", amount: 0.06149999797344208, operation: 0 }],
        },
      };
      rig.playerState.update(rig.fakePlayer, rig.playerState.control);
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.x).toBe(0.6582700098562242);
      expect(rig.playerState.vel.x).toBe(0.08641543541887829);
    });
  }
});
