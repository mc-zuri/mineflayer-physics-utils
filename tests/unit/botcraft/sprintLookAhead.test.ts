import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import type { Bot } from "mineflayer";
import { EPhysicsCtx } from "../../../src/physics/settings";
import { PlayerState } from "../../../src/physics/states/playerState";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// A look-ahead of the bot (a state made from it, FROM_BOT: the pathfinder's edge guard simulates the bot's next tick
// each tick) that stops sprinting leaves the bot's own movement speed alone: setSprinting took the sprint modifier off
// the attributes object the state shared with the bot, which went on sprinting at its walking speed until its next
// setSprinting (Grim's Simulation: 0.0294 off a sprint at 0.2834 a tick, mineflayer-survival's pnpm e2e --grim).
// The bot takes the state's attributes when a state is applied to it.
for (const [version, sprintId] of [["1.20.4", "662a6b8d-da3e-4c1c-8813-96ea6097278d"], ["1.21.11", "minecraft:sprinting"]] as const) {
  describe(`Botcraft sprint of a look-ahead (${version})`, () => {
    function sprintingBot() {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 0.5), groundLevel });
      const sprint = { uuid: sprintId, amount: 0.30000001192092896, operation: 2 };
      const speed = { value: 0.10000000149011612, modifiers: [sprint] };
      rig.fakePlayer.entity.attributes = { [rig.physics.movementSpeedAttribute]: speed };
      rig.fakePlayer.entity.sprinting = true;
      rig.fakePlayer.entity.velocity.set(0, -0.0784000015258789, 0.28);
      const ctx = EPhysicsCtx.FROM_BOT(rig.physics, rig.fakePlayer as Bot);
      return { rig, ctx, state: ctx.state as PlayerState, speed, sprint };
    }

    it("a look-ahead that stops sprinting leaves the bot's sprint modifier", () => {
      const { rig, ctx, state, speed, sprint } = sprintingBot();
      expect(state.sprinting).toBe(true);
      // no keys: the sprint stops (LocalPlayer.aiStep: no forward impulse)
      rig.physics.simulate(ctx, createFlatWorld(version, groundLevel) as any);

      expect(state.sprinting).toBe(false);
      expect(state.attributes[rig.physics.movementSpeedAttribute].modifiers).toEqual([]);
      expect(rig.fakePlayer.entity.attributes[rig.physics.movementSpeedAttribute]).toBe(speed);
      expect(speed.modifiers).toEqual([sprint]);
    });

    it("the bot takes the modifier off once the state is applied", () => {
      const { rig, ctx, state } = sprintingBot();
      rig.physics.simulate(ctx, createFlatWorld(version, groundLevel) as any);
      state.apply(rig.fakePlayer as Bot);

      expect(rig.fakePlayer.entity.attributes[rig.physics.movementSpeedAttribute].modifiers).toEqual([]);
    });
  });
}
