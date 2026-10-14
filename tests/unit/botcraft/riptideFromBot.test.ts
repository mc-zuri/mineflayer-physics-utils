import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig } from "../../helpers/unit/botcraftTestSupport";

// PlayerState.update reads the riptide level TridentItem.releaseUsing launches by from the held trident, as
// prismarine-item holds its enchantments: { name, lvl } from the nbt, from 1.20.5 the enchantments component as sent.
// The q_riptide_3_* recordings hold a trident with riptide 3 in the main hand.
describe("Botcraft riptide from the bot", () => {
  for (const { version, enchants } of [
    { version: "1.20.4", enchants: (_id: number) => [{ name: "riptide", lvl: 3 }] },
    { version: "1.21.11", enchants: (id: number) => ({ enchantments: [{ id, level: 3 }] }) },
  ]) {
    it(`reads the held trident's riptide level (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 99, 1833.5) });
      const riptide = rig.mcData.enchantmentsByName.riptide.id;

      rig.fakePlayer.heldItem = { name: "trident", enchants: enchants(riptide) };
      rig.playerState.update(rig.fakePlayer);
      expect(rig.playerState.riptide).toBe(3);

      rig.fakePlayer.heldItem = { name: "stick", enchants: enchants(riptide) };
      rig.playerState.update(rig.fakePlayer);
      expect(rig.playerState.riptide).toBe(0);
    });
  }
});
