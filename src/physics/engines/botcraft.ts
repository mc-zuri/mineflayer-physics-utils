import { AABB } from "@nxg-org/mineflayer-util-plugin";
import md from "minecraft-data";
import { Block } from "prismarine-block";
import { Effect } from "prismarine-entity";
import { Vec3 } from "vec3";
import {
  CheapEffects,
  CheapEnchantments,
  getEnchantmentNamesForVersion,
  getStatusEffectNamesForVersion,
  makeSupportFeature,
  getLookingVector,
} from "../../util/physicsUtils";
import * as math from "../info/math";
import * as attributes from "../info/attributes";
import { Mth, floatRadians, mthFor } from "../../util/mth";
import { javaTrig } from "../../util/javaTrig";
import { EPhysicsCtx } from "../settings/entityPhysicsCtx";
import { IEntityState } from "../states";
import { IPhysics } from "./IPhysics";
import { LegacyShapes } from "./legacyShapes";
import { PlayerPoses, PlayerState, convInpToAxes, getCollider } from "../states";
import { PhysicsWorldSettings } from "../settings";

import type { world } from "prismarine-world"

type CheapEffectNames = keyof ReturnType<typeof getStatusEffectNamesForVersion>;
type CheapEnchantmentNames = keyof ReturnType<typeof getEnchantmentNamesForVersion>;

type Heading = { forward: number; strafe: number };
type World = { getBlock: world.WorldSync["getBlock"]};

const COLLISION_EPSILON = 1e-7;
/** The default world border's distance from 0 on x and z (WorldBorder's max radius). */
const WORLD_BORDER_RADIUS = 29999984;
type AABBPoints = [number, number, number, number, number, number];

/** Boats, chest boats and rafts: "boat" before 1.21.2, then one type per wood ("oak_boat", "bamboo_chest_raft"). */
const isBoatName = (name: string) => /(^|_)(boat|raft)$/.test(name);

/**
 * A moving piston block (PistonMovingBlockEntity) as the client holds it: its block position, the piston's facing (a
 * unit step), whether it extends, whether it is the piston's own head or base (isSourcePiston), its progress (a float,
 * 0 to 1) before the tick, and the collision boxes (block-local) of the block it moves (getCollisionRelatedBlockState).
 */
export interface MovingPiston {
  pos: [number, number, number];
  direction: [number, number, number];
  extending: boolean;
  source: boolean;
  progress: number;
  shapes: number[][];
}

/** PistonMath.getMovementArea: the slab the face of box toward dir sweeps over distance. */
function pistonMovementArea(box: AABB, dir: [number, number, number], distance: number): AABB {
  const [dx, dy, dz] = dir;
  const step = distance * (dx + dy + dz);
  const lo = Math.min(step, 0.0);
  const hi = Math.max(step, 0.0);
  if (dx < 0) return new AABB(box.minX + lo, box.minY, box.minZ, box.minX + hi, box.maxY, box.maxZ);
  if (dx > 0) return new AABB(box.maxX + lo, box.minY, box.minZ, box.maxX + hi, box.maxY, box.maxZ);
  if (dy < 0) return new AABB(box.minX, box.minY + lo, box.minZ, box.maxX, box.minY + hi, box.maxZ);
  if (dz < 0) return new AABB(box.minX, box.minY, box.minZ + lo, box.maxX, box.maxY, box.minZ + hi);
  if (dz > 0) return new AABB(box.minX, box.minY, box.maxZ + lo, box.maxX, box.maxY, box.maxZ + hi);
  return new AABB(box.minX, box.maxY + lo, box.minZ, box.maxX, box.maxY + hi, box.maxZ);
}

/** PistonMovingBlockEntity.getMovement: how far area reaches into box along dir. */
function pistonMovement(area: AABB, dir: [number, number, number], box: AABB): number {
  const [dx, dy, dz] = dir;
  if (dx > 0) return area.maxX - box.minX;
  if (dx < 0) return box.maxX - area.minX;
  if (dy < 0) return box.maxY - area.minY;
  if (dz > 0) return area.maxZ - box.minZ;
  if (dz < 0) return box.maxZ - area.minZ;
  return area.maxY - box.minY;
}


/**
 * The key an attribute the server synced is kept under (mineflayer's entity.attributes): the name the protocol gives
 * it. From 1.16 to 1.20.4 ClientboundUpdateAttributesPacket writes the attribute's namespaced registry name; before,
 * its plain name; from 1.20.5 its registry id, which minecraft-data maps to the name its attributes.json gives.
 */
export function extractAttribute(ctx: IPhysics, genericName: string) {
  const data = ctx.data.attributesByName[genericName] as any;
  if (data == null) return null;
  const resource = data.resource;
  const namespaced = ctx.data.version[">="]("1.16") && ctx.data.version["<"]("1.20.5");
  return namespaced && !resource.startsWith("minecraft:") ? `minecraft:${resource}` : resource;
}

/**
 * Looking at this code, it's too specified towards players.
 *
 * I will eventually split this code into PlayerState and bot.entityState, where bot.entityState contains fewer controls.
 */

export class BotcraftPhysics implements IPhysics {
  public data: md.IndexedData;
  public movementSpeedAttribute: string;
  public jumpStrengthAttribute: string;
  public movementEfficiencyAttribute: string;
  public waterMovementEfficiencyAttribute: string;
  public stepHeightAttribute: string;
  public gravityAttribute: string;
  public scaleAttribute: string;
  /** 26.2+: FRICTION_MODIFIER, AIR_DRAG_MODIFIER and BOUNCINESS (null before) */
  public frictionModifierAttribute: string | null;
  public airDragModifierAttribute: string | null;
  public bouncinessAttribute: string | null;
  public sneakingSpeedAttribute: string;
  public supportFeature: ReturnType<typeof makeSupportFeature>;
  public blockSlipperiness: { [name: string]: number };
  public readonly mth: Mth;

  protected bedId: number;
  /** Block.getBounceRestitution (26.2+): slime 1, the colored beds and the shelf mushroom 0.75F. */
  protected bounceRestitution: Map<number, number>;
  protected slimeBlockId: number;
  protected soulsandId: number;
  protected berryBushId: number;
  protected powderSnowId: number;
  protected honeyblockId: number;
  protected webId: number;
  protected waterId: number;
  protected lavaId: number;
  /** Before 1.13 the flowing water and lava are blocks of their own (BlockDynamicLiquid), of the same material. */
  protected flowingWaterId: number;
  protected flowingLavaId: number;
  protected ladderId: number;
  protected vineId: number;
  protected scaffoldId: number;
  protected climbableIds: Set<number>;
  /** The blocks whose shapes vanilla moves by a per-column offset (OffsetType.XZ), with their maximum offset. */
  protected offsetBlocks: Map<number, number>;
  /** The player simulated, whose collision context shapes the blocks it collides with (EntityCollisionContext). */
  protected collider: PlayerState | null = null;
  /** Before 1.13, the shapes the client takes from the blocks around (fences, panes, walls, stairs, doors, ...). */
  protected readonly legacyShapes: LegacyShapes;
  protected bubblecolumnId: number;
  protected airId: number;
  protected waterLike: Set<number>;
  /** The position the tick started at (vanilla's oldPosition) and the move Entity.move recorded this tick. */
  private tickStartPos: Vec3 | null = null;
  private recordedMove: { from: Vec3; to: Vec3; movement: Vec3 } | null = null;

  public readonly statusEffectNames: { [type in CheapEffects]: string };
  public readonly enchantmentNames: { [type in CheapEnchantments]: string };

  constructor(mcData: md.IndexedData) {
    this.data = mcData;
    this.legacyShapes = new LegacyShapes(mcData);
    const blocksByName = mcData.blocksByName;
    this.supportFeature = makeSupportFeature(mcData);
    this.mth = mthFor(!this.verLessThan("1.21.11"));
    this.movementSpeedAttribute = extractAttribute(this, "movementSpeed");
    this.movementEfficiencyAttribute = extractAttribute(this, "movementEfficiency");
    this.jumpStrengthAttribute = extractAttribute(this, "jumpStrength");
    this.waterMovementEfficiencyAttribute = extractAttribute(this, "waterMovementEfficiency");
    this.stepHeightAttribute = extractAttribute(this, "stepHeight");
    this.gravityAttribute = extractAttribute(this, "gravity");
    this.scaleAttribute = extractAttribute(this, "scale");
    this.frictionModifierAttribute = extractAttribute(this, "frictionModifier");
    this.airDragModifierAttribute = extractAttribute(this, "airDragModifier");
    this.bouncinessAttribute = extractAttribute(this, "bounciness");
    // 1.21 - 1.21.1 player.sneaking_speed, then sneaking_speed
    this.sneakingSpeedAttribute = extractAttribute(this, "playerSneakingSpeed") ?? extractAttribute(this, "sneakingSpeed");

    this.blockSlipperiness = {};
    this.slimeBlockId = blocksByName.slime_block ? blocksByName.slime_block.id : blocksByName.slime.id;
    this.blockSlipperiness[this.slimeBlockId] = 0.8;
    this.blockSlipperiness[blocksByName.ice.id] = 0.98;
    this.blockSlipperiness[blocksByName.packed_ice.id] = 0.98;

    // 1.9+
    if (blocksByName.frosted_ice) this.blockSlipperiness[blocksByName.frosted_ice.id] = 0.98;

    // 1.13+
    if (blocksByName.blue_ice) this.blockSlipperiness[blocksByName.blue_ice.id] = 0.989;

    this.bedId = blocksByName.bed?.id ?? blocksByName.white_bed?.id ?? -1;
    this.bounceRestitution = new Map([[this.slimeBlockId, 1]]);
    for (const block of mcData.blocksArray) {
      if ((/_bed$/.test(block.name) && block.name !== "straw_bed") || block.name === "shelf_mushroom") {
        this.bounceRestitution.set(block.id, Math.fround(0.75));
      }
    }
    this.soulsandId = blocksByName.soul_sand.id;
    this.scaffoldId = blocksByName.scaffolding?.id ?? -1; // 1.14+
    this.berryBushId = blocksByName.sweet_berry_bush?.id ?? -1; // 1.14+
    this.powderSnowId = blocksByName.powder_snow?.id ?? -1;
    this.honeyblockId = blocksByName.honey_block ? blocksByName.honey_block.id : -1; // 1.15+
    this.webId = blocksByName.cobweb ? blocksByName.cobweb.id : blocksByName.web.id;
    this.waterId = blocksByName.water.id;
    this.lavaId = blocksByName.lava.id;
    this.flowingWaterId = blocksByName.flowing_water?.id ?? -1; // before 1.13
    this.flowingLavaId = blocksByName.flowing_lava?.id ?? -1; // before 1.13
    this.ladderId = blocksByName.ladder.id;
    this.vineId = blocksByName.vine.id;
    // BlockTags.CLIMBABLE (1.16+; ladder, vine and scaffolding before): each block from the version that adds it
    const climbables = ["ladder", "vine", "scaffolding", "weeping_vines", "weeping_vines_plant", "twisting_vines",
      "twisting_vines_plant", "cave_vines", "cave_vines_plant"];
    // bamboo (1.14+, Block.getMaxHorizontalOffset 0.25F), pointed dripstone (1.17+, 0.125F) and sulfur spike (26.2+, 0.125F)
    this.offsetBlocks = new Map();
    if (blocksByName.bamboo) this.offsetBlocks.set(blocksByName.bamboo.id, 0.25);
    if (blocksByName.pointed_dripstone) this.offsetBlocks.set(blocksByName.pointed_dripstone.id, 0.125);
    if (blocksByName.sulfur_spike) this.offsetBlocks.set(blocksByName.sulfur_spike.id, 0.125); // 26.2+
    this.climbableIds = new Set(climbables.filter((name) => blocksByName[name] != null).map((name) => blocksByName[name].id));
    this.airId = blocksByName.air.id;
    this.waterLike = new Set();
    if (blocksByName.seagrass) this.waterLike.add(blocksByName.seagrass.id); // 1.13+
    if (blocksByName.tall_seagrass) this.waterLike.add(blocksByName.tall_seagrass.id); // 1.13+
    if (blocksByName.kelp) this.waterLike.add(blocksByName.kelp.id); // 1.13+
    if (blocksByName.kelp_plant) this.waterLike.add(blocksByName.kelp_plant.id); // 1.13+
    this.bubblecolumnId = blocksByName.bubble_column ? blocksByName.bubble_column.id : -1; // 1.13+
    if (blocksByName.bubble_column) this.waterLike.add(this.bubblecolumnId);

    this.statusEffectNames = {} as any; // mmm, speed.
    this.enchantmentNames = {} as any; //mmm, double speed.

    let ind = 0;
    const tmp = getStatusEffectNamesForVersion(this.supportFeature);
    for (const key in tmp) {
      this.statusEffectNames[ind as CheapEffects] = tmp[key as CheapEffectNames];
      ind++;
    }
    Object.freeze(this.statusEffectNames);
    ind = 0;
    const tmp1 = getEnchantmentNamesForVersion(this.supportFeature);
    for (const key in tmp1) {
      this.enchantmentNames[ind as CheapEnchantments] = tmp1[key as CheapEnchantmentNames];
      ind++;
    }
    Object.freeze(this.enchantmentNames);
  }

  getEntityBB(entity: EPhysicsCtx, pos: { x: number; y: number; z: number }): AABB {
    const w = entity.getHalfWidth();
    return new AABB(-w, 0, -w, w, entity.height, w).translate(pos.x, pos.y, pos.z);
  }

  setPositionToBB(entity: EPhysicsCtx, bb: AABB, pos: { x: number; y: number; z: number }) {
    const halfWidth = entity.getHalfWidth();
    pos.x = bb.minX + halfWidth;
    pos.y = bb.minY;
    pos.z = bb.minZ + halfWidth;
  }

  getSurroundingBBs(queryBB: AABB, world: World, underlying = true): AABB[] {
    const surroundingBBs = [];
    const cursor = new Vec3(0, 0, 0);
    for (cursor.y = Math.floor(queryBB.minY) - Number(underlying); cursor.y <= Math.floor(queryBB.maxY); ++cursor.y) {
      for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); ++cursor.z) {
        for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); ++cursor.x) {
          const block = world.getBlock(cursor) as Block | null;
          if (block != null) {
            const blockPos = block.position;
            for (const shape of this.collisionShapes(block, blockPos, world)) {
              const blockBB = new AABB(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5]);
              blockBB.translate(blockPos.x, blockPos.y, blockPos.z);
              surroundingBBs.push(blockBB);
            }
          }
        }
      }
    }
    return surroundingBBs;
  }

  /**
   * The block's collision shapes where it is, for the player simulated. Before 1.13 a block whose shape the client takes
   * from its neighbours (LegacyShapes) has it from the world's blocks around, when the world is given.
   */
  protected collisionShapes(block: Block, pos: Vec3, world?: World): AABBPoints[] {
    if (world != null && this.legacyShapes.enabled) {
      const shapes = this.legacyShapes.shapes(block.type, block.metadata, (dx, dy, dz) => world.getBlock(pos.offset(dx, dy, dz)));
      if (shapes != null) return shapes;
    }
    if (block.type === this.scaffoldId && this.collider) return this.scaffoldingShapes(block, this.collider) as AABBPoints[];
    if (block.type === this.powderSnowId && this.collider) return this.powderSnowShapes(pos, this.collider) as AABBPoints[];
    const maxOffset = this.offsetBlocks.get(block.type);
    if (maxOffset == null) return block.shapes as AABBPoints[];
    // minecraft-data's shapes carry the offset of the column at x 0, z 0
    const [x, z] = this.horizontalOffset(pos.x, pos.z, maxOffset);
    const [x0, z0] = this.horizontalOffset(0, 0, maxOffset);
    return block.shapes.map(([minX, minY, minZ, maxX, maxY, maxZ]): AABBPoints => [
      minX - x0 + x, minY, minZ - z0 + z, maxX - x0 + x, maxY, maxZ - z0 + z,
    ]);
  }

  /**
   * BlockBehaviour's OffsetType.XZ offset of a column: from Mth.getSeed(x, 0, z), each axis (n / 15F - 0.5) * 0.5 for
   * a 4-bit n, clamped to the block's maximum offset (since 1.17; within it anyway before).
   */
  private horizontalOffset(x: number, z: number, maxOffset: number): [number, number] {
    const big = BigInt;
    let seed = big.asIntN(32, big(x) * big(3129871)) ^ (big(z) * big(116129781));
    seed = big.asIntN(64, seed * seed * big(42317861) + seed * big(11)) >> big(16);
    const axis = (bits: bigint) => {
      const offset = (Math.fround(Math.fround(Number(bits & big(15))) / 15) - 0.5) * 0.5;
      return Math.min(Math.max(offset, -maxOffset), maxOffset);
    };
    return [axis(seed), axis(seed >> big(8))];
  }

  /**
   * PowderSnowBlock.getCollisionShape (1.17+): 0.9F tall to an entity whose fall distance is over 2.5; a full block to
   * a player in leather boots whose feet are above it (y > top - 1e-5F) and that is not descending (sneaking);
   * else nothing.
   */
  private powderSnowShapes(pos: Vec3, player: PlayerState): Block["shapes"] {
    if (player.fallDistance > 2.5) return [[0, 0, 0, 1, 0.8999999761581421, 1]];
    const above = player.pos.y > pos.y + 1 - 9.999999747378752e-6;
    return player.canWalkOnPowderSnow && above && !player.control.sneak ? [[0, 0, 0, 1, 1, 1]] : [];
  }

  /**
   * ScaffoldingBlock.getCollisionShape (1.14+): the stable shape (top and legs, minecraft-data's) to a player above the
   * block that is not descending (sneaking); the bottom slab of a hanging bottom piece to a player above the block
   * below; else nothing.
   */
  private scaffoldingShapes(block: Block, player: PlayerState): number[][] {
    const y = block.position.y;
    if (player.pos.y > y + 1 - 9.999999747378752e-6 && !player.control.sneak) return block.shapes;
    const { distance, bottom } = block.getProperties();
    const hangingBottom = Number(distance) !== 0 && (bottom === true || bottom === "true");
    return hangingBottom && player.pos.y > y - 9.999999747378752e-6 ? [[0, 0, 0, 1, 0.125, 1]] : [];
  }

  getWaterInBBs(bb: AABB, world: World) {
    const bbs = [];
    const cursor = new Vec3(0, 0, 0);
    for (cursor.y = Math.floor(bb.minY); cursor.y <= Math.floor(bb.maxY); cursor.y++) {
      for (cursor.z = Math.floor(bb.minZ); cursor.z <= Math.floor(bb.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(bb.minX); cursor.x <= Math.floor(bb.maxX); cursor.x++) {
          const block = world.getBlock(cursor);
          if (block && (block.type === this.waterId || block.type === this.flowingWaterId || this.waterLike.has(block.type) || block.getProperties().waterlogged)) {
            const waterLevel = cursor.y + 1 - this.getLiquidHeightPcent(block);
            if (Math.ceil(bb.maxY) >= waterLevel) {
              bbs.push(new AABB(cursor.x, cursor.y, cursor.z, cursor.x + 1, cursor.y + 1, cursor.z + 1));
            }
          }
        }
      }
    }
    return bbs;
  }

  getEffectLevel(wantedEffect: CheapEffects, effects: Effect[]) {
    const effectDescriptor = this.data.effectsByName[this.statusEffectNames[wantedEffect]];
    if (!effectDescriptor) {
      return 0;
    }
    const effectInfo = effects[effectDescriptor.id];
    if (!effectInfo) {
      return 0;
    }
    return effectInfo.amplifier + 1;
  }

  getEnchantmentLevel(wantedEnchantment: CheapEnchantments, enchantments: any[]) {
    const enchantmentName = this.enchantmentNames[wantedEnchantment];
    const enchantmentDescriptor = this.data.enchantmentsByName[enchantmentName];
    if (!enchantmentDescriptor) {
      return 0;
    }

    for (const enchInfo of enchantments) {
      if (typeof enchInfo.id === "string") {
        if (enchInfo.id.includes(enchantmentName)) {
          return enchInfo.lvl;
        }
      } else if (enchInfo.id === enchantmentDescriptor.id) {
        return enchInfo.lvl;
      }
    }
    return 0;
  }

  private verGreaterThan(ver: string) {
    return this.data.version[">"](ver);
  }

  protected verLessThan(ver: string) {
    return this.data.version["<"](ver);
  }

  private worldIsFree(world: World, bb: AABB, ignoreLiquid: boolean) {
    const bbs = ignoreLiquid ? this.getSurroundingBBs(bb, world, false) : [...this.getSurroundingBBs(bb, world, false), ...this.getWaterInBBs(bb, world)];

    // now we have to actually check for collisions.
    for (const blockBB of bbs) {
      if (blockBB.intersects(bb)) {
        const blockAt = world.getBlock(blockBB.minPoint())!;
        // console.log('world not free due to block: ', blockAt.name, blockAt.position)
        return false;
      }
    }
    return true;
  }

  /**
   * 1:1 copy of the original physicsTick function from botcraft
   * https://github.com/adepierre/Botcraft/blob/6c572071b0237c27a85211a246ce10565ef4d80f/botcraft/src/Game/Physics/PhysicsManager.cpp#L277
   *
   *
   * @param ctx
   * @param world
   */
  private physicsTick(ctx: EPhysicsCtx, world: World) {
    // Check for rocket boosting if currently in elytra flying mode
    const entity = ctx.state;

    // if (ctx.state.elytraFlying) {
    //   // TODO: entity check for fireworks
    //   // TODO: check if firework is attached to player
    //   if (false) {
    //     // player->speed += player->front_vector * 0.1 + (player->front_vector * 1.5 - player->speed) * 0.5;
    //   }
    // }

    // for now, only check if this is a player.

    const playerFlag = ctx.entityType.type === "player";

    // the use key is handled before the entities tick: releasing a riptide trident launches the player
    if (playerFlag && entity instanceof PlayerState) this.releaseUsingItem(ctx, world);

    // the rockets the client's entity list ticks before the player boost it before its own tick
    if (playerFlag && entity instanceof PlayerState && entity.fireworkRocketsBeforePlayer > 0) {
      this.applyFireworkBoost(entity, entity.fireworkRocketsBeforePlayer);
    }
    // and so do the mobs and boats it ticks before the player
    if (playerFlag && entity instanceof PlayerState) this.pushByNearbyEntities(entity, true);

    // Player.tick: a spectator is never on the ground (it moves without physics)
    if (playerFlag && entity instanceof PlayerState && entity.gameMode === "spectator") entity.onGround = false;

    this.tickStartPos = ctx.state.pos.clone();
    this.recordedMove = null;
    // LivingEntity.getScale (1.20.5+): the dimensions follow the synced scale attribute (refreshDimensions)
    if (entity instanceof PlayerState) {
      const synced = this.verLessThan("1.20.5") ? undefined : entity.attributes?.[this.scaleAttribute];
      entity.scale = synced ? Math.fround(this.attributeValue(this.scaleAttribute, synced)) : 1;
    }

    this.fluidPhysics(ctx, world, true);
    this.fluidPhysics(ctx, world, false);
    if (!this.verLessThan("1.13") && ctx.state instanceof PlayerState) this.updateFluidOnEyes(ctx.state, world);

    // updateSwimming moved into AiStep.

    // separation into a new function
    // originally: https://github.com/adepierre/Botcraft/blob/6c572071b0237c27a85211a246ce10565ef4d80f/botcraft/src/Game/Physics/PhysicsManager.cpp#L325
    if (playerFlag) {
      this.localPlayerAIStep(ctx, world);
      this.pushByNearbyEntities(ctx.state as PlayerState, false);
    }
  }

  /**
   * The other entities tick after the local player and push it (1.9+; on the client they push only the local player,
   * EntitySelector.pushableBy): a mob whose box meets the player's (LivingEntity.pushEntities), a boat whose box grown
   * by 0.2, -0.01, 0.2 meets it while the player's feet are not above the boat's (Boat.tick, Boat.push). The player,
   * if pushable (alive, not a spectator, not on a climbable), gets Entity.push away from the other's centre. Those the
   * client ticks before the player (ticksBeforePlayer, 1.14 - 1.16) push it before its tick. Each pushes from where
   * its own tick left it (afterTick: a boat steps its interpolation in Boat.tickLerp, a mob in LivingEntity.aiStep,
   * before they push).
   */
  private pushByNearbyEntities(player: PlayerState, beforePlayer: boolean) {
    if (beforePlayer) player.pushedEntities = [];
    if (this.verLessThan("1.9") || player.gameMode === "spectator" || player.onClimbable) return;
    const box = player.getBB();
    for (const other of player.nearbyEntities) {
      if (!!other.ticksBeforePlayer !== beforePlayer || other.sameVehicle) continue;
      const { position, boundingBox } = other.afterTick ?? other;
      const { minX, minY, minZ, maxX, maxY, maxZ } = boundingBox;
      if (isBoatName(other.name)) {
        const reach = new AABB(minX, minY, minZ, maxX, maxY, maxZ).expand(0.20000000298023224, -0.009999999776482582, 0.20000000298023224);
        if (!box.intersects(reach) || box.minY > minY) continue;
      } else if (!other.living || !box.intersects(boundingBox)) {
        continue;
      }
      const push = this.pushAwayFrom(player, position);
      // (the other goes the other way: Entity.push's other.push, unless it carries passengers)
      if (push && other.id != null && !other.isVehicle) player.pushedEntities.push({ id: other.id, x: push.x, z: push.z });
    }
  }

  /**
   * Entity.push: 0.05 away from the other's centre, the square root of the larger axis distance in float before 1.17.
   * Returns the push the other takes (the player's, reversed), or null when they are too close to push.
   */
  private pushAwayFrom(player: PlayerState, other: Vec3): { x: number; z: number } | null {
    let dx = other.x - player.pos.x;
    let dz = other.z - player.pos.z;
    let distance = Math.max(Math.abs(dx), Math.abs(dz));
    if (distance < 0.009999999776482582) return null;
    distance = this.verLessThan("1.17") ? Math.fround(Math.sqrt(distance)) : Math.sqrt(distance);
    dx /= distance;
    dz /= distance;
    const scale = Math.min(1.0 / distance, 1.0);
    dx = dx * scale * 0.05000000074505806;
    dz = dz * scale * 0.05000000074505806;
    player.vel.x += -dx;
    player.vel.z += -dz;
    return { x: dx, z: dz };
  }

  /**
   * Assume later than 1.13.2 before calling this function.
   * @param player
   * @param world
   */
  private updatePoses(ctx: EPhysicsCtx, world: World) {
    const player = ctx.state as PlayerState;
    const swimPose = getCollider(PlayerPoses.SWIMMING, player.pos, player.scale).expand(-1e-7, -1e-7, -1e-7);
    if (this.worldIsFree(world, swimPose, true)) {
      // update poses
      let currentPose: PlayerPoses;
      // player->GetDataSharedFlagsIdImpl(EntitySharedFlagsId::FallFlying)
      if (player.fallFlying) {
        currentPose = PlayerPoses.FALL_FLYING;
      }
      // (player->GetSleepingPosIdImpl()
      // this is based on metadata which I currently do not have access to.
      else if (player.pose === PlayerPoses.SLEEPING) {
        currentPose = PlayerPoses.SLEEPING;
      } else if (this.isSwimmingAndNotFlying(ctx, world)) {
        currentPose = PlayerPoses.SWIMMING;
      }
      // player->GetDataLivingEntityFlagsImpl() & 0x04
      // no clue.
      else if (false) {
        currentPose = PlayerPoses.SPIN_ATTACK;
      } else if (player.control.sneak && !player.flying) {
        currentPose = PlayerPoses.SNEAKING;
      } else {
        currentPose = PlayerPoses.STANDING;
      }

      const poseBB = getCollider(currentPose, player.pos, player.scale).expand(-1e-7, -1e-7, -1e-7);
      if (player.gameMode === "spectator" || this.worldIsFree(world, poseBB, true)) {
        player.pose = currentPose;
      } else {
        const crouchBB = getCollider(PlayerPoses.SNEAKING, player.pos, player.scale).expand(-1e-7, -1e-7, -1e-7);
        if (this.worldIsFree(world, crouchBB, true)) {
          player.pose = PlayerPoses.SNEAKING;
        } else {
          player.pose = PlayerPoses.SWIMMING;
        }
      }
    }
  }

  protected fluidPhysics(ctx: EPhysicsCtx, world: World, water: boolean) {
    const player = ctx.state as PlayerState;
    // (an entity of its own size, a ridden mob: its box)
    const collider = player.dimensions ? player.getBB() : getCollider(player.pose, player.pos, player.scale);
    const bottom = collider.minY;
    const aabb = collider.expand(-1e-3, -1e-3, -1e-3); // -0.001
    if (water) {
      player.isInWater = false;
      if (this.verLessThan("1.13")) {
        this.handleWaterMovementLegacy(player, world);
        return;
      }
    } else {
      player.isUnderLava = false;
      // 1.14 - 1.15 keep isInLava from the last move (Entity.move's checkInsideBlocks), and lava neither pushes nor
      // has a height to them (Entity.updateInWaterState: water alone)
      if (!this.verLessThan("1.14") && this.verLessThan("1.16")) return;
      player.isInLava = false;
      if (this.verLessThan("1.14")) {
        player.isInLava = this.isInLavaLegacy(player, world);
        return;
      }
    }

    const minAABB = aabb.minPoint();
    const maxAABB = aabb.maxPoint();
    const eyeHeight = player.eyeHeight + player.pos.y;
    // the height above the bottom of the box deflated by 0.001, of the box itself from 26.1 (EntityFluidInteraction)
    const heightFrom = this.verLessThan("26.1") ? minAABB.y : bottom;

    const waterCond = (block: Block) => block.type === this.waterId || this.waterLike.has(block.type) || block.getProperties().waterlogged;
    const lavaCond = (block: Block) => block.type === this.lavaId;

    const push = new Vec3(0, 0, 0);
    const blockPos = new Vec3(0, 0, 0);
    let fluidRelativeHeight = 0.0;
    let numPush = 0;
    for (blockPos.x = Math.floor(minAABB.x); blockPos.x <= Math.floor(maxAABB.x); ++blockPos.x) {
      for (blockPos.y = Math.floor(minAABB.y); blockPos.y <= Math.floor(maxAABB.y); ++blockPos.y) {
        for (blockPos.z = Math.floor(minAABB.z); blockPos.z <= Math.floor(maxAABB.z); ++blockPos.z) {
          const block = world.getBlock(blockPos);
          if (block == null) continue;

          const waterRes = waterCond(block);
          const lavaRes = lavaCond(block);
          if ((waterRes && !water) || (lavaRes && water) || (!waterRes && !lavaRes)) {
            continue;
          }

          // FluidState.getHeight: 1 under the same fluid from 1.14, else the float own height (amount / 9F); the
          // top is the float y + height, in double from 26.1 (EntityFluidInteraction.update)
          let fluidHeight = 0.0;
          const blockAbv = world.getBlock(blockPos.offset(0, 1, 0));
          const sameAbove = (blockAbv != null && waterCond(blockAbv) && waterRes) || (lavaCond(blockAbv) && lavaRes);
          if (sameAbove && !this.verLessThan("1.14")) {
            fluidHeight = 1.0;
          } else {
            fluidHeight = this.ownFluidHeight(block);
          }
          const top = this.verLessThan("26.1") ? Math.fround(blockPos.y + fluidHeight) : blockPos.y + fluidHeight;

          if (top < minAABB.y) {
            continue;
          }

          if (water) {
            player.isInWater = true;
            if (this.verLessThan("1.13") && fluidHeight + blockPos.y > eyeHeight) {
              player.isUnderWater = true;
            }
          } else {
            player.isInLava = true;
            if (top > eyeHeight) {
              player.isUnderLava = true;
            }
          }

          fluidRelativeHeight = Math.max(top - heightFrom, fluidRelativeHeight);

          if (player.flying) continue;

          const currentPush = this.getFlow(block, world);
          if (fluidRelativeHeight < 0.4) {
            currentPush.scale(fluidRelativeHeight);
          }
          push.add(currentPush);
          numPush++;
        }
      }
    }

    // the fluid height getFluidHeight reads, kept for the jump
    if (water) player.waterHeight = fluidRelativeHeight;
    else player.lavaHeight = fluidRelativeHeight;

    if (push.norm() > 0.0) {
      if (numPush > 0) {
        push.scale(1.0 / numPush);
      }
      if (water) {
        push.scale(0.014);
      } else {
        const worldInUltraWarm = false; // TODO: implement this (bot world relevance)
        push.scale(worldInUltraWarm ? 0.007 : 0.0023333333333333335);
      }
    }
    // the minimum push for a player at rest came with 1.16 (Vec3.length and normalize: a float square root in 1.16)
    if (
      !this.verLessThan("1.16") &&
      Math.abs(player.vel.x) < ctx.worldSettings.negligeableVelocity &&
      Math.abs(player.vel.z) < ctx.worldSettings.negligeableVelocity &&
      this.vecLength(push) < 0.0045000000000000005
    ) {
      // normalize and scale
      const unit = this.normalizeVec(push);
      push.set(unit.x, unit.y, unit.z).scale(0.0045000000000000005);
    }
    // Entity.updateFluidHeightAndDoFluidPushing adds the current only when there is one (a -0 motion stays), to an
    // entity the fluid pushes (isPushedByFluid)
    if (push.norm() > 0.0 && this.isPushedByFluid(player)) player.vel.add(push);
  }

  /** Entity.isPushedByFluid: whether a fluid's current pushes the entity (Player: unless flying). */
  protected isPushedByFluid(player: PlayerState): boolean {
    return !player.flying;
  }

  /**
   * LivingEntity.checkFallDamage: a player not in water looks at the fluids again where the move ended. Water alone
   * (updateInWaterStateAndDoWaterCurrentPushing) until 26.1 made it the whole updateFluidInteraction, lava included.
   */
  protected fluidsAfterMove(ctx: EPhysicsCtx, world: World) {
    this.fluidPhysics(ctx, world, true);
    if (!this.verLessThan("26.1")) this.fluidPhysics(ctx, world, false);
  }

  getFlow(block: Block, world: World) {
    if (!this.verLessThan("1.13")) return this.getFlowModern(block, world);
    const curlevel = this.getRenderedDepth(block);
    let flow = new Vec3(0, 0, 0);
    for (const [dx, dz] of [
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ]) {
      const adjBlock = world.getBlock(block.position.offset(dx, 0, dz));
      const adjLevel = this.getRenderedDepth(adjBlock);
      if (adjLevel < 0) {
        // (the neighbour's material does not block movement: the client's own test, 1.8 - 1.12)
        const blocksMovement = this.legacyShapes.flowBlocksMovement(adjBlock) ?? (adjBlock == null || adjBlock.boundingBox !== "empty");
        if (!blocksMovement) {
          const adjLevel = this.getRenderedDepth(world.getBlock(block.position.offset(dx, -1, dz)));
          if (adjLevel >= 0) {
            const f = adjLevel - (curlevel - 8);
            flow.x += dx * f;
            flow.z += dz * f;
          }
        }
      } else {
        const f = adjLevel - curlevel;
        flow.x += dx * f;
        flow.z += dz * f;
      }
    }

    // Match Grim's FluidTypeFlowing: only actual water/lava block states carry
    // a falling fluid level. Waterlogged and source-like blocks use unrelated metadata.
    const hasFluidLevel = [this.waterId, this.flowingWaterId, this.lavaId, this.flowingLavaId].includes(block.type);
    if (hasFluidLevel && block.metadata >= 8) {
      for (const [dx, dz] of [
        [0, 1],
        [-1, 0],
        [0, -1],
        [1, 0],
      ]) {
        const adjBlock = world.getBlock(block.position.offset(dx, 0, dz));
        const adjUpBlock = world.getBlock(block.position.offset(dx, 1, dz));
        // (BlockLiquid.isBlockSolid; 1.12 causesDownwardCurrent: the client's own test, 1.8 - 1.12)
        const solid = (b: Block | null) => this.legacyShapes.flowSolid(b) ?? (b != null && b.boundingBox !== "empty");
        if (solid(adjBlock) || solid(adjUpBlock)) {
          flow = this.normalizeVec(flow).translate(0, -6, 0); // Vec3d.normalize: float square root
          break;
        }
      }
    }

    return this.normalizeVec(flow);
  }

  /**
   * FlowingFluid.getFlow (1.13+): toward each horizontal neighbour (north, east, south, west) that is empty or of the
   * same fluid, the float difference of the fluid's own heights (amount / 9F); a neighbour without fluid that does not
   * block motion compares with the fluid below it, less 0.8888889F (a drop-off). Falling fluid next to a solid face
   * turns down by 6. The sum is normalized as Vec3.normalize.
   */
  private getFlowModern(block: Block, world: World) {
    const f32 = Math.fround;
    const lava = block.type === this.lavaId;
    const fluidOf = (b: Block | null) => (b == null ? null : b.type === this.lavaId ? "lava" : this.getRenderedDepth(b) >= 0 ? "water" : null);
    const own = fluidOf(block);
    const amount = (b: Block) => {
      // waterlogged blocks and water plants hold a source; a fluid block's level drops its amount, falling is full
      if (b.type !== this.waterId && b.type !== this.lavaId) return 8;
      return b.metadata >= 8 ? 8 : 8 - b.metadata;
    };
    const ownHeight = (b: Block | null) => (b != null && fluidOf(b) === own ? f32(amount(b) / 9) : 0);
    const affectsFlow = (b: Block | null) => b == null || fluidOf(b) == null || fluidOf(b) === own;
    const blocksMotion = (b: Block | null) =>
      b != null && ((b.boundingBox === "block" && b.type !== this.webId) || /sign|banner|pressure_plate/.test(b.name));
    const height = ownHeight(block);
    let x = 0.0;
    let z = 0.0;
    const directions = [
      [0, -1], // north
      [1, 0], // east
      [0, 1], // south
      [-1, 0], // west
    ];
    for (const [dx, dz] of directions) {
      const neighbourPos = block.position.offset(dx, 0, dz);
      const neighbour = world.getBlock(neighbourPos);
      if (!affectsFlow(neighbour)) continue;
      let neighbourHeight = ownHeight(neighbour);
      let difference = 0;
      if (neighbourHeight === 0) {
        if (!blocksMotion(neighbour)) {
          const below = world.getBlock(neighbourPos.offset(0, -1, 0));
          if (affectsFlow(below)) {
            neighbourHeight = ownHeight(below);
            if (neighbourHeight > 0) difference = f32(height - f32(neighbourHeight - f32(0.8888889)));
          }
        }
      } else if (neighbourHeight > 0) {
        difference = f32(height - neighbourHeight);
      }
      if (difference !== 0) {
        x += f32(dx * difference);
        z += f32(dz * difference);
      }
    }
    let flow = new Vec3(x, 0, z);
    const falling = (block.type === this.waterId || lava) && block.metadata >= 8;
    if (falling) {
      const isSolidFace = (b: Block | null) =>
        b != null && fluidOf(b) !== own && b.name !== "ice" && b.name !== "frosted_ice" && b.boundingBox !== "empty";
      for (const [dx, dz] of directions) {
        const neighbourPos = block.position.offset(dx, 0, dz);
        if (isSolidFace(world.getBlock(neighbourPos)) || isSolidFace(world.getBlock(neighbourPos.offset(0, 1, 0)))) {
          flow = this.normalizeVec(flow).translate(0, -6, 0);
          break;
        }
      }
    }
    return this.normalizeVec(flow);
  }

  /** Vec3.length: a float square root before 1.17 (Mth.sqrt). */
  private vecLength(v: Vec3) {
    const sum = v.x * v.x + v.y * v.y + v.z * v.z;
    return this.verLessThan("1.17") ? Math.fround(Math.sqrt(sum)) : Math.sqrt(sum);
  }

  /** Vec3.normalize: a float square root before 1.17; zero below 1e-4, below 1e-5F from 1.21.2. */
  private normalizeVec(v: Vec3) {
    const length = this.vecLength(v);
    if (length < (this.verLessThan("1.21.2") ? 1e-4 : 9.999999747378752e-6)) return new Vec3(0, 0, 0);
    return new Vec3(v.x / length, v.y / length, v.z / length);
  }

  /**
   * The item use the player let go of this tick, before its tick (Minecraft.handleKeybinds ->
   * LocalPlayer.releaseUsingItem -> TridentItem.releaseUsing, 1.13+): a riptide trident used for 10 ticks or more,
   * in water, pushes the player along the float look vector by 3 * (1 + level) / 4 (the riptide spin attack strength
   * from 1.21: 1.5 + 0.75 per level above the first), starts the 20-tick spin attack, and lifts a player on the ground
   * by 1.1999999. `itemUseTicks` counts the ticks of the current use (getUseDuration - useItemRemainingTicks).
   */
  private releaseUsingItem(ctx: EPhysicsCtx, world: World) {
    const player = ctx.state as PlayerState;
    if (player.isUsingItem) {
      player.itemUseTicks++;
      return;
    }
    const useTicks = player.itemUseTicks;
    player.itemUseTicks = 0;
    // (rain also lets a riptide trident launch; the engine does not know the weather)
    if (this.verLessThan("1.13") || useTicks < 10 || player.riptide <= 0 || !player.isInWater) return;
    const f32 = Math.fround;
    const yaw = floatRadians(this.yawDegrees(player));
    const pitch = f32(this.pitchDegrees(player) * f32(0.017453292));
    let x = f32(-this.mth.sin(yaw) * this.mth.cos(pitch));
    let y = -this.mth.sin(pitch);
    let z = f32(this.mth.cos(yaw) * this.mth.cos(pitch));
    const length = f32(Math.sqrt(f32(f32(f32(x * x) + f32(y * y)) + f32(z * z))));
    const strength = this.verLessThan("1.21")
      ? f32(3 * f32(f32(1 + player.riptide) / 4))
      : f32(f32(1.5) + f32(f32(0.75) * (player.riptide - 1)));
    const scale = f32(strength / length);
    x = f32(x * scale);
    y = f32(y * scale);
    z = f32(z * scale);
    player.vel.translate(x, y, z); // Entity.push
    player.autoSpinAttackTicks = 20;
    if (player.onGround) this.applyMovement(ctx, world, new Vec3(0, 1.1999999284744263, 0));
  }

  /**
   * Entity.handleWaterMovement before 1.13: World.handleMaterialAcceleration over the box shrunk by 0.4F vertically
   * and 0.001 all round. A water block (any level) counts when ceil(box maxY) reaches its float top
   * (y + 1 - (level + 1) / 9F); the flows of the counted blocks are summed and normalized (float square root), and
   * push by 0.014. The eyes are in water (isInsideOfMaterial) below the water top plus 0.11111111F.
   */
  private handleWaterMovementLegacy(player: PlayerState, world: World) {
    const f32 = Math.fround;
    const isWater = (block: Block | null) => block != null && (block.type === this.waterId || block.type === this.flowingWaterId);
    const heightPercent = (block: Block) => f32(((block.metadata >= 8 ? 0 : block.metadata) + 1) / 9);
    const bb = getCollider(player.pose, player.pos).expand(-0.001, -f32(0.4) - 0.001, -0.001);
    const maxY = Math.ceil(bb.maxY);
    const flow = new Vec3(0, 0, 0);
    const cursor = new Vec3(0, 0, 0);
    let inWater = false;
    for (cursor.x = Math.floor(bb.minX); cursor.x < Math.ceil(bb.maxX); cursor.x++) {
      for (cursor.y = Math.floor(bb.minY); cursor.y < maxY; cursor.y++) {
        for (cursor.z = Math.floor(bb.minZ); cursor.z < Math.ceil(bb.maxZ); cursor.z++) {
          const block = world.getBlock(cursor);
          if (block == null || !isWater(block)) continue;
          if (maxY >= f32(cursor.y + 1 - heightPercent(block))) {
            inWater = true;
            flow.add(this.getFlow(block, world));
          }
        }
      }
    }
    player.isInWater = inWater;
    const length = f32(Math.sqrt(flow.x * flow.x + flow.y * flow.y + flow.z * flow.z));
    if (length >= 1e-4 && !player.flying) {
      player.vel.x += (flow.x / length) * 0.014;
      player.vel.y += (flow.y / length) * 0.014;
      player.vel.z += (flow.z / length) * 0.014;
    }
    const eyeY = player.pos.y + player.eyeHeight;
    const eyeBlock = world.getBlock(new Vec3(player.pos.x, eyeY, player.pos.z));
    player.isUnderWater =
      eyeBlock != null && isWater(eyeBlock) && eyeY < f32(eyeBlock.position.y + 1 - f32(heightPercent(eyeBlock) - f32(0.11111111)));
  }

  /**
   * Entity.isInLava before 1.14: any lava block, whatever its level, in the box shrunk by 0.1F sideways and 0.4F
   * vertically (World.isMaterialInBB / containsMaterial, the cells floor(min) to ceil(max) exclusive). Vanilla asks
   * it live, so it holds for the position before the move during the tick and is asked again after it.
   */
  private isInLavaLegacy(player: PlayerState, world: World) {
    const bb = getCollider(player.pose, player.pos).expand(-Math.fround(0.1), -Math.fround(0.4), -Math.fround(0.1));
    const cursor = new Vec3(0, 0, 0);
    for (cursor.x = Math.floor(bb.minX); cursor.x < Math.ceil(bb.maxX); cursor.x++) {
      for (cursor.y = Math.floor(bb.minY); cursor.y < Math.ceil(bb.maxY); cursor.y++) {
        for (cursor.z = Math.floor(bb.minZ); cursor.z < Math.ceil(bb.maxZ); cursor.z++) {
          const type = world.getBlock(cursor)?.type;
          if (type === this.lavaId || type === this.flowingLavaId) return true;
        }
      }
    }
    return false;
  }

  /**
   * Entity.updateFluidOnEyes (1.13+), run at the tick start after the fluid states: whether the water at the eyes'
   * block reaches them, and isUnderWater. 1.13 - 1.15 compare the eyes with the water top plus 0.11111111F and take
   * the result at once; 1.16+ look 0.1111111119389534 below the eyes (none from 1.21), and isUnderWater is the eye
   * state of the tick before (wasEyeInWater) while in water.
   */
  private updateFluidOnEyes(player: PlayerState, world: World) {
    const f32 = Math.fround;
    const wasEyeInWater = player.eyeInWater ?? player.isUnderWater;
    let eyeY = player.pos.y + f32(player.eyeHeight);
    if (!this.verLessThan("1.16") && this.verLessThan("1.21")) eyeY -= 0.1111111119389534;
    const block = world.getBlock(new Vec3(player.pos.x, eyeY, player.pos.z));
    let eyeInWater = false;
    if (block != null && this.getRenderedDepth(block) >= 0) {
      const y = block.position.y;
      const height = this.getWaterHeight(block, world);
      if (this.verLessThan("1.14")) eyeInWater = eyeY < f32(y + f32(height + f32(0.11111111)));
      else if (this.verLessThan("1.16")) eyeInWater = eyeY < f32(f32(y + height) + f32(0.11111111));
      else eyeInWater = f32(y + height) > eyeY;
    }
    player.eyeInWater = eyeInWater;
    player.isUnderWater = (this.verLessThan("1.16") ? eyeInWater : wasEyeInWater) && player.isInWater;
  }

  /**
   * FluidState.getHeight of water: the float amount / 9F (a source or falling water holds 8), or 1 under more water
   * from 1.14.
   */
  private getWaterHeight(block: Block, world: World) {
    if (!this.verLessThan("1.14")) {
      const above = world.getBlock(block.position.offset(0, 1, 0));
      if (above != null && this.getRenderedDepth(above) >= 0) return 1;
    }
    return Math.fround((8 - this.getRenderedDepth(block)) / 9);
  }

  /** FlowingFluid.getOwnHeight: the float amount / 9F (a source, waterlogged block or falling fluid holds 8). */
  private ownFluidHeight(block: Block) {
    const fluidBlock = block.type === this.waterId || block.type === this.lavaId;
    const amount = !fluidBlock || block.metadata >= 8 ? 8 : 8 - block.metadata;
    return Math.fround(amount / 9);
  }

  getLiquidHeightPcent(block: Block) {
    // lava drops by its level like water (FlowingFluid.getOwnHeight: amount / 9, falling lava full)
    const depth = block.type === this.lavaId ? (block.metadata >= 8 ? 0 : block.metadata) : this.getRenderedDepth(block);
    return 1 - (depth + 1) / 9;
  }

  getRenderedDepth(block: Block) {
    if (!block) return -1;
    if (this.waterLike.has(block.type)) return 0;
    if (block.getProperties().waterlogged) return 0;
    // (BlockLiquid.getEffectiveFlowDecay before 1.13: any block of water's material, flowing or still)
    if (block.type !== this.waterId && block.type !== this.flowingWaterId) return -1;
    const meta = block.metadata;
    return meta >= 8 ? 0 : meta;
  }

  private updateSwimming(player: PlayerState, world: World) {
    if (this.verLessThan("1.13")) {
      player.swimming = false; // swimming came with 1.13
    } else if (player.flying) {
      player.swimming = false;
    } else if (player.swimming) {
      player.swimming = player.sprinting && player.isInWater;
    } else {
      const block = world.getBlock(player.pos);
      player.swimming =
        player.sprinting &&
        player.isUnderWater &&
        block != null &&
        !!(block.type === this.waterId || this.waterLike.has(block.type) || block.getProperties().waterlogged);
    }
  }

  /**
   * Whether the sneak slowdown applies to this tick's input. 1.15+: LocalPlayer.isMovingSlowly, crouching (taken from
   * the sneak key of the tick before) or crawling; 1.14's KeyboardInput also slows by the sneak key read this tick.
   * Before 1.14 MovementInputFromOptions slows by the sneak key of the tick itself.
   */
  private isMovingSlowly(ctx: EPhysicsCtx, world: World) {
    const player = ctx.state as PlayerState;
    if (this.verGreaterThan("1.13.2")) {
      const visuallyCrawling =
        (player.pose === PlayerPoses.SWIMMING || (!player.fallFlying && player.pose === PlayerPoses.FALL_FLYING)) &&
        !player.isInWater;
      if (this.verLessThan("1.15") && player.control.sneak) return true;
      return player.crouching || visuallyCrawling;
    }

    return player.control.sneak;
  }

  private localPlayerAIStep(ctx: EPhysicsCtx, world: World) {
    const player = ctx.state as PlayerState;
    // before 1.19.4 Player.aiStep sets the air speed after travel: the sprint of the tick before moves this tick
    const sprintedBefore = player.sprinting;
    const tickStartedOnGround = player.onGround;
    const heading = convInpToAxes(player);
    player.heading = heading;
    // LocalPlayer.aiStep: the jump auto-jump queued the tick before is pressed now
    const autoJumping = player.autoJumpTime > 0;
    if (autoJumping) player.autoJumpTime--;
    player.autoJumping = autoJumping;

    // moved into AiStep since it's tied to player behavior. Strictly, is Player::updateSwimming.
    this.updateSwimming(player, world);

    // Entity.baseTick: the powder snow the last block effects touched becomes the previous tick's
    player.wasInPowderSnow = player.isInPowderSnow;
    player.isInPowderSnow = false;

    // Entity.baseTick: touching water ends a fall, lava halves it
    if (player.isInWater) player.fallDistance = 0;
    if (player.isInLava) player.fallDistance *= 0.5;

    this.inputsToCrouch(ctx, heading, world);
    // the input's move vector as LocalPlayer.updateAutoJump reads it
    const moveVector = { x: heading.strafe, y: heading.forward };
    this.pushOutOfBlocks(player, world);
    this.inputsToSprint(ctx, heading, world);
    this.inputsToFly(ctx, world);

    // If sneaking in water, add downward speed (LocalPlayer.goDownInWater, 1.13+)
    if (player.isInWater && player.control.sneak && !player.flying && !this.verLessThan("1.13")) {
      player.vel.y -= 0.03999999910593033;
    }

    // LocalPlayer.aiStep: flying up and down by the float flyingSpeed * 3.0F; before 1.14 sneak and jump each apply it
    if (player.flying) {
      const impulse = Math.fround(Math.fround(player.flySpeed) * 3.0);
      if (this.verLessThan("1.14")) {
        if (player.control.sneak) player.vel.y -= impulse;
        if (player.control.jump) player.vel.y += impulse;
      } else {
        const direction = (player.control.jump ? 1 : 0) - (player.control.sneak ? 1 : 0);
        if (direction !== 0) player.vel.y += direction * impulse;
      }
    }

    // player::AiStep
    {
      player.flyJumpTriggerTime = Math.max(0, player.flyJumpTriggerTime - 1);
    }

    // livingEntity::AiStep
    {
      player.jumpTicks = Math.max(0, player.jumpTicks - 1);
      // the velocity below which an axis stops: 0.005 before 1.9 (EntityLivingBase.onLivingUpdate)
      const negligeableVelocity = this.verLessThan("1.9") ? 0.005 : ctx.worldSettings.negligeableVelocity;
      if (this.verGreaterThan("1.21.4")) {
        const horizontalVelocitySqr = player.vel.x * player.vel.x + player.vel.z * player.vel.z;
        const movementThresholdSqr = negligeableVelocity * negligeableVelocity;
        if (horizontalVelocitySqr < movementThresholdSqr) {
          player.vel.x = 0;
          player.vel.z = 0;
        }
      } else {
        if (Math.abs(player.vel.x) < negligeableVelocity) {
          player.vel.x = 0;
        }
        if (Math.abs(player.vel.z) < negligeableVelocity) {
          player.vel.z = 0;
        }
      }
      if (Math.abs(player.vel.y) < negligeableVelocity) {
        player.vel.y = 0;
      }

      this.inputsToJump(player, world, ctx.worldSettings, autoJumping);

      if (this.verGreaterThan("1.21.4")) {
        this.modifyInput(ctx, heading, world);
      } else {
        // LivingEntity.aiStep: xxa and zza are floats, scaled by 0.98F. forward-axis is forward, left-axis = strafe.
        heading.forward = Math.fround(heading.forward * Math.fround(0.98));
        heading.strafe = Math.fround(heading.strafe * Math.fround(0.98));
      }

      // Compensate water downward speed depending on looking direction (?)

      this.applySwimmingVerticalSteering(ctx, world);


      // Refresh pose before movement so the first fall-flying tick uses the
      // correct collider instead of the standing bounding box. Not before 1.17: vanilla changes the pose only in
      // Player.updatePlayerPose at the end of the tick, and the kept box shows when it was refitted.
      if (this.verGreaterThan("1.13.2") && !this.verLessThan("1.17")) {
        this.updatePoses(ctx, world);
      }

      if (player.slowFalling > 0 || player.levitation > 0) player.fallDistance = 0;
      const velY = player.vel.y;
      const { x: startX, z: startZ } = player.pos;
      this.movePlayer(ctx, world, sprintedBefore); // TODO: should be in player-specific logic??
      this.updateAutoJump(ctx, world, Math.fround(player.pos.x - startX), Math.fround(player.pos.z - startZ), moveVector);
      // LivingEntity.aiStep: the spin attack runs down, and ends on hitting a wall
      if (player.autoSpinAttackTicks > 0) {
        player.autoSpinAttackTicks--;
        if (player.isCollidedHorizontally) player.autoSpinAttackTicks = 0;
      }
      // before 1.14 isInLava is asked live: after the move it tells the new position
      if (this.verLessThan("1.14")) player.isInLava = this.isInLavaLegacy(player, world);
      // LivingEntity.aiStep: applyEffectsFromBlocks after travel (1.21.2+)
      if (!this.verLessThan("1.21.2")) {
        this.stepOn(player, world);
        if (!player.flying) this.checkInsideBlocks(player, world, ctx.worldSettings);
      }
      if (player.flying) {
        player.vel.y = 0.6 * velY;
        player.fallDistance = 0;
        /* player->SetDataSharedFlagsIdImpl(EntitySharedFlagsId::FallFlying, false); */ player.fallFlying = false;
      }

      player.onClimbable = this.isInClimbable(player, world);
    } // !livingplayer::AiStep

    if (player.onGround && player.flying && player.gameMode !== "spectator") {
      player.flying = false;
      // onUpdateAbilities();
    }

    // Gen: pretty sure mobs can't spawn or exist outside world borders. this should be fine in here.
    player.pos.x = math.clamp(-2.9999999e7, player.pos.x, 2.9999999e7);
    player.pos.z = math.clamp(-2.9999999e7, player.pos.z, 2.9999999e7);

    if (this.verGreaterThan("1.13.2")) {
      this.updatePoses(ctx, world);
    } else {
      this.updateLegacySize(player, world);
    }

    // Preserve the current inputs for the next tick after all previous-state
    // consumers in this tick have already read the prior values.
    player.lastOnGround = player.onGround;
    player.prevHeading.forward = heading.forward;
    player.prevHeading.strafe = heading.strafe;
    player.prevControl.jump = player.control.jump;
    player.prevControl.sneak = player.control.sneak;

  }

  private inputsToCrouch(ctx: EPhysicsCtx, heading: Heading, world: World) {
    const player = ctx.state as PlayerState;
    if (this.verGreaterThan("1.13.2")) {
      const sneakBb = getCollider(PlayerPoses.SNEAKING, player.pos, player.scale);
      const standBb = getCollider(PlayerPoses.STANDING, player.pos, player.scale);
      sneakBb.expand(-1e-7, -1e-7, -1e-7);
      standBb.expand(-1e-7, -1e-7, -1e-7);

      player.crouching =
        !this.isSwimmingAndNotFlying(ctx, world) &&
        this.worldIsFree(world, sneakBb, true) &&
        (player.prevControl.sneak || !this.worldIsFree(world, standBb, true));
    } else {
      player.crouching = !this.isSwimmingAndNotFlying(ctx, world) && player.prevControl.sneak;
    }



    // Determine if moving slowly
    const isMovingSlowly = this.isMovingSlowly(ctx, world);

    // 1.21.4 only: LocalPlayer.shouldStopSprinting, right after the input's tick: blindness, moving slowly or using an
    // item out of water ends a sprint (vanilla's also checks isFallFlying and isPassenger && !isRidingCamel, not
    // modelled here). 1.21.5 dropped it: sneaking and item use keep a sprint, blindness stops it in
    // shouldStopRunSprinting.
    if (this.verGreaterThan("1.21.3") && this.verLessThan("1.21.5")) {
      // TODO: just use stored blindness effect.
      const hasBlindness = this.getEffectLevel(CheapEffects.BLINDNESS, player.effects) > 0;
      const usingItem = player.isUsingItem && !player.isUnderWater;
      if (hasBlindness || isMovingSlowly || usingItem) {
        this.setSprinting(ctx, false);
      }
    }

    // 1.21.5+: KeyboardInput.tick's move vector is normalized; the slowdowns come in LocalPlayer.modifyInput
    if (this.verGreaterThan("1.21.4")) {
      const f32 = Math.fround;
      const length = f32(Math.sqrt(f32(f32(heading.strafe * heading.strafe) + f32(heading.forward * heading.forward))));
      heading.strafe = length < f32(1.0e-4) ? 0 : f32(heading.strafe / length);
      heading.forward = length < f32(1.0e-4) ? 0 : f32(heading.forward / length);
      return;
    }

    // the impulses are floats: (float)(impulse * factor)
    const slowInput = (factor: number) => {
      heading.forward = Math.fround(heading.forward * factor);
      heading.strafe = Math.fround(heading.strafe * factor);
    };
    // LocalPlayer.aiStep: using an item slows the input by 0.2F, after the sneak slowdown of the input's tick, from
    // 1.21.4 before the sneak slowdown that moved out of it
    const usingItemFirst = this.verGreaterThan("1.21.3");
    if (player.isUsingItem && usingItemFirst) slowInput(Math.fround(0.2));
    if (isMovingSlowly) slowInput(this.sneakingSpeedFactor(player));
    if (player.isUsingItem && !usingItemFirst) slowInput(Math.fround(0.2));
  }

  /**
   * LocalPlayer.isSlowDueToUsingItem: an item in use whose use effects do not let a sprint go on (1.21.11 UseEffects
   * .canSprint: a spear's do), which keeps a sprint from starting and closes the double tap window.
   */
  private isSlowDueToUsingItem(player: PlayerState) {
    return player.isUsingItem && !player.useItemCanSprint;
  }

  /**
   * 1.21.5+ LocalPlayer.modifyInput, the float move vector: scaled by 0.98F, item use and the sneak slowdown, then stretched
   * towards the unit square (modifyInputSpeedForSquareMovement), so a diagonal is as fast as a straight move.
   */
  private modifyInput(ctx: EPhysicsCtx, heading: Heading, world: World) {
    const f32 = Math.fround;
    const player = ctx.state as PlayerState;
    let x = heading.strafe;
    let y = heading.forward;
    if (f32(f32(x * x) + f32(y * y)) === 0) return;
    const scale = (factor: number) => {
      x = f32(x * factor);
      y = f32(y * factor);
    };
    scale(f32(0.98));
    // (the item's use effects: 0.2F but for a spear's, 1.21.11 LocalPlayer.itemUseSpeedMultiplier)
    if (player.isUsingItem) scale(player.useItemSpeedMultiplier);
    if (this.isMovingSlowly(ctx, world)) scale(this.sneakingSpeedFactor(player));

    const length = f32(Math.sqrt(f32(f32(x * x) + f32(y * y))));
    if (length > 0) {
      scale(f32(1 / length));
      const absX = Math.abs(x);
      const absY = Math.abs(y);
      const ratio = absY > absX ? f32(absX / absY) : f32(absY / absX);
      const toUnitSquare = f32(Math.sqrt(f32(1 + f32(ratio * ratio))));
      scale(Math.min(f32(length * toUnitSquare), 1));
    }
    heading.strafe = x;
    heading.forward = y;
  }

  /** An attribute's value with its modifiers, clamped to its range (RangedAttribute.sanitizeValue). */
  private attributeValue(key: string, attribute: Parameters<typeof attributes.getAttributeValue>[0]): number {
    if (this.attributeRanges == null) {
      this.attributeRanges = new Map();
      for (const [name, data] of Object.entries(this.data.attributesByName)) {
        this.attributeRanges.set(extractAttribute(this, name), data as unknown as { min: number; max: number });
      }
    }
    return attributes.getAttributeValue(attribute, this.attributeRanges.get(key));
  }

  private attributeRanges?: Map<string, { min: number; max: number }>;

  /**
   * The factor of the sneak slowdown: before 1.19 KeyboardInput's 0.3D; 1.19 - 1.20 the float
   * Mth.clamp(0.3F + 0.15F * swift sneak level, 0F, 1F); since, the sneaking speed attribute as a float.
   */
  private sneakingSpeedFactor(player: PlayerState): number {
    const f32 = Math.fround;
    if (this.verLessThan("1.19")) return 0.3;
    if (this.verLessThan("1.21")) return Math.min(Math.max(f32(f32(0.3) + f32(player.swiftSneak * f32(0.15))), 0), 1);
    const synced = player.attributes?.[this.sneakingSpeedAttribute];
    return f32(synced ? this.attributeValue(this.sneakingSpeedAttribute, synced) : 0.3);
  }

  private isSwimmingAndNotFlying(ctx: EPhysicsCtx, world: World): boolean {
    const entity = ctx.state;
    //  return !player->flying &&
    // player->game_mode != GameType::Spectator &&
    // player->GetDataSharedFlagsIdImpl(EntitySharedFlagsId::Swimming);

    if (entity instanceof PlayerState) {
      return !entity.flying && entity.gameMode !== "spectator" && entity.swimming;
    } else {
      return false; // TODO: proper handling of non-player mobs.
    }
  }

  private applySwimmingVerticalSteering(ctx: EPhysicsCtx, world: World) {
    const player = ctx.state as PlayerState;
    if (!this.isSwimmingAndNotFlying(ctx, world)) return;

    const lookY = this.lookAngle(player).y;
    let shouldAdjust = lookY < 0.0 || player.control.jump;
    if (!shouldAdjust) {
      const blockAbove = world.getBlock(new Vec3(player.pos.x, player.pos.y + 1.0 - 0.1, player.pos.z));
      shouldAdjust = blockAbove != null && (this.waterId === blockAbove.type || this.waterLike.has(blockAbove.type));
    }

    if (shouldAdjust) {
      player.vel.y += (lookY - player.vel.y) * (lookY < -0.2 ? 0.085 : 0.06);
    }
  }

  private inputsToSprint(ctx: EPhysicsCtx, heading: Heading, world: World) {
    const player = ctx.state as PlayerState;

    // LocalPlayer.aiStep: the sprint key starts a sprint, and so does a double tap of forward: a fresh forward press
    // opens a 7-tick window (sprintTriggerTime) in which the next one sprints. Item use (and 1.16+ the sneak key of
    // the tick before, 1.21.5+ the back key) closes it.
    if (player.sprintTriggerTime > 0) player.sprintTriggerTime--;
    const prevSneakKey = player.prevControl.sneak;
    if (
      this.isSlowDueToUsingItem(player) ||
      (this.verGreaterThan("1.15.2") && prevSneakKey) ||
      (this.verGreaterThan("1.21.4") && player.control.back)
    ) {
      player.sprintTriggerTime = 0;
    }
    const canStart = this.canStartSprinting(ctx, heading, world);
    const prevImpulse = player.prevForwardImpulse;
    player.prevForwardImpulse = heading.forward;
    if (this.verGreaterThan("1.21.4")) {
      if (canStart) {
        if (!(prevImpulse > 1e-5)) {
          if (player.sprintTriggerTime > 0) this.setSprinting(ctx, true);
          else player.sprintTriggerTime = 7;
        }
        if (player.control.sprint) this.setSprinting(ctx, true);
      }
    } else {
      // forward was enough to sprint the tick before (1.14+ by this tick's eyes in water); 1.13+ also under water
      const prevEnough = this.verGreaterThan("1.13.2") && player.isUnderWater ? prevImpulse > 1e-5 : prevImpulse >= 0.8;
      const onGroundOrUnderWater = player.onGround || (this.verGreaterThan("1.12.2") && player.isUnderWater);
      if (canStart && onGroundOrUnderWater && !prevSneakKey && !prevEnough) {
        if (player.sprintTriggerTime <= 0 && !player.control.sprint) player.sprintTriggerTime = 7;
        else this.setSprinting(ctx, true);
      }
      if (canStart && player.control.sprint) this.setSprinting(ctx, true);
    }

    // console.log('should stop', this.shouldStopRunSprinting(ctx, heading), 'minor collision', player.isCollidedHorizontallyMinor)
    // Stop sprinting if necessary
    // (releasing the sprint key does not stop a sprint)
    if (player.sprinting) {
      if (this.verLessThan("1.13")) {
        // EntityPlayerSP.onLivingUpdate: forward below 0.8, a horizontal collision or hunger stops it
        if (heading.forward < 0.8 || player.isCollidedHorizontally || !this.hasEnoughFoodToSprint(ctx)) {
          this.setSprinting(ctx, false);
        }
      } else if (this.isSwimming(ctx)) {
        if (this.shouldStopSwimSprinting(ctx, heading)) {
          this.setSprinting(ctx, false);
        }
      } else if (this.shouldStopRunSprinting(ctx, heading)) {
        this.setSprinting(ctx, false);
      }
    }
  }

  private canStartSprinting(ctx: EPhysicsCtx, heading: Heading, world: World): boolean {
    const player = ctx.state as PlayerState;
    // 1.21.5+ the impulse is no longer slowed when this is checked, so crawling keeps a sprint from starting too
    const movingSlowly = this.verGreaterThan("1.21.4") ? this.isMovingSlowly(ctx, world) : player.crouching;
    return !player.sprinting &&
      this.hasEnoughImpulseToStartSprinting(player, heading) &&
      this.hasEnoughFoodToSprint(ctx) &&
      !this.isSlowDueToUsingItem(player) &&
      !player.blindness &&
      //  (!player.isPassenger || this.vehicleCanSprint(ctx)) &&
      (!movingSlowly || player.isUnderWater) &&
      // (before 1.13 neither gliding nor water keeps a sprint from starting)
      (this.verLessThan("1.13") || ((!player.fallFlying || player.isUnderWater) && (!player.isInWater || player.isUnderWater)));
  }

  // 1.21.5+ any forward impulse (ClientInput.hasForwardImpulse, of the normalized move vector); 1.14+ 0.8 out of
  // water; before, 0.8 everywhere
  private hasEnoughImpulseToStartSprinting(player: PlayerState, heading: Heading): boolean {
    if (this.verGreaterThan("1.21.4")) return heading.forward > 1e-5;
    if (this.verLessThan("1.14")) return heading.forward >= 0.8;
    return heading.forward >= (player.isInWater ? 1e-5 : 0.8);
  }

  private hasEnoughFoodToSprint(ctx: EPhysicsCtx): boolean {
    const player = ctx.state as PlayerState;
    return /* player.isPassenger ||*/ player.food > 6 || player.mayFly;
  }

  private vehicleCanSprint(ctx: EPhysicsCtx): boolean {
    return false;
    // const player = ctx.state as PlayerState;
    // return player.vehicle &&
    //        player.vehicle.canSprint &&
    //        player.vehicle.isLocalInstanceAuthoritative;
  }

  /** Entity.isSwimming: the swimming flag updateSwimming keeps, not whether the player is under water. */
  private isSwimming(ctx: EPhysicsCtx): boolean {
    const player = ctx.state as PlayerState;
    return player.swimming;
  }

  private handleFallFlyingCollisions(player: PlayerState, previousHorizontalSpeed: number) {
    if (!player.isCollidedHorizontally) return;

    const currentHorizontalSpeed = Math.sqrt(player.vel.x * player.vel.x + player.vel.z * player.vel.z);
    const deltaSpeed = previousHorizontalSpeed - currentHorizontalSpeed;
    const collisionDamage = deltaSpeed * 10.0 - 3.0;

    if (collisionDamage > 0.0) {
      // Vanilla applies fly-into-wall damage and sound here.
      // BotcraftPhysics currently does not model those side effects.
    }
  }

  /**
   * Entity.getLookAngle: the view vector from Mth.sin/cos of the float rotation. Before 1.13 getVectorForRotation
   * turned it by -yaw - PI and negated the pitch's cosine instead.
   */
  protected lookAngle(player: PlayerState): { x: number; y: number; z: number } {
    const f32 = Math.fround;
    const degToRad = f32(0.017453292);
    const yaw = this.yawDegrees(player);
    const pitch = this.pitchDegrees(player);
    if (this.verLessThan("1.13")) {
      const yawRad = f32(f32(f32(-yaw) * degToRad) - f32(Math.PI));
      const pitchRad = f32(f32(-pitch) * degToRad);
      const pitchCos = -this.mth.cos(pitchRad);
      return {
        x: f32(this.mth.sin(yawRad) * pitchCos),
        y: this.mth.sin(pitchRad),
        z: f32(this.mth.cos(yawRad) * pitchCos),
      };
    }
    const pitchRad = f32(pitch * degToRad);
    const yawRad = f32(f32(-yaw) * degToRad);
    const pitchCos = this.mth.cos(pitchRad);
    return {
      x: f32(this.mth.sin(yawRad) * pitchCos),
      y: -this.mth.sin(pitchRad),
      z: f32(this.mth.cos(yawRad) * pitchCos),
    };
  }

  /**
   * LivingEntity.travel's fall flying (updateFallFlyingMovement since 1.21.2): lift from the squared cosine of the
   * pitch (Mth.cos as a float before 1.18.2, Java's Math.cos in double since), the dive turned into speed, the climb
   * paid for by it, and the motion turned toward the look direction.
   */
  private updateFallFlyingMovement(player: PlayerState, gravity: number) {
    const f32 = Math.fround;
    const vel = player.vel;
    const look = this.lookAngle(player);
    const pitchRad = f32(this.pitchDegrees(player) * f32(0.017453292));
    const lookHorizontal = Math.sqrt(look.x * look.x + look.z * look.z);
    const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    // min(1, |look| / 0.4) until 1.21.2: 1 for the unit look vector
    const lookFactor = Math.min(1.0, Math.sqrt(look.x * look.x + look.y * look.y + look.z * look.z) / 0.4);
    let lift: number;
    if (this.verLessThan("1.18.2")) {
      const cos = this.mth.cos(pitchRad);
      lift = f32(cos * cos * lookFactor);
    } else {
      const cos = javaTrig.cos(pitchRad);
      lift = cos * cos * (this.verLessThan("1.21.2") ? lookFactor : 1.0);
    }

    if (this.verLessThan("1.13")) {
      vel.y += -0.08 + lift * 0.06;
    } else {
      vel.y += gravity * (-1.0 + lift * 0.75);
    }

    if (vel.y < 0.0 && lookHorizontal > 0.0) {
      const dive = vel.y * -0.1 * lift;
      vel.x += (look.x * dive) / lookHorizontal;
      vel.y += dive;
      vel.z += (look.z * dive) / lookHorizontal;
    }

    // (before 1.13 without the horizontal look check)
    if (pitchRad < 0.0 && (lookHorizontal > 0.0 || this.verLessThan("1.13"))) {
      const climb = horizontalSpeed * -this.mth.sin(pitchRad) * 0.04;
      vel.x += (-look.x * climb) / lookHorizontal;
      vel.y += climb * 3.2;
      vel.z += (-look.z * climb) / lookHorizontal;
    }

    if (lookHorizontal > 0.0) {
      vel.x += ((look.x / lookHorizontal) * horizontalSpeed - vel.x) * 0.1;
      vel.z += ((look.z / lookHorizontal) * horizontalSpeed - vel.z) * 0.1;
    }

    vel.x *= 0.9900000095367432;
    vel.y *= 0.9800000190734863;
    vel.z *= 0.9900000095367432;
  }

  /** FireworkRocketEntity.tick of each of the given rockets: toward 1.5 times the float look vector. */
  private applyFireworkBoost(player: PlayerState, rockets: number) {
    if (player.fireworkRocketDuration <= 0) return;

    if (!player.fallFlying) {
      player.fireworkRocketDuration = 0;
      return;
    }

    const look = this.lookAngle(player);
    for (let i = 0; i < rockets; i++) {
      player.vel.x += look.x * 0.1 + (look.x * 1.5 - player.vel.x) * 0.5;
      player.vel.y += look.y * 0.1 + (look.y * 1.5 - player.vel.y) * 0.5;
      player.vel.z += look.z * 0.1 + (look.z * 1.5 - player.vel.z) * 0.5;
    }
  }

  private shouldStopRunSprinting(ctx: EPhysicsCtx, heading: Heading): boolean {
    const player = ctx.state as PlayerState;
    // (blindness stops a sprint from 1.21.4; before, it only keeps one from starting)
    return (this.verGreaterThan("1.21.3") && player.blindness > 0) ||
      //  (player.isPassenger && !this.vehicleCanSprint(ctx)) ||
      !this.hasForwardImpulseToKeepSprinting(heading) ||
      !this.hasEnoughFoodToSprint(ctx) ||
      (player.isCollidedHorizontally && !player.isCollidedHorizontallyMinor) ||
      (player.isInWater && !player.isUnderWater);
  }

  // 1.14+ any forward impulse keeps a sprint (ClientInput.hasForwardImpulse); 1.13 needs 0.8 as to start one
  private hasForwardImpulseToKeepSprinting(heading: Heading): boolean {
    return this.verLessThan("1.14") ? heading.forward >= 0.8 : heading.forward > 1e-5;
  }

  private shouldStopSwimSprinting(ctx: EPhysicsCtx, heading: Heading): boolean {
    const player = ctx.state as PlayerState;
    return player.blindness > 0 ||
      //  (player.isPassenger && !this.vehicleCanSprint(ctx)) ||
      !player.isInWater ||
      (!this.hasForwardImpulseToKeepSprinting(heading) && !player.onGround && !player.control.sneak) ||
      !this.hasEnoughFoodToSprint(ctx);
  }

  /**
   * TODO: almost certainly unfinished.
   * @param player
   * @param value
   */
  setSprinting(ctx: EPhysicsCtx, value: boolean) {
    const player = ctx.state as PlayerState;
    // LivingEntity.setSprinting: the sprint modifier comes and goes on the movement speed the server synced (a copy,
    // the bot's own stays as the server sent it); without one, the player's default base of 0.1F
    const synced = player.attributes[this.movementSpeedAttribute];
    const attr = synced
      ? { value: synced.value, modifiers: synced.modifiers.slice() }
      : attributes.createAttributeValue(Math.fround(ctx.worldSettings.playerSpeed));
    attributes.deleteAttributeModifier(attr, ctx.worldSettings.sprintingUUID);
    if (value) {
      attributes.addAttributeModifier(attr, {
        uuid: ctx.worldSettings.sprintingUUID,
        amount: ctx.worldSettings.sprintSpeed,
        operation: 2,
      });
    }

    // potential deviation from vanilla.
    // if (value != player.sprinting) {
    //   player.sprintTriggerTime = ctx.worldSettings.sprintTimeTriggerCooldown;
    // }

    player.attributes[this.movementSpeedAttribute] = attr;
    player.sprinting = value;
  }

  private inputsToFly(ctx: EPhysicsCtx, world: World) {
    const player = ctx.state as PlayerState;
    let flyChanged = false;
    if (player.mayFly) {
      // Auto trigger if in spectator mode
      if (player.gameMode === "spectator") {
        player.flying = true;
        flyChanged = true;
        // onUpdateAbilities();
      } else {
        // LocalPlayer.aiStep: a second press of jump within the trigger time toggles flying, unless swimming (1.13+)
        if (!player.prevControl.jump && player.control.jump) {
          if (player.flyJumpTriggerTime === 0) {
            player.flyJumpTriggerTime = ctx.worldSettings.flyJumpTriggerCooldown;
          } else if (this.verLessThan("1.13") || !player.swimming) {
            player.flying = !player.flying;
            // since 1.20.5 starting to fly on the ground jumps from it
            if (player.flying && player.onGround && !this.verLessThan("1.20.5")) this.jumpFromGround(player, world, ctx.worldSettings);
            flyChanged = true;
            // onUpdateAbilities();
            player.flyJumpTriggerTime = 0;
          }
        }
      }
    }

    // (Player.tryToStartFallFlying does not start under levitation from 1.16; 1.15's does)
    const hasLevitationEffect = player.levitation > 0 && !this.verLessThan("1.16");

    // LocalPlayer.aiStep: since 1.15 tryToStartFallFlying starts gliding on the client at once; before, the client
    // only asks and the server's entity data starts it
    if (
      !this.verLessThan("1.15") &&
      player.control.jump &&
      !flyChanged &&
      !player.prevControl.jump &&
      !player.flying &&
      !player.onClimbable &&
      !player.onGround &&
      !player.isInWater &&
      /* !player->GetDataSharedFlagsIdImpl(EntitySharedFlagsId::FallFlying) && */ !player.fallFlying &&
      !hasLevitationEffect
    ) {
      const hasElytra = player.validElytraEquipped;
      if (hasElytra) {
        player.fallFlying = true;
        // https://github.com/adepierre/Botcraft/blob/6c572071b0237c27a85211a246ce10565ef4d80f/botcraft/src/Game/Physics/PhysicsManager.cpp#L792
        // something about setting actions?
      }
    }
  }

  /**
   * LocalPlayer.updateAutoJump (1.10+, with the auto-jump option), after the player's move by dx, dz: walking on the
   * ground into a step between 0.5 and 1.2 (more with jump boost) high, with room above, queues a jump for the next
   * tick. The step is the first block box that the two lines 0.51 above the feet, half a width to each side, cross
   * on the way 7 ticks of speed (at least the move) ahead.
   */
  private updateAutoJump(ctx: EPhysicsCtx, world: World, dx: number, dz: number, moveVector: { x: number; y: number }) {
    const f32 = Math.fround;
    const player = ctx.state as PlayerState;
    if (!player.autoJumpEnabled || this.verLessThan("1.10") || player.autoJumpTime > 0 || !player.onGround) return;
    if (player.control.sneak || (moveVector.x === 0 && moveVector.y === 0)) return;
    if (this.verGreaterThan("1.14.4") && this.getBlockJumpFactor(player, world, ctx.worldSettings) < 1) return;

    const { x, y, z } = player.pos;
    const speed = this.getMovementSpeedAttribute(ctx);
    let dirX = dx;
    let dirZ = dz;
    let lengthSqr = f32(dirX * dirX + dirZ * dirZ);
    const yaw = floatRadians(this.yawDegrees(player));
    if (lengthSqr <= f32(0.001)) {
      const strafe = f32(speed * moveVector.x);
      const forward = f32(speed * moveVector.y);
      const sin = this.mth.sin(yaw);
      const cos = this.mth.cos(yaw);
      dirX = f32(f32(strafe * cos) - f32(forward * sin));
      dirZ = f32(f32(forward * cos) + f32(strafe * sin));
      lengthSqr = f32(dirX * dirX + dirZ * dirZ);
      if (lengthSqr <= f32(0.001)) return;
    }
    const invLength = f32(1 / Math.sqrt(lengthSqr));
    dirX *= invLength;
    dirZ *= invLength;
    // facing at most a little away from the way it goes
    const cosPitch = this.mth.cos(floatRadians(Math.fround((-player.pitch * 180) / Math.PI)));
    if (f32(-this.mth.sin(yaw) * cosPitch * dirX + this.mth.cos(yaw) * cosPitch * dirZ) < f32(-0.15)) return;

    // the block's collision box (before 1.13 BlockState.getCollisionBoundingBox, its actual state's among its
    // neighbours: a fence's a block high), or null
    const collisionBox = (pos: Vec3): number[] | null => {
      const block = world.getBlock(pos);
      if (block == null) return null;
      if (this.legacyShapes.hasCollisionBox) {
        return this.legacyShapes.collisionBox(block.type, block.metadata, (dx, dy, dz) => world.getBlock(pos.offset(dx, dy, dz)), block.shapes);
      }
      if (block.shapes.length === 0) return null;
      return [0, 1, 2, 3, 4, 5].map((i) => (i < 3 ? Math.min : Math.max)(...block.shapes.map((shape) => shape[i])));
    };
    const empty = (bx: number, by: number, bz: number) => collisionBox(new Vec3(bx, by, bz)) == null;
    const headX = Math.floor(x);
    let headY = Math.floor(player.getBB().maxY);
    const headZ = Math.floor(z);
    if (!empty(headX, headY, headZ) || !empty(headX, ++headY, headZ)) return;

    let maxRise = f32(1.2);
    if (player.jumpBoost > 0) maxRise = f32(maxRise + f32(player.jumpBoost * f32(0.75)));
    const reach = Math.max(f32(speed * 7), f32(1 / invLength));
    const endX = x + dx + dirX * reach;
    const endZ = z + dz + dirZ * reach;
    const width = f32(player.halfWidth * 2);
    const area = new AABB(
      Math.min(x, endX) - width, y, Math.min(z, endZ) - width,
      Math.max(x, endX) + width, y + f32(player.height), Math.max(z, endZ) + width,
    );
    const lineY = y + 0.5099999904632568;
    const sideX = -dirZ * f32(width * 0.5);
    const sideZ = dirX * f32(width * 0.5);
    // AABB.intersects(Vec3, Vec3): with the box the two points span
    const crosses = (box: AABB, ax: number, az: number, bx: number, bz: number) =>
      box.minX < Math.max(ax, bx) && box.maxX > Math.min(ax, bx) && box.minY < lineY && box.maxY > lineY &&
      box.minZ < Math.max(az, bz) && box.maxZ > Math.min(az, bz);

    let top = Number.NaN;
    for (const box of this.getSurroundingBBs(area, world, false)) {
      if (!box.intersects(area)) continue;
      if (!crosses(box, x - sideX, z - sideZ, endX - sideX, endZ - sideZ) && !crosses(box, x + sideX, z + sideZ, endX + sideX, endZ + sideZ)) continue;
      top = f32(box.maxY);
      const cx = Math.floor((box.minX + box.maxX) / 2);
      const cy = Math.floor((box.minY + box.maxY) / 2);
      const cz = Math.floor((box.minZ + box.maxZ) / 2);
      for (let step = 1; step < maxRise; step++) {
        const above = collisionBox(new Vec3(cx, cy + step, cz));
        if (above != null) {
          top = f32(f32(above[4]) + (cy + step));
          if (top - y > maxRise) return;
        }
        if (step > 1 && !empty(headX, ++headY, headZ)) return;
      }
      break;
    }
    if (Number.isNaN(top)) return;
    const rise = f32(top - y);
    if (rise > f32(0.5) && rise <= maxRise) player.autoJumpTime = 1;
  }

  private inputsToJump(entity: IEntityState, world: World, worldSettings: PhysicsWorldSettings, autoJumping = false) {
    // TODO: implement non-player entity jumping.

    if (entity instanceof PlayerState) {
      const player = entity as PlayerState;

      if (!player.control.jump && !autoJumping) {
        player.jumpTicks = 0;
        return;
      }

      if (player.flying) {
        return;
      }

      const liquidJump = this.liquidJump(player);
      if (liquidJump === "swim") {
        player.vel.y += 0.03999999910593033; // jumpInLiquid
      } else if (liquidJump === "ground" && player.jumpTicks === 0) {
        this.jumpFromGround(player, world, worldSettings);
        player.jumpTicks = worldSettings.autojumpCooldown;
      }
    }
  }

  /** LivingEntity.jumpFromGround: the jump power (block jump factor, jump boost) up, and a sprint's push forward. */
  private jumpFromGround(player: PlayerState, world: World, worldSettings: PhysicsWorldSettings) {
    const blockJumpFactor = this.getBlockJumpFactor(player, world, worldSettings);
    // the jump boost, 0.1F per level in float (in mineflayer, level 1 is 1, not 0)
    const jumpBoost = Math.fround(Math.fround(0.1) * player.jumpBoost);

    if (this.verLessThan("1.20.5")) {
      // added to the jump power in float 1.14 - 1.17 and since 1.20, in double before 1.14 and 1.17.1 - 1.19.4
      const floatSum = (!this.verLessThan("1.14") && this.verLessThan("1.17.1")) || !this.verLessThan("1.20");
      const power = Math.fround(Math.fround(0.42) * Math.fround(blockJumpFactor));
      const jumpPower = floatSum ? Math.fround(power + jumpBoost) : power + jumpBoost;
      player.vel.y = Math.max(jumpPower, player.vel.y);
      if (player.sprinting) {
        // Mth.sin/cos of the float yaw, times 0.2F in float
        const yaw = floatRadians(this.yawDegrees(player));
        player.vel.x += Math.fround(-this.mth.sin(yaw) * Math.fround(0.2));
        player.vel.z += Math.fround(this.mth.cos(yaw) * Math.fround(0.2));
      }
    } else {
      // the jump strength attribute, with its modifiers
      const synced = player.attributes[this.jumpStrengthAttribute];
      const value = Math.fround(synced ? this.attributeValue(this.jumpStrengthAttribute, synced) : Math.fround(0.42));
      const jumpPower = Math.fround(value * Math.fround(blockJumpFactor) + jumpBoost);
      if (jumpPower > 1e-5) {
        player.vel.y = Math.max(jumpPower, player.vel.y);
        if (player.sprinting) {
          // Mth.sin/cos of the float yaw, times 0.2 in double
          const yaw = floatRadians(this.yawDegrees(player));
          player.vel.x += -this.mth.sin(yaw) * 0.2;
          player.vel.z += this.mth.cos(yaw) * 0.2;
        }
      }
    }
  }

  /**
   * LivingEntity.aiStep's jump in fluids: swim up (jumpInLiquid) or jump from the ground. Before 1.13 any water or
   * lava swims up. 1.13 - 1.15 swim up in water deeper than 0.4 or off the ground, then in any lava, and jump from
   * the ground or from water up to 0.4 deep. 1.16+ take the height of the fluid the player is in (lava first) against
   * getFluidJumpThreshold (0.4, or 0 for eyes lower than 0.4).
   */
  private liquidJump(player: PlayerState): "swim" | "ground" | "none" {
    if (this.verLessThan("1.13")) {
      if (player.isInWater || player.isInLava) return "swim";
      return player.onGround ? "ground" : "none";
    }
    if (this.verLessThan("1.16")) {
      const height = player.waterHeight;
      if (height > 0 && (!player.onGround || height > 0.4)) return "swim";
      if (player.isInLava) return "swim";
      return player.onGround || (height > 0 && height <= 0.4) ? "ground" : "none";
    }
    const height = player.isInLava ? player.lavaHeight : player.waterHeight;
    const inWater = player.isInWater && height > 0;
    const threshold = Math.fround(player.eyeHeight) < 0.4 ? 0.0 : 0.4;
    if (inWater && !(player.onGround && !(height > threshold))) return "swim";
    if (player.isInLava && !(player.onGround && !(height > threshold))) return "swim";
    return player.onGround || (inWater && height <= threshold) ? "ground" : "none";
  }

  protected getBlockJumpFactor(entity: IEntityState, world: World, worldSettings: PhysicsWorldSettings) {
    const feetBlock = world.getBlock(new Vec3(entity.pos.x, entity.pos.y, entity.pos.z));
    const feetJumpFactor = this.getKnownJumpFactor(feetBlock?.type, worldSettings);
    if (feetJumpFactor !== 1.0) return feetJumpFactor;

    const supportBlock = world.getBlock(this.getBlockBelowAffectingMovement(entity, world));
    return this.getKnownJumpFactor(supportBlock?.type, worldSettings);
  }

  private getKnownJumpFactor(blockType: number | undefined, worldSettings: PhysicsWorldSettings) {
    if (blockType == null) return 1.0;
    if (blockType === this.honeyblockId) return worldSettings.honeyblockJumpSpeed;
    return 1.0;
  }

  /**
   * The ground speed for a block's friction, in float as vanilla computes it. 1.14+:
   * LivingEntity.getFrictionInfluencedSpeed, speed * (0.21600002F / (f * f * f)). Before, travel scaled the friction
   * by 0.91F first: speed * (0.16277136F / (s * s * s)), the constant 0.16277137F in 1.13.
   */
  protected getFrictionInfluencedSpeed(movementSpeed: number, friction: number) {
    const f32 = Math.fround;
    if (this.verLessThan("1.14")) {
      const s = f32(f32(friction) * f32(0.91));
      const constant = f32(this.verLessThan("1.13") ? 0.16277136 : 0.16277137);
      return f32(movementSpeed * f32(constant / f32(f32(s * s) * s)));
    }
    const f = f32(friction);
    return f32(movementSpeed * f32(f32(0.21600002) / f32(f32(f * f) * f)));
  }

  private getOffGroundSpeed(player: PlayerState, sprintedBefore = player.sprinting) {
    if (player.flying) {
      return player.sprinting ? player.flySpeed * 2.0 : player.flySpeed;
    }

    const sprinting = this.verLessThan("1.19.4") ? sprintedBefore : player.sprinting;
    if (!sprinting) return Math.fround(0.02);
    // Player.aiStep: 0.02F + 0.006F in floats on 1.18.2 - 1.19.3 (0.026000000536441803); before, 0.02F plus the
    // double 0.005999999865889549D cast back to a float, the 0.025999999F of Player.getFlyingSpeed since
    if (!this.verLessThan("1.18.2") && this.verLessThan("1.19.4")) return Math.fround(Math.fround(0.02) + Math.fround(0.006));
    return Math.fround(0.025999999);
  }

  protected getBlockBelowAffectingMovement(entity: IEntityState, world: World) {
    if (entity.supportingBlockPos != null) {
      return entity.supportingBlockPos //.offset(0, -0.500001, 0);
    } else {
      return entity.pos.offset(0, -0.500001, 0);
    }
  }

  /**
   * Taken from original physics impl.
   * @param entity
   * @returns
   */
 getMovementSpeedAttribute(entity: EPhysicsCtx) {
    let attribute;

    // In 1.21+, this should map to 'minecraft:movement_speed'
    if (entity.state.attributes && entity.state.attributes[this.movementSpeedAttribute]) {
      attribute = entity.state.attributes[this.movementSpeedAttribute];
    } else {
      // Create fallback if server hasn't sent it
      attribute = attributes.createAttributeValue(Math.fround(entity.worldSettings.playerSpeed));
    }

    // (the sprint modifier is the attribute's own: setSprinting adds and removes it, and a sync from the server that
    // lacks it drops it until the next setSprinting, as vanilla's LivingEntity.getSpeed reads it)

    // The speed and slowness effects are not applied here: like vanilla's client, the engine takes their modifiers
    // from the movement speed the server synced (the server adds them with the effect).

    // Calculate the final speed and cast the entire result to a 32-bit float
    const attributeSpeed = Math.fround(this.attributeValue(this.movementSpeedAttribute, attribute));
    return attributeSpeed;
  }

  /** LivingEntity.getEffectiveGravity: the gravity, at most 0.01 while falling with slow falling. */
  private getEffectiveGravity(ctx: EPhysicsCtx, player: PlayerState): number {
    const goingDown = player.vel.y <= 0.0;
    const hasSlowFalling = player.slowFalling > 0;
    if (this.verLessThan("1.20.5")) return goingDown && hasSlowFalling ? 0.01 : ctx.gravity;
    // the gravity attribute, with its modifiers (LivingEntity.getDefaultGravity)
    const synced = player.attributes[this.gravityAttribute];
    const defaultGravity = synced ? this.attributeValue(this.gravityAttribute, synced) : ctx.gravity;
    return goingDown && hasSlowFalling ? Math.min(0.01, defaultGravity) : defaultGravity;
  }

  /** The value of an attribute the server synced to the entity (with its modifiers), else its default. */
  private syncedAttribute(player: PlayerState, key: string | null, fallback: number): number {
    if (key == null) return fallback;
    const synced = player.attributes?.[key];
    return synced ? this.attributeValue(key, synced) : fallback;
  }

  /** LivingEntity.computeModifiedFriction (26.2+): Mth.clamp(1 - (1 - friction) * modifier, 0, 1), in float. */
  protected computeModifiedFriction(friction: number, modifier: number): number {
    const f32 = Math.fround;
    return Math.min(Math.max(f32(1 - f32(f32(1 - f32(friction)) * f32(modifier))), 0), 1);
  }

  /** LivingEntity.getAirDrag (26.2+): 0.98F modified by the AIR_DRAG_MODIFIER attribute; 0.98F before. */
  protected getAirDrag(player: PlayerState): number {
    if (this.airDragModifierAttribute == null) return Math.fround(0.98);
    return this.computeModifiedFriction(0.98, this.syncedAttribute(player, this.airDragModifierAttribute, 1));
  }

  /**
   * Assume EPhysicsCtx is wrapping a PlayerState.
   * @param ctx
   * @param world
   */
  movePlayer(ctx: EPhysicsCtx, world: World, sprintedBefore?: boolean) {
    const player = ctx.state as PlayerState;
    {
      // LivingEntity::travel
      const goingDown = player.vel.y <= 0.0;
      const gravity = this.getEffectiveGravity(ctx, player);

      if (player.isInWater && !player.flying) {
        const initY = player.pos.y;
        // Sprinting changes water movement since 1.13's sprint swimming (0.9F slowdown, no sinking); before, it does not.
        const sprintSwims = player.sprinting && !this.verLessThan("1.13");
        let waterSlowDown = Math.fround(sprintSwims ? ctx.sprintWaterInertia : ctx.waterInertia);
        let inputStrength = Math.fround(0.02);
        // Vanilla's float depth strider: the level (at most 3) before 1.21, then the water movement efficiency
        let depthStriderMult;
        if (this.verLessThan("1.21")) {
          depthStriderMult = Math.fround(Math.min(player.depthStrider, 3));
        } else {
          // the synced attribute with its modifiers (depth strider adds 0.33333334 per level)
          const synced = player.attributes[this.waterMovementEfficiencyAttribute];
          depthStriderMult = synced ? Math.fround(this.attributeValue(this.waterMovementEfficiencyAttribute, synced)) : 0;
        }

        if (!player.onGround) {
          depthStriderMult = Math.fround(depthStriderMult * 0.5);
        }

        if (depthStriderMult > 0.0) {
          // float arithmetic; before 1.21 the level is divided by 3 after the multiplication
          const toward = (diff: number) => {
            const scaled = Math.fround(diff * depthStriderMult);
            return this.verLessThan("1.21") ? Math.fround(scaled / 3) : scaled;
          };
          waterSlowDown = Math.fround(waterSlowDown + toward(Math.fround(Math.fround(0.54600006) - waterSlowDown)));
          const movementSpeed = this.getMovementSpeedAttribute(ctx); // slight deviation, using utility method
          inputStrength = Math.fround(inputStrength + toward(Math.fround(movementSpeed - inputStrength)));
        }

        if (this.verGreaterThan("1.12.2")) {
          if (player.dolphinsGrace > 0) {
            waterSlowDown = Math.fround(0.96); // 0.96F
          }
        }

        this.applyInputs(inputStrength, player);
        this.applyMovement(ctx, world);

        player.onClimbable = this.isInClimbable(player, world);
        if (player.isCollidedHorizontally && player.onClimbable) {
          player.vel.y = 0.2;
        }

        player.vel.x *= waterSlowDown;
        player.vel.y *= 0.800000011920929; // magic number, pretty sure this is wrong.
        player.vel.z *= waterSlowDown;

        if (!sprintSwims) {
          if (this.verGreaterThan("1.12.2")) {
            if (gravity !== 0.0) {
              if (
                goingDown &&
                Math.abs(player.vel.y - 0.005) >= 0.003 &&
                Math.abs(player.vel.y - gravity / 16.0) < 0.003
              ) {
                player.vel.y = -0.003;
              } else {
                player.vel.y -= gravity / 16.0;
              }
            }
          } else {
            player.vel.y -= ctx.waterGravity;
          }
        }

        const bb = player.getBB().expand(-1e-7, -1e-7, -1e-7);
        bb.translate(0, 0.6000000238418579 - player.pos.y + initY, 0);
        bb.translateVec(player.vel);
        if (player.isCollidedHorizontally && this.worldIsFree(world, bb, false)) {
          player.vel.y = ctx.worldSettings.outOfLiquidImpulse;
        }
      } else if (player.isInLava && !player.flying) {
        const initY = player.pos.y;
        this.applyInputs(Math.fround(0.02), player);
        this.applyMovement(ctx, world);
        const fluidJumpThreshold = Math.fround(player.eyeHeight) < 0.4 ? 0.0 : 0.4;
        if (!this.verLessThan("1.16") && player.lavaHeight <= fluidJumpThreshold) {
          // shallow lava (1.16+): the water's vertical drag and falling adjustment, half the horizontal speed
          player.vel.x *= 0.5;
          player.vel.y *= 0.800000011920929;
          player.vel.z *= 0.5;
          if (!player.sprinting && gravity !== 0.0) {
            if (goingDown && Math.abs(player.vel.y - 0.005) >= 0.003 && Math.abs(player.vel.y - gravity / 16.0) < 0.003) {
              player.vel.y = -0.003;
            } else {
              player.vel.y -= gravity / 16.0;
            }
          }
        } else {
          player.vel.scale(0.5);
        }
        player.vel.y -= ctx.lavaGravity;

        const bb = player.getBB().expand(-1e-7, -1e-7, -1e-7);
        bb.translate(0, 0.6000000238418579 - player.pos.y + initY, 0); // Math.fround(0.60)
        bb.translateVec(player.vel);
        if (player.isCollidedHorizontally && this.worldIsFree(world, bb, false)) {
          player.vel.y = ctx.worldSettings.outOfLiquidImpulse;
        }
      }
      // elytra flying.
      else if (player.fallFlying) {
        const previousHorizontalSpeed = Math.sqrt(player.vel.x * player.vel.x + player.vel.z * player.vel.z);
        this.updateFallFlyingMovement(player, gravity);
        this.applyMovement(ctx, world);

        this.handleFallFlyingCollisions(player, previousHorizontalSpeed);
      } else {
        const blockBelow = world.getBlock(this.getBlockBelowAffectingMovement(player, world));
        let verticalDrag = 0.9800000190734863;

        // deviation. using our stores slipperiness values.
        const blockSlipperiness = blockBelow ? this.blockSlipperiness[blockBelow.type] : undefined;
        let friction = blockSlipperiness ?? ctx.worldSettings.defaultSlipperiness;

        // console.log(blockBelow.name, blockBelow.position, player.supportingBlockPos, friction)
        // LivingEntity.travel: a float, f * 0.91F on the ground and 0.91F in the air. 26.2+ (travelInAir): the block's
        // friction modified by FRICTION_MODIFIER, the 0.91F and 0.98F drags by AIR_DRAG_MODIFIER
        // (computeModifiedFriction).
        let inertia: number;
        const modifiedFriction = this.frictionModifierAttribute != null;
        if (modifiedFriction) {
          const airDragModifier = this.syncedAttribute(player, this.airDragModifierAttribute, 1);
          if (player.lastOnGround) friction = this.computeModifiedFriction(friction, this.syncedAttribute(player, this.frictionModifierAttribute, 1));
          const airDrag = this.computeModifiedFriction(0.91, airDragModifier);
          inertia = Math.fround((player.lastOnGround ? friction : 1) * airDrag);
          verticalDrag = this.computeModifiedFriction(0.98, airDragModifier);
        } else {
          inertia = player.lastOnGround
            ? Math.fround(Math.fround(friction) * Math.fround(ctx.airborneInertia))
            : Math.fround(ctx.airborneInertia);
        }

        // deviation, adding additional logic for changing attribute values.
        const movementSpeedAttr = this.getMovementSpeedAttribute(ctx);

        let inputStrength: number;
        if (player.lastOnGround) {
          // 26.2+: a block friction of 0.6 or less (only with FRICTION_MODIFIER) takes the speed as it is
          inputStrength = modifiedFriction && !(friction > 0.6) ? movementSpeedAttr : this.getFrictionInfluencedSpeed(movementSpeedAttr, friction);
        } else {
          inputStrength = this.getOffGroundSpeed(player, sprintedBefore);
        }

       

        this.applyInputs(inputStrength, player);

        // LivingEntity.onClimbable is looked up where the player is, before the move and again after it
        player.onClimbable = this.isInClimbable(player, world);
        if (player.onClimbable) {
          // LivingEntity::handleOnClimbable
          player.fallDistance = 0;
          player.vel.x = math.clamp(-0.15000000596046448, player.vel.x, 0.15000000596046448); // Math.fround(0.15)
          player.vel.z = math.clamp(-0.15000000596046448, player.vel.z, 0.15000000596046448); // Math.fround(0.15)
          // the fall is held at -0.15F since 1.14, at the double -0.15 before
          player.vel.y = Math.max(this.verLessThan("1.14") ? -0.15 : -0.15000000596046448, player.vel.y);
          // sneaking stops the slide down, but not in scaffolding
          const feetBlock = world.getBlock(player.pos);
          if (player.vel.y < 0 && player.control.sneak && feetBlock?.type !== this.scaffoldId) {
            player.vel.y = 0.0;
          }
        }

        this.applyMovement(ctx, world);
        player.onClimbable = this.isInClimbable(player, world);

        // if colliding and in climbable, go up. The jump key climbs too since 1.14. Leather boots climb powder snow
        // (1.17+): at the feet after the move, from 1.21.5 if the tick before was in it (wasInPowderSnow).
        const climbing = player.isCollidedHorizontally || (player.control.jump && !this.verLessThan("1.14"));
        const inPowderSnow = this.verLessThan("1.21.5")
          ? world.getBlock(player.pos)?.type === this.powderSnowId
          : player.wasInPowderSnow;
        if (climbing && (player.onClimbable || (inPowderSnow && player.canWalkOnPowderSnow))) {
          player.vel.y = 0.2;
        }

        if (player.levitation > 0) {
          player.vel.y += (0.05 * player.levitation - player.vel.y) * 0.2;
        } else if (this.verLessThan("1.14") && !this.columnLoaded(player, world)) {
          // LivingEntity.travel before 1.14: a client player over a column that is not loaded sinks at 0.1 (no motion
          // at y 0 and below)
          player.vel.y = player.pos.y > 0 ? -0.1 : 0;
        } else {
          player.vel.y -= gravity;
        }

        player.vel.x *= inertia;
        player.vel.z *= inertia;
        // another magic number that I'm pretty sure is random/hardcoded.
        // this can be generalized.
        player.vel.y *= verticalDrag;
      }

      // the other attached rockets tick after the player (one while the duration runs, unless counted)
      const rockets = player.fireworkRockets > 0 ? player.fireworkRockets : 1;
      this.applyFireworkBoost(player, rockets - player.fireworkRocketsBeforePlayer);
      if (player.fireworkRocketDuration > 0) --player.fireworkRocketDuration;
    }
  }

  /**
   * Inside a suffocating block the player is pushed toward the nearest open side, from the four corners 0.35 widths
   * out: since 1.16 LocalPlayer.moveTowardsClosestSpace (the motion on that axis set to 0.1, a cell blocked when a
   * suffocating block's shape meets the column of the box there); before, half a block above the feet
   * (EntityPlayerSP.pushOutOfBlocks, LocalPlayer.checkInBlock 1.14 - 1.15) with 0.1F before 1.14, a cell blocked by a
   * normal cube there or above it (a swimmer in 1.13: there only; any open side is two blocks high), 1.14 - 1.15 by a
   * view-blocking block in the box's height.
   */
  private pushOutOfBlocks(player: PlayerState, world: World) {
    if (player.gameMode === "spectator") return;
    const box = this.boundingBoxForMove(player).bb;
    const w = Math.fround(player.halfWidth * 2) * 0.35;
    const corners = [[-w, w], [-w, -w], [w, -w], [w, w]];
    const suffocatesAt = (x: number, y: number, z: number) => this.isSuffocating(world.getBlock(new Vec3(x, y, z)));
    let blocked: (x: number, z: number) => boolean;
    let open: (x: number, z: number) => boolean;
    if (!this.verLessThan("1.16")) {
      blocked = (x, z) => {
        const column = new AABB(x, box.minY, z, x + 1, box.maxY, z + 1).expand(-1e-7, -1e-7, -1e-7);
        for (let cy = Math.floor(column.minY) - 1; cy <= Math.floor(column.maxY); cy++) {
          const block = world.getBlock(new Vec3(x, cy, z));
          if (!this.isSuffocating(block)) continue;
          if (block!.shapes.some((b) => column.intersects(new AABB(x + b[0], cy + b[1], z + b[2], x + b[3], cy + b[4], z + b[5])))) return true;
        }
        return false;
      };
      open = (x, z) => !blocked(x, z);
    } else {
      const by = Math.floor(box.minY + 0.5);
      if (!this.verLessThan("1.14")) {
        blocked = (x, z) => {
          for (let cy = Math.floor(box.minY); cy < Math.ceil(box.maxY); cy++) if (suffocatesAt(x, cy, z)) return true;
          return false;
        };
        open = (x, z) => !blocked(x, z);
      } else {
        open = (x, z) => !suffocatesAt(x, by, z) && !suffocatesAt(x, by + 1, z);
        blocked = this.verLessThan("1.13") || !player.swimming ? (x, z) => !open(x, z) : (x, z) => suffocatesAt(x, by, z);
      }
    }
    const speed = this.verLessThan("1.14") ? Math.fround(0.1) : 0.1;
    for (const [ox, oz] of corners) {
      const x = player.pos.x + ox;
      const z = player.pos.z + oz;
      const bx = Math.floor(x);
      const bz = Math.floor(z);
      if (!blocked(bx, bz)) continue;
      const dx = x - bx;
      const dz = z - bz;
      let side: [number, number] | null = null;
      let best = this.verLessThan("1.16") ? 9999.0 : Number.MAX_VALUE;
      for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const coord = sx !== 0 ? dx : dz;
        const distance = sx > 0 || sz > 0 ? 1.0 - coord : coord;
        if (distance < best && open(bx + sx, bz + sz)) {
          best = distance;
          side = [sx, sz];
        }
      }
      if (side == null) continue;
      if (side[0] !== 0) player.vel.x = speed * side[0];
      else player.vel.z = speed * side[1];
    }
  }

  /**
   * Whether a block suffocates: before 1.14 a normal cube (opaque, a full cube, no redstone power source); since,
   * BlockState.isSuffocating, a full collision cube except glass, leaves, grates and mangrove roots, and since 1.16 also
   * farmland, soul sand, dirt paths and mud.
   */
  private isSuffocating(block: Block | null): boolean {
    if (block == null) return false;
    // (1.8 - 1.12: the client's own normal cubes, LegacyShapes)
    const normalCube = this.legacyShapes.isNormalCube(block.type, block.metadata);
    if (normalCube != null) return normalCube;
    const fullCube = block.shapes.length === 1 && block.shapes[0].every((v, i) => v === (i < 3 ? 0 : 1));
    if (this.verLessThan("1.14")) return fullCube && !block.transparent && block.name !== "redstone_block" && block.name !== "observer";
    if (/glass$|_leaves$|copper_grate$|^mangrove_roots$|^moving_piston$/.test(block.name)) return false;
    if (!this.verLessThan("1.16") && ["farmland", "soul_sand", "dirt_path", "grass_path", "mud"].includes(block.name)) return true;
    return fullCube;
  }

  /**
   * A moving piston block pushing the player, as PistonMovingBlockEntity.tick's moveCollidedEntities does (1.11+): the
   * client ticks its block entities after its entities, so the caller runs this after simulate, once per moving piston,
   * with its progress before the tick (then advances it by 0.5F), the tick it reaches 1 too (it then turns into the
   * block it moved; from 1.11 without a push). The moved block's collision boxes, placed at the progress and swept by
   * the 0.5 the block moves, push the player out of their way plus 0.01, along the direction the block moves, by
   * Entity.move(PISTON). Before 1.11 see pushByLegacyPiston.
   */
  public pushByMovingPiston(ctx: EPhysicsCtx, world: World, piston: MovingPiston): void {
    if (!(ctx.state instanceof PlayerState)) return;
    const player = ctx.state;
    if (player.gameMode === "spectator") return;
    if (this.verLessThan("1.11")) return this.pushByLegacyPiston(ctx, world, piston);
    if (piston.progress >= 1) return;
    const f32 = Math.fround;
    const progress = f32(piston.progress);
    const distance = f32(f32(progress + f32(0.5)) - progress);
    const [fx, fy, fz] = piston.direction;
    const sign = piston.extending ? 1 : -1;
    const dir: [number, number, number] = [fx * sign, fy * sign, fz * sign];
    // moveByPositionAndProgress: the block at its position plus the progress still to go
    const extended = f32(piston.extending ? progress - 1 : 1 - progress);
    const [px, py, pz] = piston.pos;
    const ox = px + extended * fx;
    const oy = py + extended * fy;
    const oz = pz + extended * fz;
    const box = this.boundingBoxForMove(player).bb;
    let push = 0.0;
    for (const s of piston.shapes) {
      const area = pistonMovementArea(new AABB(s[0] + ox, s[1] + oy, s[2] + oz, s[3] + ox, s[4] + oy, s[5] + oz), dir, distance);
      if (area.intersects(box)) {
        push = Math.max(push, pistonMovement(area, dir, box));
        if (push >= distance) break;
      }
    }
    if (push <= 0.0) return;
    push = Math.min(push, distance) + 0.01;
    this.moveByPiston(ctx, world, new Vec3(push * dir[0], push * dir[1], push * dir[2]));
    if (!piston.extending && piston.source) {
      // fixEntityWithinPistonBase: out of the piston's own cell, against the direction it retracts in
      const moved = this.boundingBoxForMove(player).bb;
      const cell = new AABB(px, py, pz, px + 1, py + 1, pz + 1);
      if (moved.intersects(cell)) {
        const back: [number, number, number] = [-dir[0], -dir[1], -dir[2]];
        let e = pistonMovement(cell, back, moved) + 0.01;
        const inside = new AABB(Math.max(moved.minX, cell.minX), Math.max(moved.minY, cell.minY), Math.max(moved.minZ, cell.minZ),
          Math.min(moved.maxX, cell.maxX), Math.min(moved.maxY, cell.maxY), Math.min(moved.maxZ, cell.maxZ));
        const f = pistonMovement(cell, back, inside) + 0.01;
        if (Math.abs(e - f) < 0.01) {
          e = Math.min(e, distance) + 0.01;
          this.moveByPiston(ctx, world, new Vec3(e * back[0], e * back[1], e * back[2]));
        }
      }
    }
  }

  /**
   * TileEntityPiston.update before 1.11: the progress goes 0.5F further (to at most 1), or at 1 the block entity ends,
   * pushing once more. The player, when its box meets the moved block's, is moved by Entity.move (its own move: step,
   * sneaking edge, collisions). The moved block's box is its single collision box (getCollisionBoundingBox): a head's
   * plate (1.9 - 1.10), on 1.8 the bounds BlockPistonExtension.addCollisionBoxesToList leaves it with, a full cube; a
   * retracting piston's unextended base, a full cube.
   *   1.8 (updatePushedObjects): only an extending block pushes while it moves, by the progress gone plus 0.0625F, along
   *   the piston's facing; the end pushes by 0.25F along it. The box (BlockPistonMoving.getBoundingBox) is the block's
   *   with the side the facing points to drawn in by what is left to go (1 - progress; progress - 1 retracting).
   *   1.9 - 1.10 (moveCollidedEntities): the block's box at the progress before and after, joined; the player goes out
   *   of it plus 0.01 along the way the block moves.
   */
  private pushByLegacyPiston(ctx: EPhysicsCtx, world: World, piston: MovingPiston): void {
    const player = ctx.state as PlayerState;
    const f32 = Math.fround;
    const [fx, fy, fz] = piston.direction;
    const [px, py, pz] = piston.pos;
    const before = f32(piston.progress);
    const ended = before >= 1;
    const after = ended ? before : Math.min(f32(before + f32(0.5)), 1);
    const box = this.boundingBoxForMove(player).bb;
    const meets = (b: AABB) => b.intersects(box);
    if (this.verLessThan("1.9")) {
      if (!ended && !piston.extending) return;
      const progress = ended ? 1 : after;
      const distance = ended ? f32(0.25) : f32(f32(after - before) + f32(0.0625));
      const left = piston.extending ? f32(1 - progress) : f32(progress - 1);
      const b = new AABB(px, py, pz, px + 1, py + 1, pz + 1);
      if (fx < 0) b.minX -= fx * left; else b.maxX -= fx * left;
      if (fy < 0) b.minY -= fy * left; else b.maxY -= fy * left;
      if (fz < 0) b.minZ -= fz * left; else b.maxZ -= fz * left;
      if (!meets(b)) return;
      this.applyMovement(ctx, world, new Vec3(distance * fx, distance * fy, distance * fz));
      return;
    }
    // (PistonHeadBlock.getBoundingBox: the plate on the facing's side)
    const plate = (axis: number, sign: number) => {
      const min = [0, 0, 0];
      const max = [1, 1, 1];
      if (sign > 0) min[axis] = 0.75;
      else max[axis] = 0.25;
      return [...min, ...max];
    };
    const axis = fx !== 0 ? 0 : fy !== 0 ? 1 : 2;
    const sign = fx + fy + fz;
    const shape = piston.extending ? plate(axis, sign) : [0, 0, 0, 1, 1, 1];
    const at = (progress: number) => {
      const o = piston.extending ? f32(progress - 1) : f32(1 - progress);
      return new AABB(px + shape[0] + o * fx, py + shape[1] + o * fy, pz + shape[2] + o * fz, px + shape[3] + o * fx, py + shape[4] + o * fy, pz + shape[5] + o * fz);
    };
    const a = at(after);
    const b = at(before);
    const area = new AABB(Math.min(a.minX, b.minX), Math.min(a.minY, b.minY), Math.min(a.minZ, b.minZ), Math.max(a.maxX, b.maxX), Math.max(a.maxY, b.maxY), Math.max(a.maxZ, b.maxZ));
    if (!meets(area)) return;
    const way = piston.extending ? sign : -sign;
    const min = [area.minX, area.minY, area.minZ][axis];
    const max = [area.maxX, area.maxY, area.maxZ][axis];
    const amount = (way > 0 ? max - [box.minX, box.minY, box.minZ][axis] : [box.maxX, box.maxY, box.maxZ][axis] - min) + 0.01;
    const move = [0, 0, 0];
    move[axis] = amount * way;
    this.applyMovement(ctx, world, new Vec3(move[0], move[1], move[2]));
  }

  /**
   * Entity.move(MoverType.PISTON): at most 0.51 per axis in a game tick (limitPistonMovement), the stuck multiplier
   * cleared without slowing the move, the move collided as the player's own (without its step up), the collision
   * flags and ground contact from it, the motion stopped on the axes it hit and scaled by the block speed factor.
   */
  private moveByPiston(ctx: EPhysicsCtx, world: World, requested: Vec3) {
    const player = ctx.state as PlayerState;
    if (requested.x * requested.x + requested.y * requested.y + requested.z * requested.z <= 1e-7) return;
    if (player.pistonDeltasTick !== player.age) {
      player.pistonDeltas = [0, 0, 0];
      player.pistonDeltasTick = player.age;
    }
    const axis = requested.x !== 0 ? 0 : requested.y !== 0 ? 1 : requested.z !== 0 ? 2 : -1;
    if (axis < 0) return;
    const wanted = axis === 0 ? requested.x : axis === 1 ? requested.y : requested.z;
    const limited = Math.min(Math.max(wanted + player.pistonDeltas[axis], -0.51), 0.51);
    const amount = limited - player.pistonDeltas[axis];
    player.pistonDeltas[axis] = limited;
    if (Math.abs(amount) <= 9.999999747378752e-6) return;
    const movement = new Vec3(axis === 0 ? amount : 0, axis === 1 ? amount : 0, axis === 2 ? amount : 0);

    if (player.stuckSpeedMultiplier.norm() ** 2 > 1e-7) {
      player.stuckSpeedMultiplier.set(0, 0, 0);
      player.vel.set(0, 0, 0);
    }

    const sizedBox = this.boundingBoxForMove(player);
    const bb = sizedBox.bb;
    let moved: Vec3;
    let movedBox: AABB | null = null;
    if (this.verLessThan("1.14")) {
      const legacy = this.legacyCollide(world, bb, movement, 0, player.onGround, (swept) => this.otherColliders(player, swept));
      moved = legacy.movement;
      movedBox = legacy.bb;
    } else {
      moved = this.collideBoundingBox(world, bb, movement, this.otherColliders(player, bb.expandTowards(movement)));
    }
    const movedSqr = moved.norm() ** 2;
    if (movedBox != null) {
      this.keepBoundingBox(player, { ...sizedBox, bb: movedBox }, true);
    } else if (movedSqr > 1e-7 || movement.norm() ** 2 - movedSqr < 1e-7) {
      if (this.verLessThan("1.17")) this.keepBoundingBox(player, { ...sizedBox, bb: bb.move(moved) }, true);
      else player.pos.add(moved);
    }

    const collided = (a: number, b: number) => (movedBox != null ? a !== b : Math.abs(a - b) > 1e-7);
    const collisionX = collided(movement.x, moved.x);
    const collisionZ = collided(movement.z, moved.z);
    player.isCollidedHorizontally = collisionX || collisionZ;
    player.isCollidedVertically = movement.y !== moved.y;
    player.onGround = player.isCollidedVertically && movement.y < 0;
    if (!player.onGround) player.supportingBlockPos = null;
    player.isCollidedHorizontallyMinor = player.isCollidedHorizontally && this.isCollidedHorizontallyMinor(player, moved);
    if (collisionX) player.vel.x = 0;
    if (collisionZ) player.vel.z = 0;
    if (player.isCollidedVertically) player.vel.y = 0;
    if (!this.verLessThan("1.15")) {
      const factor = this.getBlockSpeedFactor(player, world);
      player.vel.x *= factor;
      player.vel.z *= factor;
    }
  }

  /**
   * The bounding box Entity.move starts from, with its size. Before 1.17 vanilla keeps it across ticks and only builds
   * it from the position in setPos (float half width and height), so the kept box is used while pos is still the
   * position the engine left with it; on 1.14 - 1.16 a pose of another size refits it as Entity.refreshDimensions does
   * (before 1.14 the size changes at the end of the tick, see updateLegacySize).
   */
  private boundingBoxForMove(player: PlayerState): { bb: AABB; width: number; height: number } {
    const kept = player.keptBoundingBox;
    const legacySize = this.verLessThan("1.14");
    const width = legacySize ? Math.fround(0.6) : player.halfWidth * 2;
    const height = legacySize ? this.legacyPlayerHeight(player, player.prevControl.sneak) : player.height;
    const fromPos = () => ({ bb: this.boxAt(player.pos, width, height), width, height });
    if (!this.verLessThan("1.17") || kept == null) return fromPos();
    const { bb, pos } = kept;
    if (pos.x !== player.pos.x || pos.y !== player.pos.y || pos.z !== player.pos.z) return fromPos();
    if (legacySize || (width === kept.width && height === kept.height)) return { bb: bb.clone(), width: kept.width, height: kept.height };
    if (width < kept.width) return fromPos();
    return { bb: new AABB(bb.minX, bb.minY, bb.minZ, bb.minX + width, bb.minY + height, bb.minZ + width), width, height };
  }

  /**
   * Entity.refreshDimensions on 1.14 - 1.16, which also runs whenever the pose is set from synced entity data (the
   * server echoing the player's own pose): the kept bounding box is refitted to the pose's size on its lower corner
   * (around the position when narrower), even when the size did not change. Call it when such data arrives.
   */
  public refreshDimensions(player: PlayerState) {
    const kept = player.keptBoundingBox;
    if (this.verLessThan("1.14") || !this.verLessThan("1.17") || kept == null) return;
    if (kept.pos.x !== player.pos.x || kept.pos.y !== player.pos.y || kept.pos.z !== player.pos.z) return;
    const width = player.halfWidth * 2;
    const height = player.height;
    const { bb } = kept;
    player.keptBoundingBox = {
      bb: width < kept.width ? this.boxAt(player.pos, width, height) : new AABB(bb.minX, bb.minY, bb.minZ, bb.minX + width, bb.minY + height, bb.minZ + width),
      pos: kept.pos,
      width,
      height,
    };
  }

  /** Entity.setPos's box: float half width and height around the position. */
  private boxAt(pos: Vec3, width: number, height: number): AABB {
    const w = width / 2;
    return new AABB(pos.x - w, pos.y, pos.z - w, pos.x + w, pos.y + height, pos.z + w);
  }

  /**
   * The player's height before 1.14 (EntityPlayer.updateSize; 1.8 keeps 1.8F): 0.6F gliding (1.13: or swimming), 1.65F
   * sneaking, else 1.8F.
   */
  private legacyPlayerHeight(player: PlayerState, sneaking: boolean): number {
    if (this.verLessThan("1.9")) return Math.fround(1.8);
    if (player.fallFlying || (!this.verLessThan("1.13") && player.swimming)) return Math.fround(0.6);
    return Math.fround(sneaking ? 1.65 : 1.8);
  }

  /**
   * EntityPlayer.updateSize at the end of the tick (1.9 - 1.13): a new height refits the kept box on its lower corner
   * (Entity.setSize), unless the refitted box would collide with a block.
   */
  private updateLegacySize(player: PlayerState, world: World) {
    const kept = player.keptBoundingBox;
    if (kept == null || this.verLessThan("1.9")) return;
    const height = this.legacyPlayerHeight(player, player.control.sneak);
    if (height === kept.height) return;
    const { bb } = kept;
    const resized = new AABB(bb.minX, bb.minY, bb.minZ, bb.minX + kept.width, bb.minY + height, bb.minZ + kept.width);
    // 1.13's World.isCollisionBoxesEmpty compares voxel shapes, within 1e-7
    const test = this.verLessThan("1.13") ? resized : resized.clone().expand(-COLLISION_EPSILON, -COLLISION_EPSILON, -COLLISION_EPSILON);
    if (this.getSurroundingBBs(test, world).some((box) => box.intersects(test))) return;
    player.keptBoundingBox = { ...kept, bb: resized, height };
  }

  /**
   * Before 1.17 Entity.move moves the bounding box and derives the position from it (setLocationFromBoundingbox); the
   * box is kept for the next tick either way.
   */
  private keepBoundingBox(player: PlayerState, sized: { bb: AABB; width: number; height: number }, moved: boolean) {
    const { bb, width, height } = sized;
    if (moved) player.pos.set((bb.minX + bb.maxX) / 2, bb.minY, (bb.minZ + bb.maxZ) / 2);
    player.keptBoundingBox = { bb, pos: player.pos.clone(), width, height };
  }

  applyMovement(ctx: EPhysicsCtx, world: World, requested?: Vec3) {
    const player = ctx.state as PlayerState;
    if (player.gameMode === "spectator") {
      if (this.verLessThan("1.17")) {
        const start = this.boundingBoxForMove(player);
        this.keepBoundingBox(player, { ...start, bb: start.bb.move(player.vel) }, true);
      } else {
        player.pos.translate(player.vel.x, player.vel.y, player.vel.z);
      }
      if (!player.isInWater && this.data.version.minecraftVersion !== "1.21.4") this.fluidsAfterMove(ctx, world);
      return;
    }

    // console.log('wtf vel?', player.vel)
    // this might be a clone.
    let movement = (requested ?? player.vel).clone();


    // if a player is stuck, reset stuck multiplier and set velocity to 0.
    // isInWeb: this move is slowed by a cobweb, berry bush or powder snow (Entity.isInWeb before 1.14)
    player.isInWeb = player.stuckSpeedMultiplier.norm() ** 2 > 1e-7;
    if (player.isInWeb) {
      movement.x *= player.stuckSpeedMultiplier.x;
      movement.y *= player.stuckSpeedMultiplier.y;
      movement.z *= player.stuckSpeedMultiplier.z;
      player.stuckSpeedMultiplier.set(0, 0, 0);
      player.vel.set(0, 0, 0);
    }

    let maxUpStep = ctx.stepHeight;
    if (!this.verLessThan("1.20.5")) {
      maxUpStep = player.attributes[this.stepHeightAttribute]?.value ?? ctx.stepHeight;
    }

    // const playerAABB = player.getBB();
    // (only a move that does not go up from 1.19; before, a jump off the edge backs off too)
    if (!player.flying && (movement.y <= 0.0 || this.verLessThan("1.19")) && player.control.sneak && player.onGround) {
      // Player::maybeBackOffFromEdge
      const step = 0.05;

      // for readability.
      const prepare = (x: number, y: number, z: number) => {
        const bb = player.getBB().translate(x, y, z);
        bb.expand(-1e-7, -1e-7, -1e-7);
        return bb;
      };

      while (movement.x != 0.0 && this.worldIsFree(world, prepare(movement.x, -maxUpStep, 0), true)) {
        // console.log('x', movement.x, step, this.worldIsFree(world, prepare(movement.x, -maxUpStep, 0), true))
        movement.x = movement.x < step && movement.x >= -step ? 0.0 : movement.x > 0.0 ? movement.x - step : movement.x + step;
      }

      while (movement.z != 0.0 && this.worldIsFree(world, prepare(0, -maxUpStep, movement.z), true)) {
        movement.z = movement.z < step && movement.z >= -step ? 0.0 : movement.z > 0.0 ? movement.z - step : movement.z + step;
      }

      // and both at once, while the diagonal move would still leave the ground
      while (movement.x != 0.0 && movement.z != 0.0 && this.worldIsFree(world, prepare(movement.x, -maxUpStep, movement.z), true)) {
        movement.x = movement.x < step && movement.x >= -step ? 0.0 : movement.x > 0.0 ? movement.x - step : movement.x + step;
        movement.z = movement.z < step && movement.z >= -step ? 0.0 : movement.z > 0.0 ? movement.z - step : movement.z + step;
      }
    }

    // 1.20.5: this is var2 in entity::move
    const movementBeforeCollisions = movement.clone();

    const sizedBox = this.boundingBoxForMove(player);
    const boundingBox = sizedBox.bb;
    let legacyMovedBox: AABB | null = null;
    if (this.verLessThan("1.14")) {
      const legacy = this.legacyCollide(world, boundingBox, movement, Math.fround(maxUpStep), player.onGround, (swept) => this.otherColliders(player, swept));
      movement = legacy.movement;
      legacyMovedBox = legacy.bb;
    } else { // Entity::collide
      const playerAABB = boundingBox;
      const fuck = playerAABB.clone();
      const hDist = (vec: Vec3) => Math.sqrt(vec.x * vec.x + vec.z * vec.z);
      const colliders = this.otherColliders(player, playerAABB.expandTowards(movement));

      let newMovement = movement.norm() ** 2 === 0 ? movement : this.collideBoundingBox(world, playerAABB, movement, colliders);


      const collisionX = Math.abs(movement.x - newMovement.x) > 1e-7;
      const collisionY = Math.abs(movement.y - newMovement.y) > 1e-7;
      const collisionZ = Math.abs(movement.z - newMovement.z) > 1e-7;
      // console.log('internal collisions', collisionX, collisionY, collisionZ);
      const onGround = player.onGround || (collisionY && movement.y < 0);


      if (maxUpStep > 0 && onGround && (collisionX || collisionZ) && !this.verLessThan("1.21")) {
        newMovement = this.stepUp(world, playerAABB, movement, newMovement, collisionY && movement.y < 0, maxUpStep, colliders);
      } else if (maxUpStep > 0 && onGround && (collisionX || collisionZ)) {
        let stepUpMovement = this.collideBoundingBox(
          world,
          playerAABB,
          new Vec3(movement.x, maxUpStep, movement.z),
          colliders,
        );

        const expand = playerAABB.expandTowardsCoords(movement.x, 0, movement.z)
        const stepOnlyMovement = this.collideBoundingBox(
          world,
          expand,
          new Vec3(0, maxUpStep, 0),
          colliders,
        );

        if (stepOnlyMovement.y < maxUpStep) {
          const adjustedStepUp = this.collideBoundingBox(
            world,

            playerAABB.move(stepOnlyMovement),
            new Vec3(movement.x, 0, movement.z),
            colliders,
          ).add(stepOnlyMovement);

          if (hDist(adjustedStepUp) > hDist(stepUpMovement)) {
            stepUpMovement = adjustedStepUp;
          }
        }

        if (hDist(stepUpMovement) > hDist(newMovement)) {
          newMovement = stepUpMovement.add(
            this.collideBoundingBox(
              world,
              playerAABB.move(stepUpMovement),
              new Vec3(0, -stepUpMovement.y + movement.y, 0),
              colliders,
            )
          );
        }
      }
      movement = newMovement
    }
    // console.log('after all collision', movement)
    if (legacyMovedBox != null) {
      this.keepBoundingBox(player, { ...sizedBox, bb: legacyMovedBox }, true);
    } else if (this.verLessThan("1.17")) {
      const moved = movement.norm() ** 2 > 1e-7;
      this.keepBoundingBox(player, { ...sizedBox, bb: moved ? boundingBox.move(movement) : boundingBox }, moved);
    } else if (movement.norm() ** 2 > 1e-7) {
      const from = player.pos.clone();
      player.pos.add(movement);
      this.recordedMove = { from, to: player.pos.clone(), movement: movementBeforeCollisions.clone() };
    }

    // 1.20.5: movement is now considered var4.

    // Entity.move's collision flags: exact before 1.14; since then the horizontal one by Mth.equal (within 1e-5F) and
    // the vertical one exact
    const legacyMove = legacyMovedBox != null;
    const collided = (requested: number, moved: number) =>
      legacyMove ? requested !== moved : !(Math.abs(moved - requested) < Math.fround(1.0e-5));
    const collisionX = collided(movementBeforeCollisions.x, movement.x);
    const collisionY = movementBeforeCollisions.y !== movement.y;
    const collisionZ = collided(movementBeforeCollisions.z, movement.z);
    // the velocity reset: exact on each axis before 1.18.2, where (1.14 - 1.18.1) the z reset puts back the x from
    // before the x reset; by the horizontal collision flags since
    let resetX = collisionX;
    let resetZ = collisionZ;
    if (!legacyMove && this.verLessThan("1.18.2")) {
      resetZ = movementBeforeCollisions.z !== movement.z;
      resetX = movementBeforeCollisions.x !== movement.x && !resetZ;
    }

    // console.log('collisions', collisionX, collisionY, collisionZ, movementBeforeCollisions, movement, player.vel, player.pos, player.getBB())
    player.isCollidedHorizontally = collisionX || collisionZ;
    player.isCollidedVertically = collisionY;

    if (player.isCollidedHorizontally) {
      player.isCollidedHorizontallyMinor = this.isCollidedHorizontallyMinor(player, movement);

    } else {
      player.isCollidedHorizontallyMinor = false;
    }

    // TODO: add minor horizontal collision check
    {
      // Entity::setOnGroundWithKnownMovement: on ground only when the movement down collided (not when a zeroed
      // vertical speed, as on a slime block, did not move at all)
      const onGroundNoBlocks = player.onGround && player.supportingBlockPos == null;
      player.onGround = movementBeforeCollisions.y < 0.0 && collisionY;
      if (player.onGround && !this.verLessThan("1.20")) {
        // Entity.checkSupportingBlock (1.20+): the block under the box's underside, else (landing from the air or on
        // a block) under where the box was before the horizontal move
        const bb = player.getBB();
        const underside = new AABB(bb.minX, bb.minY - 1.0e-6, bb.minZ, bb.maxX, bb.minY, bb.maxZ);
        let supportingBlockPos = this.getSupportingBlockPos(world, underside, player.pos);
        if (supportingBlockPos == null && !onGroundNoBlocks) {
          supportingBlockPos = this.getSupportingBlockPos(world, underside.translate(-movement.x, 0.0, -movement.z), player.pos);
        }
        player.supportingBlockPos = supportingBlockPos;
      } else {
        player.supportingBlockPos = null;
      }
    }

    // Entity.checkFallDamage: falling adds to the fall distance (a float until 1.21.5, then no longer in water and
    // counting the landing move too); landing ends it. 1.21.4's Entity.move leaves it to the server for an entity the
    // client controls (isControlledByClient: the player, and what it rides): the fall distance stays as it is
    const clientChecksFall = this.data.version.minecraftVersion !== "1.21.4";
    if (clientChecksFall && this.verLessThan("1.21.5")) {
      if (player.onGround) player.fallDistance = 0;
      else if (movement.y < 0) player.fallDistance = Math.fround(player.fallDistance - Math.fround(movement.y));
    } else if (clientChecksFall) {
      if (!player.isInWater && movement.y < 0) player.fallDistance -= Math.fround(movement.y);
      if (player.onGround) player.fallDistance = 0;
    }

    // Entity.move (1.17+) stops here for an entity removed during its tick: no velocity reset, landing, block effects
    if (player.removed && !this.verLessThan("1.17")) return;

    // update speeds
    if (!this.verLessThan("26.2")) {
      // 26.2 replaced the velocity reset and the blocks' fall-on bounce with Entity.restituteMovementAfterCollisions
      if ((movementBeforeCollisions.y !== 0 && collisionY) || player.isCollidedHorizontally) {
        this.restituteMovementAfterCollisions(ctx, world, collisionX, collisionZ, movement.y);
      }
    } else {
      if (resetX) {
        player.vel.x = 0.0;
      }
      if (resetZ) {
        player.vel.z = 0.0;
      }
      if (collisionY) {
        // Block.updateEntityAfterFallOn stops the vertical motion: 0 before 1.14, then times 0 (a fall keeps its -0)
        const stopped = this.verLessThan("1.14") ? 0.0 : player.vel.y * 0.0;
        if (player.control.sneak) {
          player.vel.y = stopped;
        } else {
          const blockBelow = world.getBlock(this.getOnPosLegacy(player, world));
          let newSpeed = stopped;
          if (blockBelow != null) {
            if (this.slimeBlockId === blockBelow.type) {
              newSpeed = -player.vel.y;
            } else if (this.bedId === blockBelow.type && !this.verLessThan("1.12")) {
              // BedBlock.bounceUp (1.12+): only a fall bounces, keeping 0.66F of its speed
              newSpeed = player.vel.y < 0 ? player.vel.y * -0.6600000262260437 : player.vel.y;
            }
          }
          player.vel.y = newSpeed;
        }
      }
    }

    // Entity.move steps on the block below after the landing, until 1.21.2 moved it after the whole travel
    if (this.verLessThan("1.21.2")) this.stepOn(player, world);

    // Vanilla refreshes water contact here, before travel applies friction, except in 1.21.4.
    // https://github.com/GrimAnticheat/Grim/blob/2fe3b3e5ab9bd4ea692d712712645cf38209378b/common/src/main/java/ac/grim/grimac/predictionengine/movementtick/MovementTicker.java#L172-L184
    if (!player.isInWater && this.data.version.minecraftVersion !== "1.21.4") this.fluidsAfterMove(ctx, world);

    // Rough fix for now: ignore this if we are flying. (Entity.move until 1.21.2 moved it after the whole travel)
    if (!player.flying && this.verLessThan("1.21.2")) {
      this.checkInsideBlocks(player, world, ctx.worldSettings);
    }

    // Entity.move ends by scaling the horizontal motion by the block speed factor (1.15+)
    if (!this.verLessThan("1.15")) {
      const blockSpeedFactor = this.getBlockSpeedFactor(player, world);
      player.vel.x *= blockSpeedFactor;
      player.vel.z *= blockSpeedFactor;
    }
  }

  /**
   * Entity.restituteMovementAfterCollisions (26.2+): a collided axis bounces back by the entity's restitution. Landing
   * without sneaking from a fall at least a gravity step fast takes the block's restitution (Block.getBounceRestitution)
   * instead, after undoing the part of the tick's gravity and air drag the move did not use. The vertical speed is
   * that times the restitution, so 0 without a bounce (-0 rising into a ceiling, as a wall's -vx * 0).
   */
  private restituteMovementAfterCollisions(ctx: EPhysicsCtx, world: World, collisionX: boolean, collisionZ: boolean, movedY: number) {
    const player = ctx.state as PlayerState;
    const vel = player.vel;
    // LivingEntity.getEntityBounciness: the BOUNCINESS attribute (0 by default); none while sneaking (isSuppressingBounce)
    const suppressing = !!player.control.sneak;
    let restitution = suppressing ? 0 : this.syncedAttribute(player, this.bouncinessAttribute, 0);
    if (collisionX) vel.x = -vel.x * restitution;
    if (collisionZ) vel.z = -vel.z * restitution;
    if (!player.isCollidedVertically) return;
    const gravity = this.getEffectiveGravity(ctx, player);
    if (player.onGround) {
      const tooSlow = -vel.y <= gravity;
      const block = world.getBlock(this.getOnPosLegacy(player, world));
      const blockRestitution = block != null ? this.bounceRestitution.get(block.type) ?? 0 : 0;
      restitution = !tooSlow && !suppressing ? Math.max(restitution, blockRestitution) : 0;
    }
    let gravityCompensation = 0;
    let effectiveDrag = 1;
    if (restitution > 0) {
      const portionWithMovement = movedY / vel.y;
      gravityCompensation = portionWithMovement * gravity;
      // Mth.lerp(portion, 1.0, getAirDrag())
      effectiveDrag = 1 + portionWithMovement * (this.getAirDrag(player) - 1);
    }
    vel.y = (gravityCompensation - vel.y) * effectiveDrag * restitution;
  }

  /**
   * Entity.getOnPosLegacy: the block landed and stepped on, 0.2F under the feet. From 1.20 in the supporting block's
   * column (the supporting block itself when it is a fence, wall or fence gate); before, a fence, wall or fence gate
   * under an air block.
   */
  protected getOnPosLegacy(player: PlayerState, world: World): Vec3 {
    const y = Math.floor(player.pos.y - 0.20000000298023224);
    const fenceLike = (block: Block | null) => block != null && /(^|_)fence$|_wall$|fence_gate$/.test(block.name);
    const support = player.supportingBlockPos;
    if (support != null) {
      return fenceLike(world.getBlock(support)) ? support : new Vec3(support.x, y, support.z);
    }
    const pos = new Vec3(Math.floor(player.pos.x), y, Math.floor(player.pos.z));
    if (this.verLessThan("1.20") && /^(air|cave_air|void_air)$/.test(world.getBlock(pos)?.name ?? "")) {
      const below = pos.offset(0, -1, 0);
      if (fenceLike(world.getBlock(below))) return below;
    }
    return pos;
  }

  /**
   * Block.stepOn of the block below (getOnPosLegacy) while on ground. SlimeBlock's: unless sneaking, a vertical speed
   * under 0.1 scales the horizontal motion by 0.4 + |vy| * 0.2.
   */
  private stepOn(player: PlayerState, world: World) {
    if (!player.onGround || player.control.sneak) return;
    const block = world.getBlock(this.getOnPosLegacy(player, world));
    if (block == null || block.type !== this.slimeBlockId) return;
    const speedY = Math.abs(player.vel.y);
    if (speedY < 0.1) {
      const factor = 0.4 + speedY * 0.2;
      player.vel.x *= factor;
      player.vel.z *= factor;
    }
  }

  /** Whether the chunk column under the player is loaded: its x, z cast to int on 1.8, floored since. */
  private columnLoaded(player: PlayerState, world: World): boolean {
    const round = this.verLessThan("1.9") ? Math.trunc : Math.floor;
    return world.getBlock(new Vec3(round(player.pos.x), 0, round(player.pos.z))) != null;
  }

  /**
   * Entity.getBlockSpeedFactor: the speed factor (0.4F for soul sand and honey) of the block the player is in, or
   * when that is 1, of the block below that affects its movement (not when it is in water or a bubble column).
   * LivingEntity's: 1.16 - 1.20 ignore it on a soul speed block with Soul Speed; since 1.21 it is lerped toward 1 by
   * the movement efficiency attribute, in float.
   */
  protected getBlockSpeedFactor(player: PlayerState, world: World): number {
    const f32 = Math.fround;
    const speedFactor = (block: Block | null) =>
      block != null && (block.type === this.soulsandId || block.type === this.honeyblockId) ? f32(0.4) : 1;
    const feet = world.getBlock(player.pos);
    let factor = speedFactor(feet);
    const below = world.getBlock(this.getBlockBelowAffectingMovement(player, world));
    if (factor === 1 && !(feet != null && (feet.type === this.waterId || feet.type === this.bubblecolumnId))) {
      factor = speedFactor(below);
    }
    if (this.verLessThan("1.21")) {
      const onSoulSpeedBlock = below != null && (below.type === this.soulsandId || below.name === "soul_soil");
      return onSoulSpeedBlock && player.soulSpeed > 0 ? 1 : factor;
    }
    const synced = player.attributes[this.movementEfficiencyAttribute];
    const efficiency = synced ? f32(this.attributeValue(this.movementEfficiencyAttribute, synced)) : 0;
    return f32(factor + f32(efficiency * f32(1 - factor)));
  }

  /**
   * LocalPlayer.isHorizontalCollisionMinor (1.18+): the collided movement turns less than 8 degrees from the input
   * direction (xxa, zza turned by Mth.sin/cos of the float yaw), so a sprint grazing a wall goes on.
   */
  isCollidedHorizontallyMinor(state: IEntityState, movement: Vec3): boolean {
    if (!(state instanceof PlayerState) || this.verLessThan("1.18")) return false;
    const yaw = floatRadians(this.yawDegrees(state));
    const sin = this.mth.sin(yaw);
    const cos = this.mth.cos(yaw);
    const xxa = state.heading.strafe;
    const zza = state.heading.forward;
    const inputX = xxa * cos - zza * sin;
    const inputZ = zza * cos + xxa * sin;
    const inputSqr = inputX * inputX + inputZ * inputZ;
    const movementSqr = movement.x * movement.x + movement.z * movement.z;
    // (1.0E-5F)
    if (inputSqr < 9.999999747378752e-6 || movementSqr < 9.999999747378752e-6) return false;
    const angle = Math.acos((inputX * movement.x + inputZ * movement.z) / Math.sqrt(inputSqr * movementSqr));
    return angle < 0.13962633907794952; // (double)0.13962634F
  }

  checkInsideBlocks(player: PlayerState, world: World, worldSettings = new PhysicsWorldSettings(this.data)) {
    if (!this.verLessThan("1.21.5")) {
      for (const { pos, intersects } of this.blocksInsideAlongMove(player)) {
        const block = world.getBlock(pos);
        if (block != null && block.type !== this.airId) this.entityInside(player, world, pos, block, worldSettings, intersects);
      }
      return;
    }
    // 1.14 - 1.15: Entity.move clears isInLava before the blocks' entityInside, a lava block's sets it again
    if (!this.verLessThan("1.14") && this.verLessThan("1.16")) player.isInLava = false;
    // the box shrunk by 0.001 before 1.19.3, by 1e-7 until 1.21.2, then by 1e-5F (boxTraverseBlocks)
    const inset = this.verLessThan("1.19.3") ? 0.001 : this.verLessThan("1.21.2") ? 1e-7 : 9.999999747378752e-6;
    // the box the move left (before 1.17 vanilla keeps it, with its pre-1.14 sneaking height of 1.65F)
    const aabb = this.boundingBoxForMove(player).bb.expand(-inset, -inset, -inset);
    const [minAABB, maxAABB] = aabb.minAndMaxArrays();
    const [x0, y0, z0] = minAABB.map(Math.floor);
    const [x1, y1, z1] = maxAABB.map(Math.floor);
    const visit = (x: number, y: number, z: number) => {
      const blockPos = new Vec3(x, y, z);
      const block = world.getBlock(blockPos);
      if (block != null) this.entityInside(player, world, blockPos, block, worldSettings, true);
    };
    if (this.verLessThan("1.21.2")) {
      // Entity.checkInsideBlocks: x, then y, then z innermost
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) visit(x, y, z);
    } else {
      // BlockPos.betweenClosed of the box (BlockGetter.boxTraverseBlocks): z, then y, then x innermost
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) visit(x, y, z);
    }
  }

  /**
   * The blocks Entity.checkInsideBlocks visits from 1.21.5, each once, in order: the tick's move (else the tick start
   * to the position) split per axis (axisStepOrder of the move made, of the requested move from 1.21.9), and for each
   * step the blocks BlockGetter.forEachBlockIntersectedBetween visits with the box at its end: before 1.21.9 those of
   * that box (a step of a block or more is not modeled further). `intersects` is the flag 1.21.10+ pass to
   * entityInside: a step of about a block or more, or a block the box at the end overlaps.
   */
  private blocksInsideAlongMove(player: PlayerState): { pos: Vec3; intersects: boolean }[] {
    const visits: { pos: Vec3; intersects: boolean }[] = [];
    const visited = new Set<string>();
    const move = this.recordedMove ?? { from: this.tickStartPos ?? player.pos, to: player.pos, movement: null };
    const steps: [Vec3, Vec3][] = [];
    const delta = move.to.minus(move.from);
    if (move.movement != null && delta.norm() ** 2 > 0) {
      const axes = this.verLessThan("1.21.9") ? delta : move.movement;
      const order: ("x" | "y" | "z")[] = Math.abs(axes.x) < Math.abs(axes.z) ? ["y", "z", "x"] : ["y", "x", "z"];
      let from = move.from;
      for (const axis of order) {
        if (delta[axis] === 0) continue;
        const to = from.clone();
        to[axis] += delta[axis];
        steps.push([from, to]);
        from = to;
      }
    } else {
      steps.push([move.from, move.to]);
    }
    for (const [from, to] of steps) {
      const box = getCollider(player.pose, to).expand(-9.999999747378752e-6, -9.999999747378752e-6, -9.999999747378752e-6);
      const long = from.distanceSquared(to) > 0.9999900000002526 * 0.9999900000002526;
      const visitStep = this.verLessThan("1.21.9")
        ? (visit: (pos: Vec3) => void) => this.forEachBlockIntersectedBetween(to, to, box, visit)
        : (visit: (pos: Vec3) => void) => this.forEachBlockIntersectedBetween(from, to, box, visit);
      visitStep((pos) => {
        const key = `${pos.x},${pos.y},${pos.z}`;
        if (visited.has(key)) return;
        visited.add(key);
        const overlaps =
          box.minX < pos.x + 1 && box.maxX > pos.x && box.minY < pos.y + 1 && box.maxY > pos.y && box.minZ < pos.z + 1 && box.maxZ > pos.z;
        visits.push({ pos, intersects: long || overlaps });
      });
    }
    return visits;
  }

  /**
   * BlockGetter.forEachBlockIntersectedBetween (1.21.9+): without a move the box's blocks; else the blocks of the box
   * at the start, those swept along the travel, then those of the box at the end, each along the move.
   */
  private forEachBlockIntersectedBetween(from: Vec3, to: Vec3, box: AABB, visit: (pos: Vec3) => void) {
    const d = to.minus(from);
    const f32 = Math.fround;
    const corners = (bb: AABB) => [
      Math.floor(bb.minX),
      Math.floor(bb.minY),
      Math.floor(bb.minZ),
      Math.floor(bb.maxX),
      Math.floor(bb.maxY),
      Math.floor(bb.maxZ),
    ];
    if (d.norm() ** 2 < f32(f32(1e-5) * f32(1e-5))) {
      const [x0, y0, z0, x1, y1, z1] = corners(box);
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) visit(new Vec3(x, y, z));
      return;
    }
    const seen = new Set<string>();
    const key = (p: Vec3) => `${p.x},${p.y},${p.z}`;
    const start = box.clone().translate(-d.x, -d.y, -d.z);
    for (const pos of this.betweenCornersInDirection(corners(start), d)) {
      visit(pos);
      seen.add(key(pos));
    }
    this.addCollisionsAlongTravel(seen, d, box, visit);
    for (const pos of this.betweenCornersInDirection(corners(box), d)) {
      if (!seen.has(key(pos))) {
        seen.add(key(pos));
        visit(pos);
      }
    }
  }

  /** BlockPos.betweenCornersInDirection: Y planes first, then by Direction.axisStepOrder, each along the direction. */
  private betweenCornersInDirection([x0, y0, z0, x1, y1, z1]: number[], d: Vec3): Vec3[] {
    const order: ("x" | "y" | "z")[] = Math.abs(d.x) < Math.abs(d.z) ? ["y", "z", "x"] : ["y", "x", "z"];
    const min = { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) };
    const max = { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) };
    const startOf = (a: "x" | "y" | "z") => (d[a] >= 0 ? min[a] : max[a]);
    const stepOf = (a: "x" | "y" | "z") => (d[a] >= 0 ? 1 : -1);
    const out: Vec3[] = [];
    const [a, b, c] = order;
    for (let i = 0; i <= max[a] - min[a]; i++) {
      for (let j = 0; j <= max[b] - min[b]; j++) {
        for (let k = 0; k <= max[c] - min[c]; k++) {
          const p = { x: 0, y: 0, z: 0 };
          p[a] = startOf(a) + stepOf(a) * i;
          p[b] = startOf(b) + stepOf(b) * j;
          p[c] = startOf(c) + stepOf(c) * k;
          out.push(new Vec3(p.x, p.y, p.z));
        }
      }
    }
    return out;
  }

  /** BlockGetter.addCollisionsAlongTravel (1.21.9+): the blocks the box sweeps, cell by cell along the move. */
  private addCollisionsAlongTravel(seen: Set<string>, d: Vec3, box: AABB, visit: (pos: Vec3) => void) {
    const sx = box.maxX - box.minX;
    const sy = box.maxY - box.minY;
    const sz = box.maxZ - box.minZ;
    // getFurthestCorner
    const ax = Math.abs(d.x);
    const ay = Math.abs(d.y);
    const az = Math.abs(d.z);
    const gx = d.x >= 0 ? 1 : -1;
    const gy = d.y >= 0 ? 1 : -1;
    const gz = d.z >= 0 ? 1 : -1;
    const corner = ax <= ay && ax <= az ? [-gx, -gz, gy] : ay <= az ? [gz, -gy, -gx] : [-gy, gx, -gz];
    const center = new Vec3((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
    const end = new Vec3(center.x + sx * 0.5 * corner[0], center.y + sy * 0.5 * corner[1], center.z + sz * 0.5 * corner[2]);
    const begin = end.minus(d);
    let x = Math.floor(begin.x);
    let y = Math.floor(begin.y);
    let z = Math.floor(begin.z);
    const stepX = Math.sign(d.x);
    const stepY = Math.sign(d.y);
    const stepZ = Math.sign(d.z);
    const frac = (v: number) => v - Math.floor(v);
    const dx = stepX === 0 ? Number.MAX_VALUE : stepX / d.x;
    const dy = stepY === 0 ? Number.MAX_VALUE : stepY / d.y;
    const dz = stepZ === 0 ? Number.MAX_VALUE : stepZ / d.z;
    let tx = dx * (stepX > 0 ? 1 - frac(begin.x) : frac(begin.x));
    let ty = dy * (stepY > 0 ? 1 - frac(begin.y) : frac(begin.y));
    let tz = dz * (stepZ > 0 ? 1 - frac(begin.z) : frac(begin.z));
    const clamp = (v: number, lo: number) => Math.min(Math.max(v, lo + 9.999999747378752e-6), lo + 1 - 9.999999747378752e-6);
    while (tx <= 1 || ty <= 1 || tz <= 1) {
      if (tx < ty) {
        if (tx < tz) {
          x += stepX;
          tx += dx;
        } else {
          z += stepZ;
          tz += dz;
        }
      } else if (ty < tz) {
        y += stepY;
        ty += dy;
      } else {
        z += stepZ;
        tz += dz;
      }
      const hit = this.clipSegment([x, y, z, x + 1, y + 1, z + 1], begin, end);
      if (hit == null) continue;
      const ox = Math.floor(clamp(hit.x, x) - sx * corner[0]);
      const oy = Math.floor(clamp(hit.y, y) - sy * corner[1]);
      const oz = Math.floor(clamp(hit.z, z) - sz * corner[2]);
      for (const pos of this.betweenCornersInDirection([x, y, z, ox, oy, oz], d)) {
        const k = `${pos.x},${pos.y},${pos.z}`;
        if (!seen.has(k)) {
          seen.add(k);
          visit(pos);
        }
      }
    }
  }

  /** AABB.clip: where the segment enters the box through a face it moves toward, if it does. */
  private clipSegment([x0, y0, z0, x1, y1, z1]: number[], from: Vec3, to: Vec3): Vec3 | null {
    const d = to.minus(from);
    let t = 1.0;
    let hit = false;
    // AABB.clipPoint: the plane of a face, the other two axes within the face (1e-7 slack)
    const face = (plane: number, along: number, o: number, u: number, du: number, v: number, dv: number, uRange: number[], vRange: number[]) => {
      const s = (plane - o) / along;
      const pu = u + s * du;
      const pv = v + s * dv;
      if (0.0 < s && s < t && uRange[0] - 1e-7 < pu && pu < uRange[1] + 1e-7 && vRange[0] - 1e-7 < pv && pv < vRange[1] + 1e-7) {
        t = s;
        hit = true;
      }
    };
    if (d.x > 1e-7) face(x0, d.x, from.x, from.y, d.y, from.z, d.z, [y0, y1], [z0, z1]);
    else if (d.x < -1e-7) face(x1, d.x, from.x, from.y, d.y, from.z, d.z, [y0, y1], [z0, z1]);
    if (d.y > 1e-7) face(y0, d.y, from.y, from.z, d.z, from.x, d.x, [z0, z1], [x0, x1]);
    else if (d.y < -1e-7) face(y1, d.y, from.y, from.z, d.z, from.x, d.x, [z0, z1], [x0, x1]);
    if (d.z > 1e-7) face(z0, d.z, from.z, from.x, d.x, from.y, d.y, [x0, x1], [y0, y1]);
    else if (d.z < -1e-7) face(z1, d.z, from.z, from.x, d.x, from.y, d.y, [x0, x1], [y0, y1]);
    return hit ? from.plus(d.scaled(t)) : null;
  }

  /** Block.entityInside of the blocks the engine models; `intersects` is the flag 1.21.10+ pass. */
  private entityInside(
    player: PlayerState,
    world: World,
    blockPos: Vec3,
    block: Block,
    worldSettings: PhysicsWorldSettings,
    intersects: boolean
  ) {
    if (this.lavaId === block.type) {
      // LiquidBlock.entityInside (1.14 - 1.15): any lava block the box is in, whatever its level
      if (!this.verLessThan("1.14") && this.verLessThan("1.16")) player.isInLava = true;
    } else if (this.webId === block.type) {
      // WebBlock::entityInside
      player.stuckSpeedMultiplier = new Vec3(0.25, 0.05000000074505806, 0.25);
      player.fallDistance = 0; // makeStuckInBlock
    } else if (this.bubblecolumnId === block.type) {
      if (!intersects && !this.verLessThan("1.21.10")) return;
      const down = !block.metadata;
      const aboveBlock = world.getBlock(blockPos.offset(0, 1, 0));
      const bubbleDrag =
        aboveBlock?.type === this.airId
          ? worldSettings.bubbleColumnSurfaceDrag
          : worldSettings.bubbleColumnDrag;
      if (down) {
        player.vel.y = Math.max(bubbleDrag.maxDown, player.vel.y - bubbleDrag.down);
      } else {
        player.vel.y = Math.min(bubbleDrag.maxUp, player.vel.y + bubbleDrag.up);
      }
    } else if (this.honeyblockId === block.type) {
      // From 1.21.2 the block runs after travel's gravity and drag: HoneyBlock undoes them to read the motion
      // (getOldDeltaY) and applies them to what it sets (getNewDeltaY)
      const afterTravel = !this.verLessThan("1.21.2");
      const oldDeltaY = (vy: number) => (afterTravel ? vy / 0.9800000190734863 + 0.08 : vy);
      const newDeltaY = (vy: number) => (afterTravel ? (vy - 0.08) * 0.9800000190734863 : vy);
      // Check if sliding down on the side of the block
      if (
        !player.onGround &&
        player.pos.y <= blockPos.y + 0.9375 - 1e-7 &&
        oldDeltaY(player.vel.y) < -0.08 &&
        (Math.abs(blockPos.x + 0.5 - player.pos.x) + 1e-7 > 0.4375 + player.halfWidth ||
          Math.abs(blockPos.z + 0.5 - player.pos.z) + 1e-7 > 0.4375 + player.halfWidth)
      ) {
        if (oldDeltaY(player.vel.y) < -0.13) {
          const factor = -0.05 / oldDeltaY(player.vel.y); // magic number.
          player.vel.x *= factor;
          player.vel.z *= factor;
          player.vel.y = newDeltaY(-0.05); // magic number.
        } else {
          player.vel.y = newDeltaY(-0.05); // magic number.
        }
      }
    } else if (this.soulsandId === block.type && this.verLessThan("1.15")) {
      // SoulSandBlock::entityInside before the block speed factor: each soul sand block touched slows by 0.4D
      player.vel.x *= 0.4;
      player.vel.z *= 0.4;
    } else if (this.berryBushId === block.type) {
      // BerryBushBlock::entityInside
      player.stuckSpeedMultiplier = new Vec3(0.800000011920929, 0.75, 0.800000011920929); // magic number
      player.fallDistance = 0; // makeStuckInBlock
    } else if (this.powderSnowId === block.type) {
      // PowderSnowBlock::entityInside
      player.isInPowderSnow = true;
      const feetBlock = world.getBlock(new Vec3(player.pos.x, player.pos.y, player.pos.z));
      if (feetBlock && this.powderSnowId === feetBlock.type) {
        player.stuckSpeedMultiplier = new Vec3(0.8999999761581421, 1.5, 0.8999999761581421);
        player.fallDistance = 0; // makeStuckInBlock
      }
    }
  }

  /**
   * Entity.move's collision before 1.14 (1.8 - 1.13.2): against the boxes the requested move sweeps, the box moves on
   * y, then x, then z. When it hit something horizontally while on the ground (or landing) it also tries the move
   * raised by the step height, rising against the box swept by the requested x and z and against the box itself, keeps
   * the longer horizontal one, settles it down and keeps it only if it goes farther than the first.
   * Returns the moved box and the movement it made.
   */
  private legacyCollide(world: World, bb: AABB, requested: Vec3, stepHeight: number, onGround: boolean, others: (swept: AABB) => AABB[] = () => []) {
    const { x: m, y: n, z: o } = requested;
    const colliders = this.legacyColliders(world, bb, m, n, o, others);
    let box = bb;
    let x = m;
    let y = n;
    let z = o;
    if (y !== 0) {
      y = this.legacyAxisOffset(1, box, colliders, y);
      box = box.moveCoords(0, y, 0);
    }
    if (x !== 0) {
      x = this.legacyAxisOffset(0, box, colliders, x);
      if (x !== 0) box = box.moveCoords(x, 0, 0);
    }
    if (z !== 0) {
      z = this.legacyAxisOffset(2, box, colliders, z);
      if (z !== 0) box = box.moveCoords(0, 0, z);
    }

    const landing = onGround || (n !== y && n < 0);
    if (stepHeight > 0 && landing && (m !== x || o !== z)) {
      const stepColliders = this.legacyColliders(world, bb, m, stepHeight, o, others);
      const across = (start: AABB, rise: number) => {
        const raised = start.moveCoords(0, rise, 0);
        const dx = this.legacyAxisOffset(0, raised, stepColliders, m);
        const movedX = raised.moveCoords(dx, 0, 0);
        const dz = this.legacyAxisOffset(2, movedX, stepColliders, o);
        return { box: movedX.moveCoords(0, 0, dz), x: dx, y: rise, z: dz };
      };
      // the rise against the box swept by the requested x and z, then against the box itself
      const swept = across(bb, this.legacyAxisOffset(1, bb.expandTowardsCoords(m, 0, o), stepColliders, stepHeight));
      const plain = across(bb, this.legacyAxisOffset(1, bb, stepColliders, stepHeight));
      const stepped = swept.x * swept.x + swept.z * swept.z > plain.x * plain.x + plain.z * plain.z ? swept : plain;
      const down = this.legacyAxisOffset(1, stepped.box, stepColliders, -stepped.y);
      if (x * x + z * z < stepped.x * stepped.x + stepped.z * stepped.z) {
        box = stepped.box.moveCoords(0, down, 0);
        x = stepped.x;
        y = down;
        z = stepped.z;
      }
    }
    return { bb: box, movement: new Vec3(x, y, z) };
  }

  /**
   * The block boxes a move of bb by (x, y, z) can meet before 1.14: World.getCollisionBoxes, the boxes intersecting the
   * swept box, a block outside the world border counting as stone. 1.13's IWorldReaderBase sweeps a box grown by 1e-7,
   * leaves out the blocks bb already reaches into and lists the partial block shapes before the full cubes.
   */
  private legacyColliders(world: World, bb: AABB, x: number, y: number, z: number, others: (swept: AABB) => AABB[] = () => []): AABB[] {
    const swept = bb.expandTowardsCoords(x, y, z);
    const voxels = !this.verLessThan("1.13");
    const query = voxels ? swept.clone().expand(COLLISION_EPSILON, COLLISION_EPSILON, COLLISION_EPSILON) : swept;
    const inside = bb.clone().expand(-COLLISION_EPSILON, -COLLISION_EPSILON, -COLLISION_EPSILON);
    const outsideBorder = (cx: number, cz: number) =>
      cx < -WORLD_BORDER_RADIUS || cx >= WORLD_BORDER_RADIUS || cz < -WORLD_BORDER_RADIUS || cz >= WORLD_BORDER_RADIUS;
    const partial: AABB[] = [];
    const full: AABB[] = [];
    const cursor = new Vec3(0, 0, 0);
    for (cursor.y = Math.floor(query.minY) - 1; cursor.y <= Math.floor(query.maxY); ++cursor.y) {
      for (cursor.z = Math.floor(query.minZ); cursor.z <= Math.floor(query.maxZ); ++cursor.z) {
        for (cursor.x = Math.floor(query.minX); cursor.x <= Math.floor(query.maxX); ++cursor.x) {
          const block = world.getBlock(cursor) as Block | null;
          const shapes = outsideBorder(cursor.x, cursor.z) ? [[0, 0, 0, 1, 1, 1]] : block ? this.collisionShapes(block, cursor, world) : [];
          const boxes = shapes.map((shape) => new AABB(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5]).translate(cursor.x, cursor.y, cursor.z));
          if (!voxels) {
            partial.push(...boxes.filter((box) => box.intersects(query)));
            continue;
          }
          if (boxes.some((box) => box.intersects(inside)) || !boxes.some((box) => box.intersects(query))) continue;
          const isFullCube = shapes.length === 1 && shapes[0].every((v, i) => v === (i < 3 ? 0 : 1));
          (isFullCube ? full : partial).push(...boxes);
        }
      }
    }
    return [...partial, ...full, ...others(swept)];
  }

  /**
   * The distance a box moves along an axis before it meets the colliders: AxisAlignedBB.calculateX/Y/ZOffset before
   * 1.13 (no epsilon), VoxelShapes.calculateMaxOffset on 1.13 (faces within 1e-7, moves under 1e-7 dropped).
   */
  private legacyAxisOffset(axis: number, bb: AABB, colliders: AABB[], distance: number): number {
    if (!this.verLessThan("1.13")) {
      for (const collider of colliders) {
        if (Math.abs(distance) < COLLISION_EPSILON) return 0;
        distance = this.voxelShapeCollide(axis, bb, distance, [collider]);
      }
      return distance;
    }
    const [min, max] = bb.minAndMaxArrays();
    const axis1 = (axis + 1) % 3;
    const axis2 = (axis + 2) % 3;
    for (const collider of colliders) {
      const [cMin, cMax] = collider.minAndMaxArrays();
      if (max[axis1] <= cMin[axis1] || min[axis1] >= cMax[axis1] || max[axis2] <= cMin[axis2] || min[axis2] >= cMax[axis2]) continue;
      if (distance > 0 && max[axis] <= cMin[axis]) {
        distance = Math.min(distance, cMin[axis] - max[axis]);
      } else if (distance < 0 && min[axis] >= cMax[axis]) {
        distance = Math.max(distance, cMax[axis] - min[axis]);
      }
    }
    return distance;
  }

  /**
   * Entity.collide's step up from 1.21: from the box (moved by the landing first), try the heights of the collider
   * faces within the step height (float, lowest first, skipping the landing's own), keeping the first that goes
   * further horizontally than the plain collision. A block's faces are its voxel shape's y coordinates: the grid
   * lines of a box aligned to eighths, else the box's bottom and top.
   */
  private stepUp(world: World, bb: AABB, movement: Vec3, collided: Vec3, landing: boolean, maxUpStep: number, others: AABB[] = []): Vec3 {
    const f32 = Math.fround;
    const stepHeight = f32(maxUpStep);
    const start = landing ? bb.move(new Vec3(0, collided.y, 0)) : bb;
    let query = start.expandTowardsCoords(movement.x, stepHeight, movement.z);
    if (!landing) query = query.expandTowardsCoords(0, -9.999999747378752e-6, 0);

    const colliders: AABB[] = [];
    const heights = new Set<number>();
    const landingHeight = f32(collided.y);
    const bits = (min: number, max: number) => {
      for (let b = 0; b <= 3; b++) {
        const n = 1 << b;
        if (Number.isInteger(min * n) && Number.isInteger(max * n)) return b;
      }
      return -1;
    };
    const cursor = new Vec3(0, 0, 0);
    for (cursor.y = Math.floor(query.minY - 1e-7) - 1; cursor.y <= Math.floor(query.maxY + 1e-7) + 1; cursor.y++) {
      for (cursor.z = Math.floor(query.minZ - 1e-7) - 1; cursor.z <= Math.floor(query.maxZ + 1e-7) + 1; cursor.z++) {
        for (cursor.x = Math.floor(query.minX - 1e-7) - 1; cursor.x <= Math.floor(query.maxX + 1e-7) + 1; cursor.x++) {
          const block = world.getBlock(cursor);
          if (block == null) continue;
          const shapes = this.collisionShapes(block, cursor, world);
          if (shapes.length === 0) continue;
          const boxes = shapes.map((shape) => AABB.fromShape(shape).translate(cursor.x, cursor.y, cursor.z));
          if (!boxes.some((box) => box.intersects(query))) continue;
          colliders.push(...boxes);
          for (const [minX, minY, minZ, maxX, maxY, maxZ] of shapes) {
            const yBits = bits(minY, maxY);
            const faces = yBits >= 0 && bits(minX, maxX) >= 0 && bits(minZ, maxZ) >= 0
              ? Array.from({ length: (1 << yBits) + 1 }, (_, i) => i / (1 << yBits))
              : [minY, maxY];
            for (const face of faces) {
              const height = f32(cursor.y + face - start.minY);
              if (height < 0 || height === landingHeight) continue;
              if (height > stepHeight) break;
              heights.add(height);
            }
          }
        }
      }
    }
    colliders.push(...this.worldBorderColliders(bb, query));

    // the entity colliders, solid boxes with faces at their bottom and top
    for (const other of others) {
      colliders.push(other);
      for (const face of [other.minY, other.maxY]) {
        const height = f32(face - start.minY);
        if (height >= 0 && height !== landingHeight && height <= stepHeight) heights.add(height);
      }
    }

    const horizontalSqr = (vec: Vec3) => vec.x * vec.x + vec.z * vec.z;
    for (const height of [...heights].sort((a, b) => a - b)) {
      const stepped = this.collideWithShapes(new Vec3(movement.x, height, movement.z), start, colliders);
      if (horizontalSqr(stepped) > horizontalSqr(collided)) {
        return stepped.offset(0, start.minY - bb.minY, 0);
      }
    }
    return collided;
  }

  /**
   * The world border as colliders (1.14+): everything outside the default border (centre 0, 0, size 5.9999968E7; the
   * engine does not know the server's), from the block-aligned bounds. 1.14 - 1.17 (Entity.collide) add it unless the
   * box, deflated by 1e-7, already reaches outside; 1.18+ (Entity.collectColliders) when the entity is inside and
   * close to it (WorldBorder.isInsideCloseToBorder of the swept box).
   */
  private worldBorderColliders(bb: AABB, query: AABB): AABB[] {
    if (this.verLessThan("1.14")) return [];
    const size = 5.9999968e7;
    const minX = Math.floor(Math.max(-size / 2, -29999984));
    const maxX = Math.ceil(Math.min(size / 2, 29999984));
    const minZ = minX;
    const maxZ = maxX;
    if (this.verLessThan("1.18")) {
      const e = 1e-7;
      if (bb.minX + e < minX || bb.maxX - e > maxX || bb.minZ + e < minZ || bb.maxZ - e > maxZ) return [];
    } else {
      const entity = this.collider;
      if (entity == null) return [];
      const margin = Math.max(Math.max(query.maxX - query.minX, query.maxZ - query.minZ), 1.0);
      const { x, z } = entity.pos;
      const distance = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
      const within = x > minX - margin && x < maxX + margin && z > minZ - margin && z < maxZ + margin;
      if (!(distance < margin * 2.0 && within)) return [];
    }
    const inf = Infinity;
    return [
      new AABB(-inf, -inf, -inf, minX, inf, inf),
      new AABB(maxX, -inf, -inf, inf, inf, inf),
      new AABB(-inf, -inf, -inf, inf, inf, minZ),
      new AABB(-inf, -inf, maxZ, inf, inf, inf),
    ];
  }

  /**
   * The colliders other than blocks a move sweeping `swept` can meet (Level.getEntityCollisions): the boxes of the boats
   * and shulkers near the player (Boat / Shulker canBeCollidedWith, getCollideBox before 1.16, World.getCollisionBoxes
   * before 1.14) that meet the swept box, grown by 1e-7 since 1.14. They are solid like blocks. A grown happy ghast
   * (1.21.6+) is solid on its still timeout, and on the client to a player whose feet are at or above its top
   * (HappyGhast.canBeCollidedWith): the rider who got off stands on it.
   */
  private otherColliders(player: PlayerState, swept: AABB): AABB[] {
    const query = this.verLessThan("1.14") ? swept : swept.clone().expand(1e-7, 1e-7, 1e-7);
    const solid = (other: PlayerState["nearbyEntities"][number]) => {
      if (isBoatName(other.name) || other.name === "shulker") return true;
      if (other.name !== "happy_ghast" || other.baby) return false;
      return player.pos.y >= other.boundingBox.maxY || !!other.staysStill;
    };
    return player.nearbyEntities
      .filter((other) => solid(other) && query.intersects(other.boundingBox))
      .map(({ boundingBox: b }) => new AABB(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ));
  }

  collideBoundingBox(world: World, bb: AABB, movement: Vec3, colliders: AABB[] = []): Vec3 {
    const queryBB = bb.expandTowards(movement);

    const combinedColliders = [...colliders, ...this.worldBorderColliders(bb, queryBB)];

    const blockCollisions = this.getSurroundingBBs(queryBB, world);
    for (const block of blockCollisions) {
      combinedColliders.push(block);
    }

    // console.log('queryBB', queryBB, combinedColliders.length)

    return this.collideWithShapes(movement, bb, combinedColliders);
  }


  private collideWithShapes(movement: Vec3, bb: AABB, colliders: AABB[] = []): Vec3 {
    if (colliders.length === 0) {
      return movement;
    }

    let dx = movement.x;
    let dy = movement.y;
    let dz = movement.z;

    if (dy !== 0.0) {
      dy = this.shapeCollide(1, bb, colliders, dy);
      if (dy !== 0.0) {
        bb = bb.moveCoords(0, dy, 0);
      }
    }

    const prioritizeZ = Math.abs(dx) < Math.abs(dz);
    if (prioritizeZ && dz !== 0.0) {
      dz = this.shapeCollide(2, bb, colliders, dz);
      if (dz !== 0.0) {
        bb = bb.moveCoords(0, 0, dz);
      }
    }

    if (dx !== 0.0) {
      dx = this.shapeCollide(0, bb, colliders, dx);
      if (!prioritizeZ && dx !== 0.0) {
        bb = bb.moveCoords(dx, 0, 0);
      }
    }

    if (!prioritizeZ && dz !== 0.0) {
      dz = this.shapeCollide(2, bb, colliders, dz);
    }

    // console.log('shift', dx, dy, dz)

    return new Vec3(dx, dy, dz);
  }

  /**
   * Shapes.collide: the shapes one after another, a motion under 1.0E-7 before the next one is none (1.18+); 1.14 -
   * 1.17's walk over the blocks drops it after each block, the last one too. A box reaching under 1.0E-7 into a block
   * is pushed out by that much at most (VoxelShape.collideX), which this drops.
   */
  shapeCollide(axis: number, bb: AABB, colliders: AABB[], movement: number): number {
    if (Math.abs(movement) < COLLISION_EPSILON) return 0.0;
    for (const collider of colliders) {
      if (Math.abs(movement) < COLLISION_EPSILON) return 0.0;
      movement = this.voxelShapeCollide(axis, bb, movement, [collider]);
    }
    return Math.abs(movement) < COLLISION_EPSILON && this.verLessThan("1.18") ? 0.0 : movement;
  }



  /**
 * Handles collision detection and response along a single axis.
 * @param axis The axis to check for collision (0 = X, 1 = Y, 2 = Z)
 * @param bb The bounding box that's moving
 * @param movement The proposed movement amount along the specified axis
 * @param colliders Array of AABBs to check for collisions with
 * @returns The adjusted movement amount that prevents collisions
 */
  /**
   * Handles collision detection and response along a single axis.
   * @param axis The axis to check for collision (0 = X, 1 = Y, 2 = Z)
   * @param bb The bounding box that's moving
   * @param movement The proposed movement amount along the specified axis
   * @param colliders Array of AABBs to check for collisions with
   * @returns The adjusted movement amount that prevents collisions
   */
  private voxelShapeCollide(axis: number, bb: AABB, movement: number, colliders: AABB[]): number {
    if (Math.abs(movement) < COLLISION_EPSILON) {
      return 0;
    }
    if (colliders.length === 0) {
      return movement;
    }

    let adjustedMovement = movement;
    const axis1 = (axis + 1) % 3;
    const axis2 = (axis + 2) % 3;

    const getMin = (aabb: AABB, ax: number) => {
      if (ax === 0) return aabb.minX;
      if (ax === 1) return aabb.minY;
      return aabb.minZ;
    };
    const getMax = (aabb: AABB, ax: number) => {
      if (ax === 0) return aabb.maxX;
      if (ax === 1) return aabb.maxY;
      return aabb.maxZ;
    };

    for (const collider of colliders) {
      const overlapsAxis1 =
        getMax(bb, axis1) - COLLISION_EPSILON > getMin(collider, axis1) &&
        getMin(bb, axis1) + COLLISION_EPSILON < getMax(collider, axis1);
      const overlapsAxis2 =
        getMax(bb, axis2) - COLLISION_EPSILON > getMin(collider, axis2) &&
        getMin(bb, axis2) + COLLISION_EPSILON < getMax(collider, axis2);

      if (!overlapsAxis1 || !overlapsAxis2) {
        continue;
      }

      if (movement > 0) {
        const gap = getMin(collider, axis) - getMax(bb, axis);
        if (gap >= -COLLISION_EPSILON) {
          adjustedMovement = Math.min(adjustedMovement, gap);
        }
      } else {
        const gap = getMax(collider, axis) - getMin(bb, axis);
        if (gap <= COLLISION_EPSILON) {
          adjustedMovement = Math.max(adjustedMovement, gap);
        }
      }
    }

    return adjustedMovement;
  }


  collideOneAxis(movedAABB: AABB, movement: Vec3, axis: number, colliders: AABB[]) {
    const minAABB = movedAABB.minPoint().toArray();
    const maxAABB = movedAABB.maxPoint().toArray();
    const movementLst = movement.toArray();

    const thisAxis = axis % 3;
    const axis1 = (axis + 1) % 3;
    const axis2 = (axis + 2) % 3;

    for (const collider of colliders) {
      if (Math.abs(movementLst[thisAxis]) < 1e-7) {
        movementLst[thisAxis] = 0;
      }
      const minCollider = collider.minPoint().toArray();
      const maxCollider = collider.maxPoint().toArray();

      const cond1 = movementLst[thisAxis] > 0.0 && maxAABB[thisAxis] - 1e-7 <= minCollider[thisAxis];
      const cond2 = movementLst[thisAxis] < 0.0 && minAABB[thisAxis] + 1e-7 >= maxCollider[thisAxis];
      if (
        maxAABB[axis1] - 1e-7 > minCollider[axis1] &&
        minAABB[axis1] + 1e-7 < maxCollider[axis1] &&
        maxAABB[axis2] - 1e-7 > minCollider[axis2] &&
        minAABB[axis2] + 1e-7 < maxCollider[axis2]
      ) {
        if (cond1) {
          movementLst[thisAxis] = Math.min(minCollider[thisAxis] - maxAABB[thisAxis], movementLst[thisAxis]);
        } else if (cond2) {
          movementLst[thisAxis] = Math.max(maxCollider[thisAxis] - minAABB[thisAxis], movementLst[thisAxis]);
        }
      }
    }
    movement.x = movementLst[0];
    movement.y = movementLst[1];
    movement.z = movementLst[2];
    // deviation. pretty bad code but its accurate.
    movedAABB.translate(thisAxis == 0 ? movementLst[0] : 0, thisAxis == 1 ? movementLst[1] : 0, thisAxis == 2 ? movementLst[2] : 0);
  }

  applyInputs(inputStrength: number, player: PlayerState) {
    const yaw = floatRadians(this.yawDegrees(player));

    if (this.verLessThan("1.14")) {
      // Entity.moveRelative (moveFlying in 1.8 - 1.11): float arithmetic throughout
      const f32 = Math.fround;
      let strafe = f32(player.heading.strafe);
      let forward = f32(player.heading.forward);
      let length = f32(f32(strafe * strafe) + f32(forward * forward));
      if (length < f32(1.0e-4)) return;
      length = f32(Math.sqrt(length));
      if (length < 1) length = 1;
      const scale = f32(f32(inputStrength) / length);
      strafe = f32(strafe * scale);
      forward = f32(forward * scale);
      const sin = this.mth.sin(yaw);
      const cos = this.mth.cos(yaw);
      player.vel.x += f32(f32(strafe * cos) - f32(forward * sin));
      player.vel.z += f32(f32(forward * cos) + f32(strafe * sin));
      return;
    }

    // Entity.getInputVector: the float inputs as a double vector, normalized when longer than 1 (Vec3.normalize
    // took a float square root before 1.17), scaled by the speed, turned by Mth.sin/cos of the yaw
    let x = player.heading.strafe;
    let z = player.heading.forward;
    const lengthSqr = x * x + z * z;
    if (lengthSqr < 1e-7) {
      // moveRelative adds Vec3.ZERO then, which turns a -0 motion into 0
      player.vel.translate(0, 0, 0);
      return;
    }
    if (lengthSqr > 1) {
      const length = this.verLessThan("1.17") ? Math.fround(Math.sqrt(lengthSqr)) : Math.sqrt(lengthSqr);
      x /= length;
      z /= length;
    }
    x *= inputStrength;
    z *= inputStrength;
    const sin = this.mth.sin(yaw);
    const cos = this.mth.cos(yaw);
    player.vel.x += x * cos - z * sin;
    player.vel.z += z * cos + x * sin;
  }

  /**
   * The player's yaw as vanilla holds it: float degrees, keeping whole turns. Taken from the state when the bot gave
   * it (mineflayer keeps bot.entity.yawDegrees), else from the radians mineflayer converts it to.
   */
  private yawDegrees(player: PlayerState): number {
    if (player.yawDegrees != null) return player.yawDegrees;
    return Math.fround((Math.PI - player.yaw) * (180 / Math.PI));
  }

  /** The player's pitch as vanilla holds it: float degrees, positive looking down (mineflayer's radians look up). */
  private pitchDegrees(player: PlayerState): number {
    return Math.fround(-player.pitch * (180 / Math.PI));
  }

  isInClimbable(player: PlayerState, world: World): boolean {
    if (player.gameMode === "spectator") {
      return false;
    }

    const feetBlock = world.getBlock(new Vec3(player.pos.x, player.pos.y, player.pos.z));
    if (feetBlock == null) return false;
    if (this.climbableIds.has(feetBlock.type)) return true;
    // LivingEntity.trapdoorUsableAsLadder (1.9+): an open trapdoor above a ladder facing the same way
    if (this.verLessThan("1.9") || !feetBlock.name.endsWith("trapdoor")) return false;
    const trapdoor = feetBlock.getProperties();
    if (trapdoor.open !== true && trapdoor.open !== "true") return false;
    const below = world.getBlock(player.pos.offset(0, -1, 0));
    return below != null && below.type === this.ladderId && below.getProperties().facing === trapdoor.facing;
  }

  /**
   * CollisionGetter.findSupportingBlock: of the blocks whose collision shape meets the box (BlockCollisions: the cells
   * the box touches, plus the ring around them for blocks taller than a cube), the one whose centre is closest to the
   * position; on a tie, the greater position (by y, then z, then x).
   */
  getSupportingBlockPos(world: World, box: AABB, position: Vec3): Vec3 | null {
    const minX = Math.floor(box.minX - 1e-7) - 1;
    const maxX = Math.floor(box.maxX + 1e-7) + 1;
    const minY = Math.floor(box.minY - 1e-7) - 1;
    const maxY = Math.floor(box.maxY + 1e-7) + 1;
    const minZ = Math.floor(box.minZ - 1e-7) - 1;
    const maxZ = Math.floor(box.maxZ + 1e-7) + 1;
    const greater = (a: Vec3, b: Vec3) => (a.y !== b.y ? a.y > b.y : a.z !== b.z ? a.z > b.z : a.x > b.x);
    const cursor = new Vec3(0, 0, 0);
    let minDistance = Number.MAX_VALUE;
    let ret: Vec3 | null = null;
    for (cursor.z = minZ; cursor.z <= maxZ; ++cursor.z) {
      for (cursor.y = minY; cursor.y <= maxY; ++cursor.y) {
        for (cursor.x = minX; cursor.x <= maxX; ++cursor.x) {
          const edges = Number(cursor.x === minX || cursor.x === maxX) + Number(cursor.y === minY || cursor.y === maxY) +
            Number(cursor.z === minZ || cursor.z === maxZ);
          if (edges >= 2) continue; // only moving pistons count there
          const block = world.getBlock(cursor);
          if (block == null) continue;
          const shapes = this.collisionShapes(block, cursor, world).map((shape) => AABB.fromShape(shape));
          if (edges === 1 && !shapes.some((s) => s.minX < 0 || s.minY < 0 || s.minZ < 0 || s.maxX > 1 || s.maxY > 1 || s.maxZ > 1)) continue;
          if (!shapes.some((shape) => box.intersects(shape.translate(cursor.x, cursor.y, cursor.z)))) continue;
          const dx = cursor.x + 0.5 - position.x;
          const dy = cursor.y + 0.5 - position.y;
          const dz = cursor.z + 0.5 - position.z;
          const distance = dx * dx + dy * dy + dz * dz;
          if (distance < minDistance || (distance === minDistance && (ret == null || greater(cursor, ret)))) {
            ret = cursor.clone();
            minDistance = distance;
          }
        }
      }
    }
    return ret;
  }

  simulate(entity: EPhysicsCtx, world: World): IEntityState {
    entity.state.attributes ??= {}
    this.collider = entity.state instanceof PlayerState ? entity.state : null;
    try {
      this.physicsTick(entity, world);
    } finally {
      this.collider = null;
    }
    entity.state.age++;
    return entity.state;
  }
}
