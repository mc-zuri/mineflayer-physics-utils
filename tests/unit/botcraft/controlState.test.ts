import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const version = "1.21.11";
const groundLevel = 101;

describe("Botcraft control state", () => {
  it("keeps the keys of the tick before per player", () => {
    const world = createFlatWorld(version, groundLevel) as any;
    const sneaking = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 0.5), groundLevel });
    sneaking.playerState.control.sneak = true;
    sneaking.physics.simulate(sneaking.playerCtx, world);

    // a second bot's first tick: it held no sneak key the tick before, so it neither crouches nor walks slowly
    const walking = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 0.5), groundLevel });
    walking.playerState.control.forward = true;
    walking.physics.simulate(walking.playerCtx, world);

    expect(walking.playerState.crouching).toBe(false);
    expect(walking.playerState.heading.forward).toBe(0.9800000190734863);
  });
});
