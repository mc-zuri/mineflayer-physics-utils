import { AABB } from "@nxg-org/mineflayer-util-plugin";
import md from "minecraft-data";
import { Block } from "prismarine-block";
import { Vec3 } from "vec3";
import { EPhysicsCtx } from "../settings/entityPhysicsCtx";
import { BoatPhysicsSettings, resolveBoatSettings } from "../settings/boatSettings";
import { BoatState, BoatStatus } from "../states/boatState";
import { IEntityState } from "../states";
import { EntityPhysics } from "./entityPhysics";
import { Mth, mthFor } from "../../util/mth";

type PhysicsWorld = {
  getBlock(pos: Vec3): Block | null | undefined;
};

export class BoatPhysics extends EntityPhysics {
  private readonly boatSettings: BoatPhysicsSettings;
  private readonly mth: Mth;

  constructor(mcData: md.IndexedData) {
    super(mcData);
    this.boatSettings = resolveBoatSettings(mcData);
    this.mth = mthFor(!mcData.version["<"]("1.21.11"));
  }

  /**
   * Takes the boat's status from where it is now, as the status of the tick before: a boat met mid-ride (a fresh
   * BoatState starts IN_AIR) would otherwise "enter" the water it already floats on.
   */
  settleStatus(simCtx: EPhysicsCtx, world: PhysicsWorld): void {
    const state = simCtx.state;
    if (!(state instanceof BoatState)) return;
    state.status = state.previousStatus = this.getStatus(simCtx, state, world, simCtx.boat ?? this.boatSettings);
  }

  simulate(simCtx: EPhysicsCtx, world: PhysicsWorld): IEntityState {
    if (!(simCtx.state instanceof BoatState)) {
      return super.simulate(simCtx, world);
    }

    const state = simCtx.state;
    if (!this.isWorldReady(simCtx, state, world)) {
      state.worldReady = false;
      return state;
    }

    state.worldReady = true;

    const cfg = simCtx.boat ?? this.boatSettings;
    state.previousStatus = state.status;
    state.status = this.getStatus(simCtx, state, world, cfg);
    this.floatBoat(simCtx, state, world, cfg);
    this.controlBoat(state);
    state.lastVerticalVelocity = state.vel.y;

    this.move(simCtx, state, world);
    state.age++;
    return state;
  }

  /**
   * Entity.move for the boat (no step): the motion collided with the blocks, y first, then x and z (from 1.14 the
   * larger of the two first; from 1.13 an axis under 1.0E-7 that meets a block stays). Before 1.14 the position
   * is the moved box's (centre x / z, bottom y); 1.14 - 1.21.1 move only by more than 1.0E-7 squared, 1.21.2+ also
   * when nothing blocked the motion. A blocked horizontal axis stops (1.14+ beyond Mth.equal's 1.0E-5F), and a
   * blocked vertical motion lands.
   */
  private move(simCtx: EPhysicsCtx, state: BoatState, world: PhysicsWorld): void {
    const legacy = this.data.version["<"]("1.14");
    const want = { x: state.vel.x, y: state.vel.y, z: state.vel.z };
    const bb = this.getBoatBB(simCtx, state);
    // (from 1.18 only the shapes that meet the box swept along the motion: a block it only touches does not count)
    const swept = bb.clone().extend(want.x, want.y, want.z);
    const nearby = this.getSurroundingBBs(swept, world);
    const colliders = this.data.version["<"]("1.18") ? nearby : nearby.filter((block) => block.intersects(swept));
    const epsilon = !this.data.version["<"]("1.13");
    const along = (axis: "x" | "y" | "z", d: number) => {
      if (d === 0) return 0;
      for (const block of colliders) {
        // (VoxelShapes.calculateMaxOffset / Shapes.collide, 1.13+: a motion under 1.0E-7 meeting a shape stays)
        if (epsilon && Math.abs(d) < 1.0e-7) {
          d = 0;
          break;
        }
        d = axis === "x" ? block.computeOffsetX(bb, d) : axis === "y" ? block.computeOffsetY(bb, d) : block.computeOffsetZ(bb, d);
      }
      bb.translate(axis === "x" ? d : 0, axis === "y" ? d : 0, axis === "z" ? d : 0);
      return d;
    };
    const moved = { x: 0, y: along("y", want.y), z: 0 };
    if (!legacy && Math.abs(want.x) < Math.abs(want.z)) {
      moved.z = along("z", want.z);
      moved.x = along("x", want.x);
    } else {
      moved.x = along("x", want.x);
      moved.z = along("z", want.z);
    }

    if (legacy) {
      state.box = bb;
      state.pos.x = (bb.minX + bb.maxX) / 2;
      state.pos.y = bb.minY;
      state.pos.z = (bb.minZ + bb.maxZ) / 2;
    } else {
      const movedSqr = moved.x * moved.x + moved.y * moved.y + moved.z * moved.z;
      const wantSqr = want.x * want.x + want.y * want.y + want.z * want.z;
      const unblocked = !this.data.version["<"]("1.21.2") && wantSqr - movedSqr < 1.0e-7;
      if (movedSqr > 1.0e-7 || unblocked) {
        state.pos.x += moved.x;
        state.pos.y += moved.y;
        state.pos.z += moved.z;
      }
    }

    const differs = (a: number, b: number) => (legacy ? a !== b : Math.abs(b - a) >= Math.fround(1.0e-5));
    const blockedX = differs(want.x, moved.x);
    const blockedZ = differs(want.z, moved.z);
    state.isCollidedHorizontally = blockedX || blockedZ;
    state.isCollidedVertically = want.y !== moved.y;
    state.onGround = state.isCollidedVertically && want.y < 0;
    if (blockedX) state.vel.x = 0;
    if (blockedZ) state.vel.z = 0;
    if (state.isCollidedVertically) state.vel.y = 0;
  }

  /** The boat's box: before 1.14 the entity's own (moved box by box, the position follows it), else around the position. */
  private getBoatBB(simCtx: EPhysicsCtx, state: BoatState): AABB {
    if (state.box && this.data.version["<"]("1.14")) return state.box.clone();
    return this.getEntityBB(simCtx, state.pos);
  }

  private hasSolidCollision(targetBB: AABB, solidBB: AABB): boolean {
    const epsilon = 1e-7;
    return (
      targetBB.minX < solidBB.maxX - epsilon &&
      targetBB.maxX > solidBB.minX + epsilon &&
      targetBB.minY < solidBB.maxY - epsilon &&
      targetBB.maxY > solidBB.minY + epsilon &&
      targetBB.minZ < solidBB.maxZ - epsilon &&
      targetBB.maxZ > solidBB.minZ + epsilon
    );
  }

  private getWorldReadinessBlockRange(simCtx: EPhysicsCtx, state: BoatState): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  } {
    const bb = this.getBoatBB(simCtx, state);
    const margin = 1;

    return {
      minX: Math.floor(bb.minX) - margin,
      maxX: Math.ceil(bb.maxX) + margin,
      minY: Math.floor(bb.minY) - margin,
      maxY: Math.max(
        Math.ceil(bb.maxY) + margin,
        Math.ceil(bb.maxY - state.lastVerticalVelocity) + margin,
        Math.ceil(bb.maxY + 0.001) + margin,
        Math.ceil(bb.minY + 0.001) + margin,
      ),
      minZ: Math.floor(bb.minZ) - margin,
      maxZ: Math.ceil(bb.maxZ) + margin,
    };
  }

  private isWorldReady(simCtx: EPhysicsCtx, state: BoatState, world: PhysicsWorld): boolean {
    const range = this.getWorldReadinessBlockRange(simCtx, state);
    const cursor = new Vec3(0, 0, 0);

    for (cursor.y = range.minY; cursor.y < range.maxY; cursor.y++) {
      for (cursor.z = range.minZ; cursor.z < range.maxZ; cursor.z++) {
        for (cursor.x = range.minX; cursor.x < range.maxX; cursor.x++) {
          if (world.getBlock(cursor) == null) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private getStatus(
    simCtx: EPhysicsCtx,
    state: BoatState,
    world: PhysicsWorld,
    cfg: BoatPhysicsSettings,
  ): BoatStatus {
    const bb = this.getBoatBB(simCtx, state);
    const underwater = this.isUnderwater(bb, world);
    if (underwater != null) {
      state.waterLevel = bb.maxY;
      return underwater;
    }
    if (this.checkInWater(bb, state, world)) {
      return BoatStatus.IN_WATER;
    }
    const groundFriction = this.getGroundFriction(bb, world, cfg);
    if (groundFriction > 0) {
      state.landFriction = groundFriction;
      return BoatStatus.ON_LAND;
    }
    return BoatStatus.IN_AIR;
  }

  private isUnderwater(bb: AABB, world: PhysicsWorld): BoatStatus | null {
    const topY = bb.maxY + 0.001;
    const minX = Math.floor(bb.minX);
    const maxX = Math.ceil(bb.maxX);
    const minY = Math.floor(bb.maxY);
    const maxY = Math.ceil(topY);
    const minZ = Math.floor(bb.minZ);
    const maxZ = Math.ceil(bb.maxZ);
    let foundSource = false;
    const cursor = new Vec3(0, 0, 0);

    for (cursor.y = minY; cursor.y < maxY; cursor.y++) {
      for (cursor.x = minX; cursor.x < maxX; cursor.x++) {
        for (cursor.z = minZ; cursor.z < maxZ; cursor.z++) {
          const block = world.getBlock(cursor);
          if (!this.isWaterBlock(block)) continue;
          const fluidHeight = Math.fround(cursor.y + this.getFluidHeight(block, world, cursor));
          if (topY < fluidHeight) {
            if (!this.isSourceWater(block)) {
              return BoatStatus.UNDER_FLOWING_WATER;
            }
            foundSource = true;
          }
        }
      }
    }

    return foundSource ? BoatStatus.UNDER_WATER : null;
  }

  private checkInWater(bb: AABB, state: BoatState, world: PhysicsWorld): boolean {
    const minX = Math.floor(bb.minX);
    const maxX = Math.ceil(bb.maxX);
    const minY = Math.floor(bb.minY);
    const maxY = Math.ceil(bb.minY + 0.001);
    const minZ = Math.floor(bb.minZ);
    const maxZ = Math.ceil(bb.maxZ);
    let inWater = false;
    state.waterLevel = -Infinity;
    const cursor = new Vec3(0, 0, 0);

    for (cursor.x = minX; cursor.x < maxX; cursor.x++) {
      for (cursor.y = minY; cursor.y < maxY; cursor.y++) {
        for (cursor.z = minZ; cursor.z < maxZ; cursor.z++) {
          const block = world.getBlock(cursor);
          if (!this.isWaterBlock(block)) continue;
          const fluidHeight = Math.fround(cursor.y + this.getFluidHeight(block, world, cursor));
          state.waterLevel = Math.max(state.waterLevel, fluidHeight);
          inWater ||= bb.minY < fluidHeight;
        }
      }
    }

    return inWater;
  }

  private getWaterLevelAbove(bb: AABB, lastVerticalVelocity: number, world: PhysicsWorld): number {
    const minX = Math.floor(bb.minX);
    const maxX = Math.ceil(bb.maxX);
    const minY = Math.floor(bb.maxY);
    const maxY = Math.ceil(bb.maxY - lastVerticalVelocity);
    const minZ = Math.floor(bb.minZ);
    const maxZ = Math.ceil(bb.maxZ);
    const cursor = new Vec3(0, 0, 0);

    for (cursor.y = minY; cursor.y < maxY; cursor.y++) {
      let maxSliceHeight = 0;
      for (cursor.x = minX; cursor.x < maxX; cursor.x++) {
        for (cursor.z = minZ; cursor.z < maxZ; cursor.z++) {
          const block = world.getBlock(cursor);
          if (!this.isWaterBlock(block)) continue;
          maxSliceHeight = Math.max(maxSliceHeight, this.getFluidHeight(block, world, cursor));
          if (maxSliceHeight >= 1) break;
        }
        if (maxSliceHeight >= 1) break;
      }

      if (maxSliceHeight >= 1) continue;
      if (maxSliceHeight < 1) {
        return Math.fround(cursor.y + maxSliceHeight);
      }
    }

    return maxY + 1;
  }

  /**
   * Boat.getGroundFriction: the float average of the friction of the blocks whose collision shape meets the slice
   * under the boat, each block counted once (a lily pad not at all).
   */
  private getGroundFriction(bb: AABB, world: PhysicsWorld, cfg: BoatPhysicsSettings): number {
    const groundBB = new AABB(bb.minX, bb.minY - 0.001, bb.minZ, bb.maxX, bb.minY, bb.maxZ);
    const minX = Math.floor(groundBB.minX) - 1;
    const maxX = Math.ceil(groundBB.maxX) + 1;
    const minY = Math.floor(groundBB.minY) - 1;
    const maxY = Math.ceil(groundBB.maxY) + 1;
    const minZ = Math.floor(groundBB.minZ) - 1;
    const maxZ = Math.ceil(groundBB.maxZ) + 1;
    let frictionSum = 0;
    let count = 0;
    const cursor = new Vec3(0, 0, 0);

    for (cursor.x = minX; cursor.x < maxX; cursor.x++) {
      for (cursor.z = minZ; cursor.z < maxZ; cursor.z++) {
        const edgeX = cursor.x === minX || cursor.x === maxX - 1;
        const edgeZ = cursor.z === minZ || cursor.z === maxZ - 1;
        const edge = (edgeX ? 1 : 0) + (edgeZ ? 1 : 0);
        if (edge === 2) continue;

        for (cursor.y = minY; cursor.y < maxY; cursor.y++) {
          if (edge <= 0 || (cursor.y !== minY && cursor.y !== maxY - 1)) {
            const block = world.getBlock(cursor);
            if (!block || block.boundingBox === "empty") continue;
            if (block.name === "lily_pad" || block.name === "waterlily") continue;
            const shapes = block.shapes;
            if (!shapes?.length) continue;
            const meets = shapes.some((shape) =>
              new AABB(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5]).translate(cursor.x, cursor.y, cursor.z).intersects(groundBB),
            );
            if (meets) {
              frictionSum = Math.fround(frictionSum + Math.fround(this.blockSlipperiness[block.type] ?? cfg.defaultBlockFriction));
              count++;
            }
          }
        }
      }
    }

    return count > 0 ? Math.fround(frictionSum / count) : 0;
  }

  private isWaterBlock(block: Block | null | undefined): block is Block {
    if (!block) return false;
    return block.type === this.waterId || this.waterLike.has(block.type) || !!block.getProperties().waterlogged;
  }

  private isSameFluid(block: Block, other: Block | null | undefined): boolean {
    if (!other) return false;
    if (block.type === this.waterId) {
      return other.type === this.waterId || !!other.getProperties().waterlogged || this.waterLike.has(other.type);
    }
    if (block.getProperties().waterlogged) {
      return this.isWaterBlock(other);
    }
    if (this.waterLike.has(block.type)) {
      return block.type === other.type || this.isWaterBlock(other);
    }
    return false;
  }

  private isSourceWater(block: Block): boolean {
    if (block.getProperties().waterlogged) return true;
    if (this.waterLike.has(block.type)) return true;
    if (block.type !== this.waterId) return false;
    return Number(block.getProperties().level) === 0;
  }

  /**
   * The water's height in its block, a float: 1 under the same fluid; else FluidState.getOwnHeight, amount / 9F (1.13+;
   * a source or falling water is 8), before 1.13 BlockLiquid's 1F - (level + 1) / 9F (falling counts as 0), where only
   * a source or falling water reaches 1 under water.
   */
  private getFluidHeight(block: Block, world: PhysicsWorld, pos: Vec3): number {
    const f32 = Math.fround;
    const above = world.getBlock(pos.offset(0, 1, 0));
    const props = block.getProperties();
    const level = props.waterlogged || this.waterLike.has(block.type) ? 0 : Number(props.level ?? block.metadata ?? 0);
    if (this.data.version["<"]("1.13")) {
      if ((level & 7) === 0 && this.isWaterBlock(above)) return 1;
      return f32(1 - f32(((level >= 8 ? 0 : level) + 1) / 9));
    }
    if (this.isSameFluid(block, above)) return 1;
    return f32((level >= 8 ? 8 : 8 - level) / 9);
  }

  /**
   * Boat.floatBoat: gravity, the status's friction (a float), and buoyancy toward the water level, in double
   * arithmetic. Before 1.20.5 gravity is the float 0.04F and buoyancy 0.06153846016296973 per unit; since, the double
   * 0.04 (getDefaultGravity) and 0.04 / 0.65. Entering water from the air lifts the boat onto it (since 1.21 only
   * where it fits).
   */
  private floatBoat(
    simCtx: EPhysicsCtx,
    state: BoatState,
    world: PhysicsWorld,
    cfg: BoatPhysicsSettings,
  ): void {
    const f32 = Math.fround;
    const doubleGravity = !this.data.version["<"]("1.20.5");
    let gravity = doubleGravity ? -0.04 : -0.03999999910593033;
    let buoyancy = 0;
    let invFriction = f32(0.05);

    if (
      state.previousStatus === BoatStatus.IN_AIR &&
      state.status !== BoatStatus.IN_AIR &&
      state.status !== BoatStatus.ON_LAND
    ) {
      const height = f32(state.height);
      state.waterLevel = state.pos.y + height;
      const bb = this.getBoatBB(simCtx, state);
      const waterLevelAbove = this.getWaterLevelAbove(bb, state.lastVerticalVelocity, world);
      const targetY = f32(waterLevelAbove - height) + cfg.waterEntryYOffset;
      const guarded = !this.data.version["<"]("1.21");
      const targetBB = this.getEntityBB(simCtx, { x: state.pos.x, y: targetY, z: state.pos.z });
      const fits = !this.getSurroundingBBs(targetBB, world).some((solidBB) => this.hasSolidCollision(targetBB, solidBB));
      if (!guarded || fits) {
        state.pos.y = targetY;
        state.box = undefined; // (setPosition: the box around the new position)
        state.vel.y = 0;
        state.lastVerticalVelocity = 0;
      }
      state.status = BoatStatus.IN_WATER;
      return;
    }

    switch (state.status) {
      case BoatStatus.IN_WATER:
        buoyancy = (state.waterLevel - state.pos.y) / f32(state.height);
        invFriction = f32(0.9);
        break;
      case BoatStatus.UNDER_FLOWING_WATER:
        gravity = -7.0e-4;
        invFriction = f32(0.9);
        break;
      case BoatStatus.UNDER_WATER:
        buoyancy = 0.009999999776482582;
        invFriction = f32(0.45);
        break;
      case BoatStatus.IN_AIR:
        invFriction = f32(0.9);
        break;
      case BoatStatus.ON_LAND:
        invFriction = state.landFriction;
        if (state.controllingPlayer) {
          state.landFriction = f32(state.landFriction / 2);
        }
        break;
    }

    state.vel.x = state.vel.x * invFriction;
    state.vel.y = state.vel.y + gravity;
    state.vel.z = state.vel.z * invFriction;
    state.yawVelocity = f32(state.yawVelocity * invFriction);

    if (buoyancy > 0) {
      const perUnit = doubleGravity ? 0.04 / 0.65 : 0.06153846016296973;
      state.vel.y = (state.vel.y + buoyancy * perUnit) * 0.75;
    }
  }

  /**
   * Boat.controlBoat: the turn keys change deltaRotation by a degree each (float), the yaw (float degrees) turns by it,
   * and the motion gains the float push along Mth.sin/cos of the yaw: 0.04F forward, -0.005F back, 0.005F turning in
   * place.
   */
  private controlBoat(state: BoatState): void {
    const f32 = Math.fround;
    const { left, right, forward, back } = state.control;
    let push = 0;
    if (left) state.yawVelocity = f32(state.yawVelocity - 1);
    if (right) state.yawVelocity = f32(state.yawVelocity + 1);
    if (right !== left && !forward && !back) push = f32(push + f32(0.005));
    state.setYawDegrees(f32(state.yawDegrees + state.yawVelocity));
    if (forward) push = f32(push + f32(0.04));
    if (back) push = f32(push - f32(0.005));
    const radians = f32(state.yawDegrees * f32(0.017453292));
    state.vel.x += f32(this.mth.sin(f32(-radians)) * push);
    state.vel.z += f32(this.mth.cos(radians) * push);
  }

  getPaddleState(state: BoatState): { leftPaddle: boolean; rightPaddle: boolean } {
    const { left, right, forward } = state.control;
    return {
      leftPaddle: (right && !left) || forward,
      rightPaddle: (left && !right) || forward,
    };
  }
}
