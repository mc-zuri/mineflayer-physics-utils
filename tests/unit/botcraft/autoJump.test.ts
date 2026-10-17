import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// x_autojump_block: a vanilla client with the auto-jump option walks east on stone towards a one-block step (x 3 - 5).
// LocalPlayer.updateAutoJump queues a jump after tick 9's move, pressed on tick 10 (run here from tick 8's state).
const recorded: Record<string, { before: [number, number]; after: [number, number] }> = {
  "1.12.2": { before: [1.9693212934561402, 0.11692814584565936], after: [2.3996001950695547, 0.1175815317740132] },
  "1.21.11": { before: [1.9693214940821298, 0.11692816181141515], after: [2.399600454447249, 0.11758154782898447] },
};

function walkToStep(version: string, autoJump: boolean, onStep?: string) {
  const [posX, velX] = recorded[version].before;
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(posX, groundLevel, 1381.5), groundLevel });
  const world = createFlatWorld(version, groundLevel) as any;
  for (let x = 3; x <= 5; x++) {
    for (let z = 1380; z <= 1382; z++) {
      world.setOverrideBlock(new Vec3(x, groundLevel, z), rig.mcData.blocksByName.stone.id);
      if (onStep && x === 3) world.setOverrideBlock(new Vec3(x, groundLevel + 1, z), rig.mcData.blocksByName[onStep].id);
    }
  }
  rig.playerState.vel.set(velX, -0.0784000015258789, 0);
  rig.playerState.yawDegrees = 270;
  rig.playerState.control.forward = true;
  rig.playerState.autoJumpEnabled = autoJump;
  rig.physics.simulate(rig.playerCtx, world);
  rig.physics.simulate(rig.playerCtx, world);
  return rig.playerState;
}

describe("Botcraft auto-jump", () => {
  // a bot turns the option on with bot.physics.autoJump, which PlayerState.update reads
  it("takes the auto-jump option from bot.physics.autoJump", () => {
    const rig = createBotcraftPlayerRig({ version: "1.21.11", position: new Vec3(0.5, groundLevel, 0.5), groundLevel });
    rig.playerState.update(rig.fakePlayer, rig.playerState.control);
    expect(rig.playerState.autoJumpEnabled).toBe(false);
    rig.fakePlayer.physics = { autoJump: true };
    rig.playerState.update(rig.fakePlayer, rig.playerState.control);
    expect(rig.playerState.autoJumpEnabled).toBe(true);
  });

  for (const version of Object.keys(recorded)) {
    it(`jumps up a step the player walks into with auto-jump on (${version})`, () => {
      const state = walkToStep(version, true);

      expect(state.pos.x).toBe(recorded[version].after[0]);
      expect(state.vel.x).toBe(recorded[version].after[1]);
      expect(state.pos.y).toBe(101.41999998688698);
      expect(state.vel.y).toBe(0.33319999363422365);
    });

    // the blocks above the step count by LocalPlayer.updateAutoJump's box of them: before 1.13
    // BlockState.getCollisionBoundingBox, a brewing stand's its base (1/8 high: a step of 1.125 to jump), from 1.13 the
    // collision shape's top (its rod, 7/8: too high a step)
    it(`${version < "1.13" ? "jumps" : "does not jump"} up a step with brewing stands on it (${version})`, () => {
      expect(walkToStep(version, true, "brewing_stand").pos.y > groundLevel).toBe(version < "1.13");
    });

    it(`does not jump with auto-jump off (${version})`, () => {
      expect(walkToStep(version, false).pos.y).toBe(groundLevel);
    });

    // the queued jump is the tick's jump key (KeyboardInput.tick's makeJump): from 1.21.2 the client's player_input of
    // tick 10 holds it, tick 11's not
    it(`tells the bot the tick auto-jump presses jump (${version})`, () => {
      const state = walkToStep(version, true);
      state.apply(state.bot);
      expect((state.bot as unknown as { autoJumping?: boolean }).autoJumping).toBe(true);
    });
  }
});
